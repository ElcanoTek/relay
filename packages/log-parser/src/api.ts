/**
 * Public API for the log parsing and analysis system
 * This is the main entry point for log normalization and LLM-ready output
 */

import { parseVictoriaLog } from "./parser.js";
import { validateParsedRun, enrichParsedRun } from "./validation.js";
import { formatForLLM, formatForLLMCompact, type FormatOptions } from "./formatter.js";
import type { ParsedRun, ParsedEvent } from "./types.js";

/**
 * Complete processing pipeline result
 */
export interface ProcessingResult {
  /** Raw structured run data (enriched with inferred metadata) */
  run: ParsedRun;
  /** Formatted output for LLM */
  llmMarkdown: string;
  /** Compact JSON format for LLM */
  llmJson: Record<string, unknown>;
}

/**
 * Process raw log text through the complete pipeline:
 * 1. Parse raw text into structured events
 * 2. Enrich with inferred metadata
 * 3. Validate for consistency
 * 4. Format for LLM consumption
 *
 * This is the primary entry point for the log analysis system.
 */
export function processLogRun(
  rawLog: string,
  formatOptions?: FormatOptions
): ProcessingResult {
  // Step 1: Parse
  const run = parseVictoriaLog(rawLog);

  // Step 2: Enrich
  const enrichedRun = enrichParsedRun(run);

  // Step 3: Validate
  const validatedRun = validateParsedRun(enrichedRun);

  // Step 4: Format
  const llmMarkdown = formatForLLM(validatedRun, {
    includeRawText: true,
    includeMetadata: true,
    includeWarnings: true,
    ...formatOptions,
  });

  const llmJson = formatForLLMCompact(validatedRun);

  return {
    run: validatedRun,
    llmMarkdown,
    llmJson,
  };
}

/**
 * Minimal processing: just parse and return structured data
 */
export function parseLogRun(rawLog: string): ParsedRun {
  return parseVictoriaLog(rawLog);
}

/**
 * Just format an already-parsed run for LLM
 */
export function formatLogForLLM(
  run: ParsedRun,
  formatOptions?: FormatOptions
): {
  markdown: string;
  json: Record<string, unknown>;
} {
  return {
    markdown: formatForLLM(run, formatOptions),
    json: formatForLLMCompact(run),
  };
}

/**
 * Validate an already-parsed run
 */
export function validateLogRun(run: ParsedRun): ParsedRun {
  return validateParsedRun(run);
}

/**
 * Enrich an already-parsed run with inferred metadata
 */
export function enrichLogRun(run: ParsedRun): ParsedRun {
  return enrichParsedRun(run);
}

/**
 * Analyze a run and produce a human-readable analysis report
 */
export function analyzeLogRun(run: ParsedRun): {
  summary: string;
  eventChain: string;
  concerns: string[];
} {
  const concerns: string[] = [];

  // Check for common issues
  const toolResults = run.events.filter((e) => e.type === "tool_result");
  const toolCalls = run.events.filter((e) => e.type === "tool_call");

  if (toolResults.length > toolCalls.length) {
    concerns.push(
      `Found ${toolResults.length} tool results but only ${toolCalls.length} tool calls - possible orphaned results`
    );
  }

  const eventsWithoutModel = run.events.filter((e) => !e.model);
  if (eventsWithoutModel.length > 0) {
    concerns.push(
      `${eventsWithoutModel.length} events missing model information`
    );
  }

  const summary =
    `Run contains ${run.events.length} events across ${run.events.filter((e) => e.role === "user").length} user turns ` +
    `and ${run.events.filter((e) => e.role === "assistant").length} assistant responses. ` +
    `${run.warnings.length} parsing warnings detected.`;

  const eventChain = run.events
    .map(
      (e) =>
        `#${e.seq}: ${e.role}/${e.type}${e.toolName ? ` (${e.toolName})` : ""}`
    )
    .join(" → ");

  return { summary, eventChain, concerns };
}

// Re-export types for public API
export type {
  ParsedRun,
  ParsedEvent,
  Role,
  EventType,
} from "./types.js";
export type { FormatOptions } from "./formatter.js";

