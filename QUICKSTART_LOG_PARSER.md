# Log Parser — Quick Start Guide

You've just built a **production-grade log ingestion system** for AI/agent task runs. Here's what you have and how to use it.

## What's Built

✅ **Parser** (`parser.ts`) — Converts raw log text into structured events
✅ **Validator** (`validation.ts`) — Checks for consistency and correctness
✅ **Enricher** (`validation.ts`) — Infers missing metadata, builds causality chains
✅ **Formatter** (`formatter.ts`) — Produces LLM-ready markdown and JSON
✅ **Public API** (`api.ts`) — Clean, composable functions for all use cases
✅ **Type Definitions** (`types.ts`) — Full TypeScript support (strict mode)
✅ **Test Fixtures** (`fixtures.ts`) — Sample logs for testing
✅ **Examples** (`examples.ts`) — 6 real-world usage patterns
✅ **Documentation** (`README_LOG_PARSER.md`) — Complete reference

## File Structure

```
packages/log-parser/src/
├── index.ts              # Main entry point (exports public API)
├── api.ts               # Public API functions
├── types.ts             # TypeScript type definitions
├── parser.ts            # Log parsing (fixed with attachPending call)
├── validation.ts        # Validation and enrichment
├── formatter.ts         # LLM-ready output formatting
├── examples.ts          # Usage examples
├── fixtures.ts          # Test log samples
└── cli.ts              # Command-line interface
```

## Minimal Usage

```typescript
import { processLogRun } from "@relay/log-parser";

const result = processLogRun(`USER
What's the capital of France?

ASSISTANT [THINKING]
Paris.
`);

// result.run — Structured events
// result.validation — Any warnings/errors
// result.llmMarkdown — Human-readable output
// result.llmJson — Compact JSON
```

## Key Features

### 1. Robust Parsing
- Handles malformed input gracefully
- Continues on errors (logs warnings instead of failing)
- Recovers missing metadata through pending field buffers
- Supports bullet-point tool calls: `- tool_name({...})`

### 2. Validation
Checks for:
- Required fields in events
- Tool result ↔ tool call matching
- Timestamp format (HH:MM:SS)
- Role/type consistency
- Orphaned metadata

### 3. Metadata Enrichment
Automatically:
- Infers missing toolCallIds by matching tool names
- Normalizes timestamps
- Initializes data structures
- Builds causality chains

### 4. LLM Formatting
Two output formats:
- **Markdown**: Human-readable with emojis, formatting, causality chain
- **JSON**: Compact and token-efficient for LLM input

### 5. Causality Tracking
Automatically links:
- Tool calls ↔ tool results (by ID)
- Thoughts → actions (sequential)
- Tool results → next turn
- User messages → assistant responses

## Real-World Workflow

```typescript
// 1. Parse raw logs
import { parseLogRun } from "@relay/log-parser";
const run = parseLogRun(rawLogText);

// 2. Validate for consistency
import { validateLogRun } from "@relay/log-parser";
const validation = validateLogRun(run);

// 3. Enrich with inferred data
import { enrichLogRun } from "@relay/log-parser";
const enriched = enrichLogRun(run);

// 4. Analyze
import { analyzeLogRun } from "@relay/log-parser";
const { summary, eventChain, concerns } = analyzeLogRun(enriched);

// 5. Format for LLM
import { formatLogForLLM } from "@relay/log-parser";
const { markdown, json } = formatLogForLLM(enriched);

// 6. Send to LLM with your analysis question
const llmResponse = await chatGPT(`
Analyze this agent run: did it succeed or fail?

${markdown}
`);
```

Or just use `processLogRun()` to do all steps at once.

## Data Model

Every log is parsed into **events**:

```typescript
{
  seq: 1,                    // Event number (ordering)
  role: "user",              // Who: user | assistant | tool
  type: "message",           // What: message | thought | tool_call | tool_result | error | artifact
  time: "10:30:00",          // When (optional)
  model: "gpt-4",            // Which model (optional)
  toolName: "web_search",    // For tool calls/results (optional)
  toolCallId: "call_001",    // Links calls to results (optional)
  text: "user input...",     // Content
  data: {                    // Structured data (optional)
    tool_calls: [...]
  }
}
```

## Log Format

The parser expects this text format:

```
USER
[user message]

Model: gpt-4 - 10:30:00

ASSISTANT [THINKING]
[assistant thinking]

ASSISTANT [TOOL_CALL]
ID: call_001
Tool: tool_name
- tool_name({json args})

TOOL [TOOL_RESULT]
ID: call_001
Tool: tool_name
[result text]
```

Metadata (Model, ID, Tool, timestamps) can appear before or after their sections.

## Common Workflows

### Q1: "What went wrong with this run?"
```typescript
const result = processLogRun(rawLog);
console.log(result.llmMarkdown);
// Send to ChatGPT: "What went wrong?"
```

### Q2: "Extract all tool calls made"
```typescript
const run = parseLogRun(rawLog);
const toolCalls = run.events.filter(e => e.type === "tool_call");
```

### Q3: "Validate and get warnings"
```typescript
const result = processLogRun(rawLog);
result.validation.warnings.forEach(w => 
  console.log(`${w.code}: ${w.message}`)
);
```

### Q4: "Show me the causality chain"
```typescript
const { eventChain } = analyzeLogRun(run);
console.log(eventChain);
// Output: #1: user/message → #2: assistant/thought → #3: assistant/tool_call ...
```

### Q5: "Send to LLM for analysis"
```typescript
const { llmMarkdown } = processLogRun(rawLog);
const analysis = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{
    role: "user",
    content: `Analyze this agent run:\n\n${llmMarkdown}`
  }]
});
```

## Error Handling

The system is **fault-tolerant**: it continues parsing even when encountering:
- Invalid JSON in tool arguments
- Missing metadata
- Malformed section markers
- Text outside sections
- Orphaned tool results

Issues are logged as warnings in `validation.warnings` — you decide how to handle them.

```typescript
const result = processLogRun(log);
if (!result.validation.isValid) {
  console.warn("Issues found:");
  result.validation.errors.forEach(e => console.warn(e.message));
}
```

## Testing

Run the examples:

```typescript
import { examples } from "@relay/log-parser";
examples.completePipeline();
examples.errorHandling();
// etc.
```

Use the fixtures:

```typescript
import { ASSISTANT_WITH_TOOL_CALL, MULTI_TURN_CONVERSATION } from "@relay/log-parser";
const result = processLogRun(ASSISTANT_WITH_TOOL_CALL);
```

## Next Steps

### Immediate
1. ✅ Use `processLogRun()` in your app
2. ✅ Send `llmMarkdown` to LLMs for analysis
3. ✅ Store `run` objects in your database

### Short-term
1. Implement automatic log capture from agents
2. Integrate with BrowserOS for replay
3. Build a UI to view parsed runs

### Long-term
1. Add more validators (semantic checks, performance analysis)
2. Implement log diffing (compare two runs)
3. Build replay engine using structured events
4. Create extensions for specific agent frameworks

## Architecture Principles

1. **Layered**: Parse → Enrich → Validate → Format (each layer independent)
2. **Fault-tolerant**: Warnings accumulate; parsing continues
3. **Composable**: Use any layer independently
4. **Type-safe**: Full TypeScript with strict mode
5. **LLM-optimized**: Multiple output formats for different needs

## API Summary

| Function | Input | Output | Use Case |
|----------|-------|--------|----------|
| `processLogRun()` | Raw text | Full result (parsed + validated + formatted) | Everything at once |
| `parseLogRun()` | Raw text | Parsed events | Just structure |
| `validateLogRun()` | ParsedRun | Validation result | Just validate |
| `enrichLogRun()` | ParsedRun | Enhanced run | Just enrich |
| `formatLogForLLM()` | ParsedRun | Markdown + JSON | Just format |
| `analyzeLogRun()` | ParsedRun | Summary + chain + concerns | Quick analysis |

## Troubleshooting

**"Property 'data' does not exist on type 'never'"**
- This was the bug I just fixed! `attachPending()` is now called in the tool_call path.

**"High warning count in validation"**
- Check `validation.warnings` to understand what's malformed
- Most issues are recoverable (see the parsed events anyway)

**"Missing tool results"**
- Some tool calls don't have results
- Validation warns: `missing_tool_result`
- This is valid for incomplete runs

**"Timestamps not parsed"**
- Ensure format is `HH:MM:SS` (e.g., `10:30:00`)
- Other formats trigger `timestamp_parse_failed` warning

## Support

For issues or questions, refer to:
1. `README_LOG_PARSER.md` — Full reference documentation
2. `examples.ts` — 6 working examples
3. `fixtures.ts` — Sample logs
4. Type definitions in `types.ts` — See data structure

You're ready to go! 🚀
