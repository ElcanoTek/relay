# Architecture Overview

## Core Files

### `interactive.ts` - User Interface
- CLI for asking questions about logs
- Model selection
- Multi-question support
- Entry point: `npx ts-node src/interactive.ts <logfile>`

### `llm.ts` - LLM Integration
- OpenRouter API communication
- `askAboutLogs()` - Ask single question
- `askMultipleQuestions()` - Ask multiple questions
- `toText()` - Format logs for LLM context
- Model selection and configuration

### `api.ts` - Log Processing Pipeline
- `parseLogRun()` - Main entry point to parse logs
- Validation and enrichment
- Error handling

### `parser.ts` - Log Parsing
- Victoria format parsing
- Pattern matching for events
- State management during parsing
- Low-level log tokenization

### `types.ts` - Type Definitions
- `ParsedRun` - Container for parsed logs
- `ParsedEvent` - Individual log event
- `OpenRouterConfig` - LLM configuration

### `validation.ts` - Data Validation
- Validates parsed log structure
- Adds warnings for incomplete events

### `formatter.ts` - Output Formatting
- Formats logs for LLM consumption
- Human-readable text output

## Flow Diagram

```
User Logs (Victoria Format)
        ↓
   parser.ts (parseVictoriaLog)
        ↓
   validation.ts (validateParsedRun)
        ↓
   api.ts (parseLogRun) ← Returns ParsedRun
        ↓
 [User can now ask questions]
        ↓
   llm.ts (askAboutLogs)
        ↓
   formatter.ts (toText) ← Format logs for context
        ↓
   OpenRouter API
        ↓
   Answer ← Returns LogAnalysis
```

## Usage Pattern

1. **Parse**: `parseLogRun(logString)` → `ParsedRun`
2. **Ask**: `askAboutLogs(run, question, config)` → `LogAnalysis`
3. **Repeat**: Ask as many questions as needed

## Removed Files

- `test-chatgpt.ts` - Old test file
- `examples.ts` - Example patterns (see README.md instead)
- `fixtures.ts` - Test data
- `cli.ts` - Old CLI (replaced by interactive.ts)

These were removed to focus on the core functionality.
