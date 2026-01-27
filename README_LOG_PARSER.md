# Log Parser: Production-Grade Log Ingestion & Analysis

A comprehensive log parsing and normalization system for AI/agent task runs. Converts raw execution logs into clean, structured, LLM-ready representations for post-hoc analysis.

## Overview

This system solves the **log normalization layer**—the critical foundation for all downstream systems (capture, BrowserOS integration, UI, storage, replay, diffing). It:

- **Parses** raw log text into structured events
- **Validates** for consistency and integrity
- **Enriches** with inferred metadata and causality chains
- **Formats** for LLM consumption (markdown and JSON)
- **Recovers** gracefully from malformed input

## Architecture

```
Raw Log Text
    ↓
[Parser] → Structured Events
    ↓
[Enricher] → Enhanced Metadata & Causality
    ↓
[Validator] → Consistency Checks & Warnings
    ↓
[Formatter] → LLM-Ready Output (Markdown + JSON)
```

## Quick Start

### Basic Usage

```typescript
import { processLogRun } from "@relay/log-parser";

const rawLog = `USER
What's the capital of France?

ASSISTANT [THINKING]
Simple geography question.

USER
Also, what's the population?
`;

const result = processLogRun(rawLog);

// result.run — Structured event data
// result.validation — Warnings and errors
// result.llmMarkdown — Human-readable markdown
// result.llmJson — Compact JSON format
```

### Minimal API

```typescript
// Parse only
import { parseLogRun } from "@relay/log-parser";
const run = parseLogRun(rawLog);

// Validate only
import { validateLogRun } from "@relay/log-parser";
const validation = validateLogRun(run);

// Enrich only
import { enrichLogRun } from "@relay/log-parser";
const enriched = enrichLogRun(run);

// Format only
import { formatLogForLLM } from "@relay/log-parser";
const { markdown, json } = formatLogForLLM(run);

// Analyze
import { analyzeLogRun } from "@relay/log-parser";
const { summary, eventChain, concerns } = analyzeLogRun(run);
```

## Data Model

### Events

Every parsed log is a sequence of **events**:

```typescript
interface ParsedEvent {
  seq: number;               // Sequence number (1, 2, 3, ...)
  role: "user" | "assistant" | "tool";
  type: "message" | "thought" | "tool_call" | "tool_result" | "error" | "artifact";
  time?: string;             // HH:MM:SS format
  model?: string;            // Model name (e.g., "gpt-4")
  toolName?: string;         // For tool calls/results
  toolCallId?: string;       // Links tool calls to results
  text: string;              // Event content
  data?: Record<string, unknown>; // Structured data (tool calls, etc.)
}
```

### Validation

The validator checks for:
- **Required fields** in each event
- **Logical consistency** (e.g., tool_result must have corresponding tool_call)
- **Role/type consistency** (e.g., tool_call should be from assistant)
- **Timestamp format** (HH:MM:SS)
- **Orphaned metadata** (tool calls without matching results)

## Log Format

The parser supports a structured text format for agent logs:

```
USER
[user message text]

Model: [model name] - [HH:MM:SS]

ASSISTANT [THINKING]
[assistant thinking text]

ASSISTANT [TOOL_CALL]
ID: [call_id]
Tool: [tool_name]
- [tool_name]([arguments])

TOOL [TOOL_RESULT]
ID: [call_id]
Tool: [tool_name]
[result text]
```

### Metadata

- **Model lines**: `Model: gpt-4-turbo - 10:30:00`
- **ID lines**: `ID: call_123`
- **Tool lines**: `Tool: web_search`
- **Time lines**: `10:30:00`

Can appear before or after the section they describe; they'll be automatically attached to the nearest event.

## Enrichment

The enricher automatically:

1. **Infers missing toolCallIds** by matching tool names in results to preceding calls
2. **Initializes data structures** for tool_call events
3. **Normalizes timestamps** and validates formats
4. **Builds causality chains** between related events

## Formatting for LLM

### Markdown Format

Human-readable output optimized for analysis:
```markdown
# Agent Run Analysis

## Summary
- Total Events: 5
- User Messages: 2
- Assistant Messages: 2
- Tool Calls: 1

## Event Sequence

### 👤 USER — message [#1]
What files are in /tmp?

**Model:** gpt-4
**Time:** 10:30:00

### 🤖 ASSISTANT — thought [#2]
Need to list files...

### 🤖 ASSISTANT — tool_call [#3]
**Tool:** `shell_exec`
**Call ID:** `call_001`

- `shell_exec(ls -la /tmp)`

### 🔧 TOOL — tool_result [#4]
...output...

## Causality Chain
- Event #1 (message) → Event #2 (thought)
- Event #2 (thought) → Event #3 (tool_call)
- Event #3 (tool_call) → Event #4 (tool_result)
```

### JSON Format

Compact format optimized for token efficiency:
```json
{
  "summary": {
    "totalEvents": 5,
    "userMessages": 2,
    "assistantMessages": 2,
    "toolCalls": 1,
    "warnings": 0
  },
  "events": [
    {
      "seq": 1,
      "role": "user",
      "type": "message",
      "time": "10:30:00",
      "model": "gpt-4",
      "text": "What files are in /tmp?"
    },
    ...
  ]
}
```

## Validation & Warnings

The system generates warnings for:
- `unknown_section`: Text outside recognized sections
- `unclosed_section`: Sections starting before previous ones close
- `tool_args_parse_failed`: Invalid JSON in tool arguments
- `missing_tool_name`: Tool result without tool metadata
- `missing_tool_result`: Tool call without matching result
- `timestamp_parse_failed`: Invalid timestamp format

Access warnings via:
```typescript
const result = processLogRun(rawLog);
result.validation.warnings.forEach(w => {
  console.log(`Line ${w.line}: ${w.code} - ${w.message}`);
});
```

## Error Recovery

The parser gracefully handles:
- Missing metadata (uses pending fields, applies heuristics)
- Malformed JSON in tool arguments (logs warning, continues)
- Text outside sections (generates warning, buffers for later)
- Partial logs (returns what was parsed successfully)
- Empty input (returns empty run)

## Testing

Sample fixtures are included:

```typescript
import {
  SIMPLE_USER_MESSAGE,
  ASSISTANT_WITH_TOOL_CALL,
  MULTI_TURN_CONVERSATION,
  EDGE_CASE_MALFORMED,
} from "@relay/log-parser";

const result = processLogRun(ASSISTANT_WITH_TOOL_CALL);
```

## Use Cases

### 1. Post-hoc Analysis
Send formatted output to LLMs for analysis:
```
"Analyze this agent run and identify where it failed: [llmMarkdown]"
```

### 2. Automated Logging
Capture agent execution and normalize:
```typescript
const log = await agent.run(task);
const result = processLogRun(log);
await storage.save(result.run);
```

### 3. Debugging
Get structured event sequence with warnings:
```typescript
const { run, validation } = processLogRun(log);
console.log("Events:", run.events);
console.log("Warnings:", validation.warnings);
```

### 4. Integration with BrowserOS
Normalized logs feed into browser automation:
```typescript
const parsed = parseLogRun(rawLog);
const causality = analyzeLogRun(parsed);
browserOS.replay(parsed.events);
```

## API Reference

### `processLogRun(rawLog: string, options?: FormatOptions): ProcessingResult`

Complete pipeline: parse → enrich → validate → format. Returns structured data, validation results, and LLM-ready output.

### `parseLogRun(rawLog: string): ParsedRun`

Parse only. Returns raw structured events.

### `validateLogRun(run: ParsedRun): ValidationResult`

Validate a parsed run. Returns warnings and errors.

### `enrichLogRun(run: ParsedRun): ParsedRun`

Enrich with inferred metadata. Returns enhanced run.

### `formatLogForLLM(run: ParsedRun, options?: FormatOptions): { markdown: string; json: unknown }`

Format for LLM consumption. Returns markdown and JSON.

### `analyzeLogRun(run: ParsedRun): { summary: string; eventChain: string; concerns: string[] }`

Analyze for issues. Returns human-readable analysis.

## Architecture Notes

### Why This Approach?

1. **Composability**: Each layer (parse → enrich → validate → format) can be used independently
2. **Robustness**: Error recovery at each stage; warnings accumulate without blocking
3. **LLM-Optimization**: Multiple output formats for different use cases
4. **Extensibility**: Easy to add new validation rules, enrichment strategies, or formatters
5. **Type Safety**: Full TypeScript support with strict mode enabled

### Design Decisions

- **Explicit state machine**: Parser uses explicit state to avoid type narrowing issues
- **Pending metadata**: Metadata that appears out-of-order is buffered and applied when possible
- **Warnings, not errors**: Parser continues on malformed input; issues are logged as warnings
- **Causality inference**: Tool calls and results linked by ID; sequential relationships inferred
- **Markdown + JSON**: Markdown for humans, JSON for token-efficient LLM input

## Contributing

To add new validation rules:
1. Add case to `validateParsedRun()` in `validation.ts`
2. Ensure warning codes are defined in `types.ts`

To add new formatters:
1. Create new function in `formatter.ts` or new file
2. Export from `api.ts`

To improve parser:
1. Update regexes in `parser.ts`
2. Add test fixtures to `fixtures.ts`

## License

See LICENSE file.
