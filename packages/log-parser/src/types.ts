/**
 * Core types for log parsing and LLM integration
 */

export type Role = "user" | "assistant" | "tool";
export type EventType = "message" | "thought" | "tool_call" | "tool_result" | "error" | "artifact";

export interface ParsedEvent {
  seq: number;
  role: Role;
  type: EventType;
  time?: string;
  model?: string;
  toolName?: string;
  toolCallId?: string;
  text: string;
  data?: Record<string, any>;
}

export interface ParsedRun {
  raw: string;
  events: ParsedEvent[];
  warnings: any[];
}

export type ParserWarning = string;

