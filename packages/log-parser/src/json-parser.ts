/**
 * JSON Log Parser
 * Parses API response logs directly from JSON format
 */

import type { ParsedEvent, ParsedRun } from "./types.js";

/**
 * Parse JSON log format from API
 * Expected format: { messages: Array<{role, content}>, ... }
 */
export function parseJsonLog(jsonData: any): ParsedRun {
  const messages = Array.isArray(jsonData) ? jsonData : jsonData.messages || [];
  
  const events: ParsedEvent[] = [];
  let seq = 1;
  
  for (const msg of messages) {
    const role = msg.role === "user" ? "user" : msg.role === "assistant" ? "assistant" : "tool";
    const content = msg.content || "";
    
    events.push({
      seq: seq++,
      role,
      type: "message",
      time: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
      text: content,
      data: msg.metadata || {},
    });
  }

  return {
    raw: JSON.stringify(jsonData, null, 2),
    events,
    warnings: [],
  };
}

/**
 * Parse either JSON string or object
 */
export function parseJsonLogRaw(input: string | any): ParsedRun {
  let data: any;
  
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error("Invalid JSON format");
    }
  } else {
    data = input;
  }
  
  return parseJsonLog(data);
}
