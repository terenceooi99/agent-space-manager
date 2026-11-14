// D:\Software\Magpie\agent-space-manager\smart-tools.middleware.js
// Smart Middleware: Dynamic Intent-Based MCP Tool Gateway Middleware for Magpie
// Embedded as an On/Off Feature in Agent Space Manager.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadHubConfig } from "./manager.mjs";
import { startApiServer } from "./server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERROR_LOG_PATH = path.join(__dirname, "error.log");
const LAST_ERROR_PATH = path.join(__dirname, "LAST_ERROR.json");
const STATUS_PATH = path.join(__dirname, "STATUS.md");

if (!process.env.ASM_NO_SERVER && process.env.NODE_ENV !== "test" && process.env.ASM_TEST !== "1") {
  try {
    startApiServer();
  } catch {}
}

let cachedConfig = null;
let cachedConfigAt = 0;

function getCachedHubConfig() {
  const now = Date.now();
  if (!cachedConfig || now - cachedConfigAt > 2000) {
    cachedConfig = loadHubConfig();
    cachedConfigAt = now;
  }
  return cachedConfig;
}

function recordFailure(error, contextInfo = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    message: String(error?.message || error),
    stack: String(error?.stack || ""),
    model: contextInfo.model || "unknown",
    toolCount: contextInfo.toolCount || 0,
  };

  try {
    fs.writeFileSync(LAST_ERROR_PATH, JSON.stringify(entry, null, 2), "utf8");
    const logLine = `[${timestamp}] [ERROR] ${entry.message}\n${entry.stack}\n---\n`;
    fs.appendFileSync(ERROR_LOG_PATH, logLine, "utf8");

    const statusMd =
      `# Smart Middleware Live Diagnostics\n\n` +
      `**Last Failure Recorded:** ${timestamp}\n\n` +
      `- **Error Message:** \`${entry.message}\`\n` +
      `- **Model:** \`${entry.model}\`\n` +
      `- **Initial Tools Count:** ${entry.toolCount}\n\n` +
      `### Stack Trace\n\`\`\`text\n${entry.stack}\n\`\`\`\n\n` +
      `*Log file location: \`${ERROR_LOG_PATH}\`*\n`;
    fs.writeFileSync(STATUS_PATH, statusMd, "utf8");
  } catch (err) {
    console.error("Failed to record error diagnostics:", err);
  }
}

const CORE_TOOL_REGEX = /^(read_file|write_file|edit_file|run_command|execute_command|bash|terminal|search_web|web_search|get_context|fetch)/i;

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const BUILTIN_INTENT_RULES = [
  {
    id: "reverse_engineering",
    toolPattern: /(^|[_-])(re|reverse|binary|disasm|decompile|gdb|frida|rizin)([_-]|$)/i,
    intentPattern: /(reverse|binary|disassembl|decompile|pe|elf|macho|dll|exe|instruction|register|gdb|frida|rizin|assembly|opcode|demangle|symbols)/i,
  },
  {
    id: "web_scraping",
    toolPattern: /(crawl|scrape|stagehand|crw)/i,
    intentPattern: /(scrape|crawl|website|browser|webpage|url|http|extract|html|dom|click|navigate|page)/i,
  },
  {
    id: "gemini_docs",
    toolPattern: /(gemini|docs|knowledge)/i,
    intentPattern: /(doc|documentation|api|sdk|reference|search|lookup|guide|gemini)/i,
  },
  {
    id: "dart_flutter",
    toolPattern: /(dart|flutter)/i,
    intentPattern: /(dart|flutter|pubspec|widget|stateful|stateless)/i,
  },
  {
    id: "bio_chem",
    toolPattern: /(bio|protein|chem|pdb|structure)/i,
    intentPattern: /(protein|amino|structure|alphafold|pdb|dna|rna|gene|sequence|molecular|chembl|biology)/i,
  },
];

export function compileCustomIntentRules(raw) {
  if (!raw) return [];
  const rules = [];

  const entries = Array.isArray(raw)
    ? raw
    : typeof raw === "object"
    ? Object.entries(raw).map(([key, val]) => ({ id: key, ...(val || {}) }))
    : [];

  for (const item of entries) {
    if (!item || typeof item !== "object") continue;

    let toolRegex = null;
    const rawTools = item.toolPattern || item.toolPatterns || item.tools || item.tool;
    if (rawTools instanceof RegExp) {
      toolRegex = rawTools;
    } else if (Array.isArray(rawTools) && rawTools.length > 0) {
      const parts = rawTools.map((t) => (typeof t === "string" ? escapeRegex(t.trim()) : "")).filter(Boolean);
      if (parts.length > 0) {
        toolRegex = new RegExp(`(${parts.join("|")})`, "i");
      }
    } else if (typeof rawTools === "string" && rawTools.trim()) {
      const trimmed = rawTools.trim();
      toolRegex = /[\^$|*+?]/.test(trimmed)
        ? new RegExp(trimmed, "i")
        : new RegExp(escapeRegex(trimmed), "i");
    } else if (item.id && typeof item.id === "string") {
      toolRegex = new RegExp(escapeRegex(item.id.trim()), "i");
    }

    let intentRegex = null;
    const rawIntents = item.intentPattern || item.intentKeywords || item.keywords || item.intents;
    if (rawIntents instanceof RegExp) {
      intentRegex = rawIntents;
    } else if (Array.isArray(rawIntents) && rawIntents.length > 0) {
      const parts = rawIntents.map((k) => (typeof k === "string" ? escapeRegex(k.trim()) : "")).filter(Boolean);
      if (parts.length > 0) {
        toolRegex = toolRegex || new RegExp(`(${parts.join("|")})`, "i");
        intentRegex = new RegExp(`(${parts.join("|")})`, "i");
      }
    } else if (typeof rawIntents === "string" && rawIntents.trim()) {
      const trimmed = rawIntents.trim();
      intentRegex = /[\^$|*+?]/.test(trimmed)
        ? new RegExp(trimmed, "i")
        : new RegExp(escapeRegex(trimmed), "i");
    }

    if (toolRegex && intentRegex) {
      rules.push({
        id: item.id || "custom",
        toolPattern: toolRegex,
        intentPattern: intentRegex,
      });
    }
  }

  return rules;
}

export function autoSeedMiddlewareIntents(hubRoot) {
  if (!hubRoot || !fs.existsSync(hubRoot)) return {};
  const sharedDir = path.join(hubRoot, "shared");
  const intentsPath = path.join(sharedDir, "middleware-intents.json");
  if (fs.existsSync(intentsPath)) {
    try {
      const content = fs.readFileSync(intentsPath, "utf8").trim();
      if (content) return JSON.parse(content);
    } catch {}
  }

  const pluginsDir = path.join(hubRoot, "plugins");
  if (!fs.existsSync(pluginsDir)) return {};

  const intents = {};
  try {
    const entries = fs.readdirSync(pluginsDir);
    for (const ent of entries) {
      const pluginDir = path.join(pluginsDir, ent);
      try {
        const st = fs.statSync(pluginDir);
        if (!st.isDirectory()) continue;
      } catch {
        continue;
      }

      const pluginJsonPath = path.join(pluginDir, "plugin.json");
      const mcpJsonPath = path.join(pluginDir, "mcp_config.json");
      const toolPatterns = [ent.toLowerCase()];
      const intentKeywords = new Set([ent.toLowerCase()]);

      if (fs.existsSync(pluginJsonPath)) {
        try {
          const pj = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
          if (pj.name) {
            pj.name.split(/[^a-z0-9]+/i).filter((t) => t.length > 2).forEach((t) => intentKeywords.add(t.toLowerCase()));
          }
          if (pj.description) {
            pj.description.split(/[^a-z0-9]+/i).filter((t) => t.length > 3).slice(0, 10).forEach((t) => intentKeywords.add(t.toLowerCase()));
          }
          if (pj.middleware?.intents) {
            pj.middleware.intents.forEach((i) => intentKeywords.add(String(i).toLowerCase()));
          }
        } catch {}
      }

      if (fs.existsSync(mcpJsonPath)) {
        try {
          const mcp = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));
          const servers = mcp.mcpServers || mcp.servers || {};
          for (const sName of Object.keys(servers)) {
            toolPatterns.push(sName.toLowerCase());
            sName.split(/[^a-z0-9]+/i).filter((t) => t.length > 2).forEach((t) => intentKeywords.add(t.toLowerCase()));
          }
        } catch {}
      }

      const skillsDir = path.join(pluginDir, "skills");
      if (fs.existsSync(skillsDir)) {
        try {
          for (const sEnt of fs.readdirSync(skillsDir)) {
            toolPatterns.push(sEnt.toLowerCase());
            sEnt.split(/[^a-z0-9]+/i).filter((t) => t.length > 2).forEach((t) => intentKeywords.add(t.toLowerCase()));
          }
        } catch {}
      }

      intents[ent.toLowerCase()] = {
        toolPatterns: Array.from(new Set(toolPatterns)),
        intentKeywords: Array.from(intentKeywords),
      };
    }

    if (Object.keys(intents).length > 0) {
      if (!fs.existsSync(sharedDir)) fs.mkdirSync(sharedDir, { recursive: true });
      fs.writeFileSync(intentsPath, JSON.stringify(intents, null, 2), "utf8");
    }
  } catch (err) {
    console.warn("Failed to auto-seed middleware intents:", err);
  }

  return intents;
}

export function trimMiddlewareIntent(hubRoot, pluginId) {
  if (!hubRoot || !pluginId) return false;
  const intentsPath = path.join(hubRoot, "shared", "middleware-intents.json");
  if (!fs.existsSync(intentsPath)) return false;

  try {
    const content = fs.readFileSync(intentsPath, "utf8").trim();
    if (!content) return false;
    const data = JSON.parse(content);
    const targetKey = String(pluginId).toLowerCase();
    let changed = false;

    if (data[targetKey]) {
      delete data[targetKey];
      changed = true;
    }

    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase() === targetKey) {
        delete data[k];
        changed = true;
      } else if (v && Array.isArray(v.toolPatterns)) {
        const filtered = v.toolPatterns.filter((p) => String(p).toLowerCase() !== targetKey);
        if (filtered.length !== v.toolPatterns.length) {
          if (filtered.length === 0) {
            delete data[k];
          } else {
            v.toolPatterns = filtered;
          }
          changed = true;
        }
      }
    }

    if (changed) {
      fs.writeFileSync(intentsPath, JSON.stringify(data, null, 2), "utf8");
      return true;
    }
  } catch {}
  return false;
}

let cachedUserIntents = [];
let cachedUserIntentsAt = 0;
let lastIntentsFile = null;
let lastIntentsMtime = 0;

export function getCachedUserIntents(hubConfig) {
  const now = Date.now();
  const hubRoot = hubConfig?.hubRoot;
  const intentsPath = hubRoot ? path.join(hubRoot, "shared", "middleware-intents.json") : null;

  if (now - cachedUserIntentsAt < 2000 && lastIntentsFile === intentsPath) {
    return cachedUserIntents;
  }

  cachedUserIntentsAt = now;
  lastIntentsFile = intentsPath;

  if (!intentsPath || !fs.existsSync(intentsPath)) {
    if (hubRoot && fs.existsSync(path.join(hubRoot, "plugins"))) {
      const seeded = autoSeedMiddlewareIntents(hubRoot);
      if (Object.keys(seeded).length > 0) {
        cachedUserIntents = compileCustomIntentRules(seeded);
        return cachedUserIntents;
      }
    }
    if (hubConfig?.smartMiddleware?.customIntents) {
      cachedUserIntents = compileCustomIntentRules(hubConfig.smartMiddleware.customIntents);
      return cachedUserIntents;
    }
    cachedUserIntents = [];
    return cachedUserIntents;
  }

  try {
    const stat = fs.statSync(intentsPath);
    if (stat.mtimeMs === lastIntentsMtime && cachedUserIntents.length > 0) {
      return cachedUserIntents;
    }
    lastIntentsMtime = stat.mtimeMs;

    const content = fs.readFileSync(intentsPath, "utf8").trim();
    if (!content) {
      cachedUserIntents = [];
      return cachedUserIntents;
    }

    const parsed = JSON.parse(content);
    cachedUserIntents = compileCustomIntentRules(parsed);
  } catch {
    if (!cachedUserIntents) cachedUserIntents = [];
  }

  return cachedUserIntents;
}

export function onRequest(body, ctx) {
  if (!body) return;

  const hubConfig = getCachedHubConfig();
  const isEnabled = ctx?.options?.smartMiddlewareEnabled !== undefined
    ? Boolean(ctx.options.smartMiddlewareEnabled)
    : Boolean(hubConfig?.smartMiddleware?.enabled ?? true);

  if (!isEnabled) {
    if (ctx && typeof ctx.report === "function") {
      ctx.report("bypassed", body?.tools?.length || 0);
    }
    return;
  }

  const initialToolCount = Array.isArray(body.tools) ? body.tools.length : 0;

  if (ctx && typeof ctx.report === "function") {
    ctx.report("ready", initialToolCount);
  }

  if (!Array.isArray(body.tools) || body.tools.length === 0) {
    return;
  }

  try {
    const maxSafeTools = (ctx?.options?.maxTools && Number.isInteger(ctx.options.maxTools))
      ? ctx.options.maxTools
      : (hubConfig?.smartMiddleware?.maxTools || 96);

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessages = messages.filter((m) => !m.role || m.role === "user");
    const recentMsgs = (userMessages.length > 0 ? userMessages : messages).slice(-3);

    let userText = "";
    for (const msg of recentMsgs) {
      if (typeof msg.content === "string") {
        userText += " " + msg.content.toLowerCase();
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part && typeof part.text === "string") {
            userText += " " + part.text.toLowerCase();
          }
        }
      }
    }

    const coreTools = [];
    const nonCoreTools = [];
    for (const t of body.tools) {
      const fn = t.function || t;
      const name = String(fn.name || "");
      if (CORE_TOOL_REGEX.test(name)) {
        coreTools.push(t);
      } else {
        nonCoreTools.push(t);
      }
    }

    const isPureChat = /^\s*(hi|hello|hey|yo|ping|thanks|thank you|what can you do|who are you)\s*[\.\?!]*$/i.test(userText.trim());
    if (isPureChat && body.tools.length > 15) {
      const chatTools = [...coreTools, ...nonCoreTools].slice(0, Math.min(15, maxSafeTools));
      return { ...body, tools: chatTools };
    }

    const optionIntents = ctx?.options?.customIntents
      ? compileCustomIntentRules(ctx.options.customIntents)
      : [];
    const userIntents = [...getCachedUserIntents(hubConfig), ...optionIntents];
    const allIntentRules = [...BUILTIN_INTENT_RULES, ...userIntents];

    const matchedTools = [...coreTools];
    const fallbackTools = [];

    for (const t of nonCoreTools) {
      const fn = t.function || t;
      const name = String(fn.name || "").toLowerCase();

      const nameTokens = name.split(/[^a-z0-9]+/i).filter((tok) => tok.length > 2);
      let isMatch = false;

      for (const tok of nameTokens) {
        if (userText.includes(tok)) {
          isMatch = true;
          break;
        }
      }

      if (!isMatch) {
        for (const rule of allIntentRules) {
          if (rule.toolPattern && rule.intentPattern) {
            if (rule.toolPattern.test(name) && rule.intentPattern.test(userText)) {
              isMatch = true;
              break;
            }
          }
        }
      }

      if (isMatch) {
        matchedTools.push(t);
      } else {
        fallbackTools.push(t);
      }
    }

    const finalTools = [...matchedTools, ...fallbackTools].slice(0, maxSafeTools);
    return { ...body, tools: finalTools };
  } catch (err) {
    recordFailure(err, { model: body.model, toolCount: initialToolCount });
    return { ...body, tools: body.tools.slice(0, 96) };
  }
}

export function onResponse(reply, ctx) {
  // Pass-through
}
