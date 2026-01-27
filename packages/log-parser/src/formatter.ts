import type { ParsedEvent, ParsedRun } from "./types.js";

/**
 * Options for LLM formatting
 */
export interface FormatOptions {
  includeRawText?: boolean;
  includeMetadata?: boolean;
  includeWarnings?: boolean;
  maxLineWidth?: number;
  compact?: boolean;
}

/**
 * Formats a ParsedRun into clean, LLM-ready markdown
 * Optimized for analysis: preserves causality and ordering while removing noise
 */
export function formatForLLM(run: ParsedRun, options: FormatOptions = {}): string {
  const {
    includeRawText = true,
    includeMetadata = true,
    includeWarnings = true,
    compact = false,
  } = options;

  const lines: string[] = [];

  // Header
  lines.push("# Agent Run Analysis");
  if (includeMetadata) {
    lines.push(
      `Generated: ${new Date().toISOString()}`
    );
  }
  lines.push("");

  // Summary
  const userCount = run.events.filter((e) => e.role === "user").length;
  const assistantCount = run.events.filter((e) => e.role === "assistant").length;
  const toolCount = run.events.filter((e) => e.type === "tool_call").length;
  
  lines.push("## Summary");
  lines.push(`- Total Events: ${run.events.length}`);
  lines.push(`- User Messages: ${userCount}`);
  lines.push(`- Assistant Messages: ${assistantCount}`);
  lines.push(`- Tool Calls: ${toolCount}`);
  if (run.warnings.length > 0) {
    lines.push(`- Parsing Warnings: ${run.warnings.length}`);
  }
  lines.push("");

  // Warnings section
  if (includeWarnings && run.warnings.length > 0) {
    lines.push("## Parsing Warnings");
    for (const warning of run.warnings) {
      lines.push(
        `- [Line ${warning.line}] ${warning.code}: ${warning.message}`
      );
    }
    lines.push("");
  }

  // Event sequence
  lines.push("## Event Sequence");
  lines.push("");

  let currentModel: string | undefined;
  let currentTime: string | undefined;

  for (const event of run.events) {
    // Track model changes
    if (event.model && event.model !== currentModel) {
      currentModel = event.model;
      lines.push(`**Model:** ${currentModel}`);
    }

    // Track time
    if (event.time && event.time !== currentTime) {
      currentTime = event.time;
      lines.push(`**Time:** ${currentTime}`);
    }

    // Format event header
    const roleDisplay = event.role === "assistant" ? "🤖" : event.role === "user" ? "👤" : "🔧";
    const typeDisplay = event.type.replace(/_/g, " ");
    lines.push(`\n### ${roleDisplay} ${event.role.toUpperCase()} — ${typeDisplay} [#${event.seq}]`);

    // Tool-specific metadata
    if (event.toolName) {
      lines.push(`**Tool:** \`${event.toolName}\``);
    }
    if (event.toolCallId) {
      lines.push(`**Call ID:** \`${event.toolCallId}\``);
    }

    // Event content
    if (includeRawText && event.text.trim()) {
      const sanitized = sanitizeText(event.text);
      if (compact) {
        lines.push(sanitized);
      } else {
        lines.push("```");
        lines.push(sanitized);
        lines.push("```");
      }
    }

    // Tool call details
    if (event.type === "tool_call" && event.data?.tool_calls) {
      lines.push("**Tool Calls:**");
      const toolCalls = event.data.tool_calls as Array<{
        tool: string;
        args_raw?: string;
        args?: Record<string, unknown>;
      }>;
      for (const call of toolCalls) {
        lines.push(`- \`${call.tool}(${call.args_raw || ""})\``);
      }
    }

    lines.push("");
  }

  // Causality summary
  lines.push("## Causality Chain");
  const chain = buildCausalityChain(run.events);
  for (const link of chain) {
    lines.push(
      `- Event #${link.from} (${link.fromType}) → Event #${link.to} (${link.toType})`
    );
  }

  return lines.join("\n");
}

/**
 * Produces a compact JSON representation optimized for LLM token efficiency
 */
export function formatForLLMCompact(run: ParsedRun): Record<string, unknown> {
  return {
    summary: {
      totalEvents: run.events.length,
      userMessages: run.events.filter((e) => e.role === "user").length,
      assistantMessages: run.events.filter((e) => e.role === "assistant").length,
      toolCalls: run.events.filter((e) => e.type === "tool_call").length,
      warnings: run.warnings.length,
    },
    warnings:
      run.warnings.length > 0
        ? run.warnings.map((w) => ({
            code: w.code,
            message: w.message,
            line: w.line,
          }))
        : undefined,
    events: run.events.map((e) => ({
      seq: e.seq,
      role: e.role,
      type: e.type,
      time: e.time,
      model: e.model,
      tool: e.toolName,
      callId: e.toolCallId,
      text: e.text.length > 500 ? e.text.slice(0, 500) + "..." : e.text,
      toolCalls:
        e.data?.tool_calls && Array.isArray(e.data.tool_calls)
          ? e.data.tool_calls
          : undefined,
    })),
  };
}

/**
 * Removes noise and normalizes text for cleaner output
 */
function sanitizeText(text: string): string {
  return (
    text
      // Remove excessive whitespace
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      // Trim each line
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      // Remove trailing whitespace
      .trim()
  );
}

/**
 * Builds a causality chain showing relationships between events
 */
function buildCausalityChain(
  events: ParsedEvent[]
): Array<{ from: number; fromType: string; to: number; toType: string }> {
  const chain: Array<{
    from: number;
    fromType: string;
    to: number;
    toType: string;
  }> = [];

  // Tool calls → Tool results (by ID)
  const toolCallIdMap = new Map<string | undefined, ParsedEvent>();
  for (const event of events) {
    if (event.type === "tool_call" && event.toolCallId) {
      toolCallIdMap.set(event.toolCallId, event);
    }
  }

  for (const event of events) {
    if (event.type === "tool_result" && event.toolCallId) {
      const callEvent = toolCallIdMap.get(event.toolCallId);
      if (callEvent) {
        chain.push({
          from: callEvent.seq,
          fromType: callEvent.type,
          to: event.seq,
          toType: event.type,
        });
      }
    }
  }

  // Sequential relationships (assistant thought → tool call → result → user message)
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];

    // Thought → Action
    if (current.type === "thought" && next.type === "tool_call") {
      chain.push({
        from: current.seq,
        fromType: current.type,
        to: next.seq,
        toType: next.type,
      });
    }

    // Tool result → Next assistant turn
    if (
      current.type === "tool_result" &&
      next.role === "assistant" &&
      (next.type === "thought" || next.type === "message")
    ) {
      chain.push({
        from: current.seq,
        fromType: current.type,
        to: next.seq,
        toType: next.type,
      });
    }
  }

  return chain;
}
