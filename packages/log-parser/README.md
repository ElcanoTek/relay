# Log Parser - Agent Log Analysis

Parse agent execution logs and ask questions using an LLM.

## Quick Start

```bash
# 1. Set your OpenRouter API key
export OPENROUTER_API_KEY="sk-or-..."

# 2. Run interactive mode to ask questions about your logs
npx ts-node src/interactive.ts logs.txt
```

## Core Workflow

### 1. Parse Logs
```typescript
import { parseLogRun } from "@relay/log-parser";

const logs = `U
USER
What is 2+2?
...`;

const run = parseLogRun(logs);
```

### 2. Ask Questions
```typescript
import { askAboutLogs } from "@relay/log-parser";

const answer = await askAboutLogs(run, "What did the user ask?", {
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: "openai/gpt-3.5-turbo",
});

console.log(answer.answer);
```

### 3. Ask Multiple Questions
```typescript
import { askMultipleQuestions } from "@relay/log-parser";

const results = await askMultipleQuestions(
  run,
  [
    "What did the user ask?",
    "What tools were used?",
    "What was the outcome?"
  ],
  { apiKey: process.env.OPENROUTER_API_KEY! }
);

results.forEach(r => console.log(`Q: ${r.question}\nA: ${r.answer}\n`));
```

## Available Models

- `openai/gpt-3.5-turbo` - Fast & cheap (default)
- `openai/gpt-4-turbo` - Most capable
- `anthropic/claude-3-sonnet` - Good balance
- `anthropic/claude-3-opus` - Highest quality
- [See all models](https://openrouter.ai/models)

## Setup

See [OPENROUTER_SETUP.md](./OPENROUTER_SETUP.md) for detailed setup instructions.

## File Format

Logs should be in Victoria format:

```
U
USER
[timestamp]
[user message]

A
ASSISTANT [THINKING]
Model: [model] - [timestamp]
[thinking text]

A
ASSISTANT [TOOL_CALL]
ID: [id]
Tool: [tool_name]
- [tool_call]

TOOL [TOOL_RESULT]
ID: [id]
Tool: [tool_name]
[result]
```

## API Reference

### `parseLogRun(logs: string): ParsedRun`
Parses Victoria format logs into structured events.

### `askAboutLogs(run: ParsedRun, question: string, config: OpenRouterConfig): Promise<LogAnalysis>`
Ask a single question about the logs.

### `askMultipleQuestions(run: ParsedRun, questions: string[], config: OpenRouterConfig): Promise<LogAnalysis[]>`
Ask multiple questions about the logs.

### `toText(run: ParsedRun): string`
Format parsed logs as text for manual review.

## Types

```typescript
interface OpenRouterConfig {
  apiKey: string;
  model?: string; // defaults to "openai/gpt-3.5-turbo"
}

interface LogAnalysis {
  question: string;
  answer: string;
}

interface ParsedRun {
  events: ParsedEvent[];
  warnings: string[];
}

interface ParsedEvent {
  type: "user" | "assistant" | "tool";
  timestamp: string;
  model?: string;
  content: string;
  subtype?: string;
  toolId?: string;
  toolName?: string;
}
```
