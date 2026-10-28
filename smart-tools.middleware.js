// D:\Software\Magpie\agent-space-manager\smart-tools.middleware.js
// Smart Middleware: Dynamic Intent-Based MCP Tool Gateway Middleware for Magpie
// Embedded as an On/Off Feature in Agent Space Manager.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadHubConfig } from "./manager.mjs";
import { ensureBackgroundDaemon, startApiServer } from "./server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERROR_LOG_PATH = path.join(__dirname, "error.log");
const LAST_ERROR_PATH = path.join(__dirname, "LAST_ERROR.json");
const STATUS_PATH = path.join(__dirname, "STATUS.md");

if (!process.env.ASM_NO_SERVER) {
  try {
    startApiServer();
    ensureBackgroundDaemon();
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
        if (/(^|[_-])(re|reverse|binary|disasm|decompile|gdb|frida|rizin)([_-]|$)/i.test(name)) {
          if (/(reverse|binary|disassembl|decompile|pe|elf|macho|dll|exe|instruction|register|gdb|frida|rizin|assembly|opcode|demangle|symbols)/i.test(userText)) {
            isMatch = true;
          }
        } else if (name.includes("crawl") || name.includes("scrape") || name.includes("stagehand") || name.includes("crw")) {
          if (/(scrape|crawl|website|browser|webpage|url|http|extract|html|dom|click|navigate|page)/i.test(userText)) {
            isMatch = true;
          }
        } else if (name.includes("gemini") || name.includes("docs") || name.includes("knowledge")) {
          if (/(doc|documentation|api|sdk|reference|search|lookup|guide|gemini)/i.test(userText)) {
            isMatch = true;
          }
        } else if (name.includes("dart") || name.includes("flutter")) {
          if (/(dart|flutter|pubspec|widget|stateful|stateless)/i.test(userText)) {
            isMatch = true;
          }
        } else if (name.includes("bio") || name.includes("protein") || name.includes("chem") || name.includes("pdb") || name.includes("structure")) {
          if (/(protein|amino|structure|alphafold|pdb|dna|rna|gene|sequence|molecular|chembl|biology)/i.test(userText)) {
            isMatch = true;
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
