import type { ParsedEvent, ParsedRun } from "./types.js";

/**
 * Validates a ParsedRun for logical consistency and required fields
 * Checks for:
 * - Missing required fields in events
 * - Orphaned tool results (no matching tool call)
 * - Logical ordering violations
 * - Timestamp consistency
 */
export function validateParsedRun(run: ParsedRun) {
  const warnings: string[] = [...run.warnings];

  // Track tool calls by ID to validate tool results
  const toolCallIds = new Map<string | undefined, ParsedEvent>();
  const toolsByName = new Map<string, ParsedEvent>();

  // Validate each event
  for (const event of run.events) {
    // Tool-specific validation
    if (event.type === "tool_call") {
      if (event.role !== "assistant") {
        warnings.push(
          `Tool call event seq=${event.seq} should have role='assistant', got '${event.role}'`
        );
      }

      if (event.toolName) {
        toolsByName.set(event.toolName, event);
      }

      if (event.toolCallId) {
        toolCallIds.set(event.toolCallId, event);
      }
    }

    if (event.type === "tool_result") {
      if (event.role !== "tool") {
        warnings.push(
          `Tool result event seq=${event.seq} should have role='tool', got '${event.role}'`
        );
      }

      // Check if there's a matching tool call
      if (event.toolCallId && !toolCallIds.has(event.toolCallId)) {
        warnings.push(
          `Tool result seq=${event.seq} references toolCallId='${event.toolCallId}' but no matching tool_call found`
        );
      } else if (!event.toolName && !event.toolCallId) {
        warnings.push(
          `Tool result seq=${event.seq} has neither toolName nor toolCallId`
        );
      }
    }

    // Timestamp validation (basic format check)
    if (event.time) {
      if (!/^\d{2}:\d{2}:\d{2}$/.test(event.time)) {
        warnings.push(
          `Event seq=${event.seq} has invalid timestamp format: '${event.time}' (expected HH:MM:SS)`
        );
      }
    }
  }

  return {
    ...run,
    warnings,
  };
}

/**
 * Enriches a ParsedRun with inferred metadata and improved causality tracking
 */
export function enrichParsedRun(run: ParsedRun): ParsedRun {
  const enrichedEvents = run.events.map((event, index) => {
    const enriched = { ...event };

    // Infer missing toolCallId by matching tool name patterns
    if (
      enriched.type === "tool_result" &&
      !enriched.toolCallId &&
      enriched.toolName
    ) {
      // Find the most recent tool_call with matching toolName
      const matchingCall = run.events
        .slice(0, index)
        .reverse()
        .find(
          (e) =>
            e.type === "tool_call" && e.toolName === enriched.toolName
        );
      if (matchingCall?.toolCallId) {
        enriched.toolCallId = matchingCall.toolCallId;
      }
    }

    // Initialize data if missing
    if (!enriched.data && enriched.type === "tool_call") {
      enriched.data = { tool_calls: [] };
    }

    return enriched;
  });

  return {
    ...run,
    events: enrichedEvents,
  };
}
