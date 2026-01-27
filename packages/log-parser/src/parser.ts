/**
 * Log Parser - Production-grade log normalization for agent execution
 * 
 * Automatically parses raw agent logs and converts them to LLM-ready format
 */

import type { ParsedEvent, ParsedRun } from "./types.js";

const PATTERNS = {
  DIVIDER: /^[UAT]$/,
  USER: /^USER$/i,
  ASSISTANT_THINKING: /^ASSISTANT\s*\[THINKING\]$/i,
  ASSISTANT_TOOLCALL: /^ASSISTANT\s*\[TOOL_CALL\]$/i,
  TOOL_RESULT: /^TOOL\s*\[TOOL_RESULT\]$/i,
  TIME: /^\d{2}:\d{2}:\d{2}$/,
  MODEL: /^Model:\s*(.+?)\s*-\s*(\d{2}:\d{2}:\d{2})\s*$/,
  TOOL_NAME: /^Tool:\s*(.+)\s*$/,
  TOOL_ID: /^ID:\s*(.+)\s*$/,
  TOOL_CALL: /^\s*[-•]\s*([a-zA-Z0-9_]+)\((.*)\)\s*$/,
};

function normalizeInput(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function createEvent(
  seq: number,
  role: ParsedEvent["role"],
  type: ParsedEvent["type"]
): ParsedEvent {
  return { seq, role, type, text: "" };
}

/**
 * Core parser - converts raw logs to events
 */
export function parseVictoriaLog(rawInput: string): ParsedRun {
  const normalized = normalizeInput(rawInput);
  const lines = normalized.split("\n");
  const events: ParsedEvent[] = [];
  const warnings: any[] = [];

  // Use a state object to work around TypeScript's type narrowing issues with mutable variables
  const state = {
    current: null as ParsedEvent | null,
    seq: 0,
    pending: { time: "", model: "", toolName: "", toolId: "" },
  };

  function flush() {
    if (!state.current) return;
    state.current.text = state.current.text.replace(/\s+$/, "");
    if (state.current.text || state.current.toolName || state.current.model) {
      events.push(state.current);
    }
    state.current = null;
    state.pending = { time: "", model: "", toolName: "", toolId: "" };
  }

  function start(role: ParsedEvent["role"], type: ParsedEvent["type"]) {
    flush();
    state.seq++;
    state.current = { seq: state.seq, role, type, text: "" };
    if (state.pending.time) state.current.time = state.pending.time;
    if (state.pending.model) state.current.model = state.pending.model;
    if (state.pending.toolName) state.current.toolName = state.pending.toolName;
    if (state.pending.toolId) state.current.toolCallId = state.pending.toolId;
  }

  function append(text: string) {
    if (state.current) {
      state.current.text += (state.current.text ? "\n" : "") + text;
    }
  }

  for (const line of lines) {
    if (!line.trim()) {
      if (state.current) append(line);
      continue;
    }

    // Dividers
    if (PATTERNS.DIVIDER.test(line)) {
      flush();
      continue;
    }

    // Headers
    if (PATTERNS.USER.test(line)) {
      start("user", "message");
      continue;
    }
    if (PATTERNS.ASSISTANT_THINKING.test(line)) {
      start("assistant", "thought");
      continue;
    }
    if (PATTERNS.ASSISTANT_TOOLCALL.test(line)) {
      start("assistant", "tool_call");
      continue;
    }
    if (PATTERNS.TOOL_RESULT.test(line)) {
      start("tool", "tool_result");
      continue;
    }

    // Metadata
    if (PATTERNS.TIME.test(line)) {
      if (state.current) {
        if (!state.current.time) {
          state.current.time = line;
        }
      } else {
        state.pending.time = line;
      }
      continue;
    }

    const modelMatch = line.match(PATTERNS.MODEL);
    if (modelMatch) {
      if (state.current) {
        state.current.model = modelMatch[1];
        if (!state.current.time) {
          state.current.time = modelMatch[2];
        }
      } else {
        state.pending.model = modelMatch[1];
        state.pending.time = modelMatch[2];
      }
      continue;
    }

    const idMatch = line.match(PATTERNS.TOOL_ID);
    if (idMatch) {
      if (state.current) {
        state.current.toolCallId = idMatch[1];
      } else {
        state.pending.toolId = idMatch[1];
      }
      continue;
    }

    const toolMatch = line.match(PATTERNS.TOOL_NAME);
    if (toolMatch) {
      if (state.current) {
        state.current.toolName = toolMatch[1];
      } else {
        state.pending.toolName = toolMatch[1];
      }
      continue;
    }

    // Tool calls
    const callMatch = line.match(PATTERNS.TOOL_CALL);
    if (callMatch) {
      if (state.current && state.current.type === "tool_call") {
        if (!state.current.data) {
          state.current.data = { calls: [] };
        }
        const calls = state.current.data.calls as any[];
        calls.push({
          tool: callMatch[1],
          args_raw: callMatch[2].trim(),
          args: tryParseJson(callMatch[2]),
        });
      }
      if (state.current) {
        append(line);
      }
      continue;
    }

    // Content
    append(line);
  }

  flush();
  return { raw: normalized, events, warnings };
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text.trim());
  } catch {
    try {
      return JSON.parse(text.trim().replace(/\n/g, "\\n"));
    } catch {
      return undefined;
    }
  }
}
