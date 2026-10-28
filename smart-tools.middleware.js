// D:\Software\Magpie\agent-space-manager\smart-tools.middleware.js
// Smart Middleware: Dynamic Intent-Based MCP Tool Gateway Middleware for Magpie
// Embedded as an On/Off Feature in Agent Space Manager.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadHubConfig } from "./manager.mjs";
import { startApiServer } from "./server.mjs";

try {
  startApiServer();
} catch (e) {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERROR_LOG_PATH = path.join(__dirname, "error.log");
const LAST_ERROR_PATH = path.join(__dirname, "LAST_ERROR.json");
const STATUS_PATH = path.join(__dirname, "STATUS.md");

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

export function onRequest(body, ctx) {
  if (!body) return;

  // Check feature toggle from Magpie options or hub-config.json
  const hubConfig = loadHubConfig();
  const isEnabled = ctx?.options?.smartMiddlewareEnabled !== undefined
    ? Boolean(ctx.options.smartMiddlewareEnabled)
    : Boolean(hubConfig?.smartMiddleware?.enabled ?? true);

  // If feature is turned OFF in manager, pass through completely unmodified
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
    let userText = "";
    for (let i = messages.length - 1; i >= 0 && i >= messages.length - 3; i--) {
      const msg = messages[i];
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

    const isPureChat = /^\s*(hi|hello|hey|yo|ping|thanks|thank you|what can you do|who are you)\s*[\.\?!]*$/i.test(userText.trim());
    if (isPureChat && body.tools.length > 20) {
      return { ...body, tools: body.tools.slice(0, 10) };
    }

    const matchedTools = [];
    const fallbackTools = [];

    for (const t of body.tools) {
      const fn = t.function || t;
      const name = String(fn.name || "").toLowerCase();

      const isCoreTool = /^(read_file|write_file|edit_file|run_command|execute_command|bash|terminal|search_web|web_search|get_context|fetch)/i.test(name);
      if (isCoreTool) {
        matchedTools.push(t);
        continue;
      }

      const nameTokens = name.split(/[^a-z0-9]+/i).filter(tok => tok.length > 2);
      let isMatch = false;

      for (const tok of nameTokens) {
        if (userText.includes(tok)) {
          isMatch = true;
          break;
        }
      }

      if (!isMatch) {
        if (name.includes("rea") || name.includes("binary") || name.includes("disasm") || name.includes("decompile") || name.includes("gdb") || name.includes("frida") || name.includes("rizin")) {
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

    let finalTools = matchedTools;
    if (finalTools.length === 0) {
      finalTools = body.tools.slice(0, maxSafeTools);
    } else if (finalTools.length > maxSafeTools) {
      finalTools = finalTools.slice(0, maxSafeTools);
    }

    return { ...body, tools: finalTools };
  } catch (err) {
    recordFailure(err, { model: body.model, toolCount: initialToolCount });
    return { ...body, tools: body.tools.slice(0, 96) };
  }
}

export function onResponse(reply, ctx) {
  // Pass-through
}
