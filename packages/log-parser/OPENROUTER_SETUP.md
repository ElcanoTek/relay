# OpenRouter Setup Guide

## Overview

OpenRouter provides a unified API to access multiple LLM providers (OpenAI, Anthropic, Google, Mistral, etc.) with a single API key. This is perfect for our interactive log analyzer!

**Benefits:**
- ✅ Single API key works with 50+ models
- ✅ Cheaper than direct provider APIs
- ✅ No OpenAI billing issues
- ✅ Easy model switching
- ✅ Free tier available

## Step 1: Get Your OpenRouter API Key

1. Go to: https://openrouter.ai
2. Sign up (free account)
3. Go to: https://openrouter.ai/keys
4. Click **"Create Key"**
5. Copy your API key (starts with `sk-or-`)
6. Save it somewhere safe

## Step 2: Set Environment Variable

### PowerShell:
```powershell
$env:OPENROUTER_API_KEY = "sk-or-your-key-here"
```

### Command Prompt:
```cmd
set OPENROUTER_API_KEY=sk-or-your-key-here
```

### Linux/Mac:
```bash
export OPENROUTER_API_KEY="sk-or-your-key-here"
```

## Step 3: Run the Test

```bash
cd c:\Users\User\relay\packages\log-parser
node dist/test-chatgpt.js
```

Expected output:
```
🚀 OpenRouter Integration Test
══════════════════════════════════════════════════

📝 Step 1: Parsing agent logs...
✓ Parsed 2 events
  - [1] USER / message
  - [2] ASSISTANT / thought

⏳ Asking questions about the logs...
──────────────────────────────────────────────────

❓ Question: What did the user ask?
✓ Answer: The user asked: "What is the capital of France?"
...
✅ Success! OpenRouter integration is working.
```

## Step 4: Use Interactive Mode

```bash
cd c:\Users\User\relay\packages\log-parser
npx ts-node src/interactive.ts
```

Then:
1. Paste your agent logs
2. Select a model
3. Ask any questions about the logs!

Example questions:
- "What did the user ask for?"
- "What tools did the agent use?"
- "Did the agent encounter any errors?"
- "What was the final result?"
- "What decisions did the agent make?"

## Available Models

Use any of these model IDs in your code:

### Fast & Cheap
- `openai/gpt-3.5-turbo` - Best for quick analysis
- `mistralai/mistral-7b` - Free tier available

### Balanced
- `anthropic/claude-3-sonnet` - Good quality, reasonable cost
- `google/gemini-pro` - Capable model

### Most Capable
- `openai/gpt-4-turbo` - Most advanced (higher cost)
- `anthropic/claude-3-opus` - Highest quality (highest cost)

## Usage Examples

### Ask a Single Question
```typescript
import { parseLogRun, askAboutLogs } from "@relay/log-parser";

const run = parseLogRun(yourLogs);

const analysis = await askAboutLogs(run, "What went wrong?", {
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: "openai/gpt-3.5-turbo",
});

console.log(analysis.answer);
```

### Ask Multiple Questions
```typescript
import { parseLogRun, askMultipleQuestions } from "@relay/log-parser";

const run = parseLogRun(yourLogs);

const questions = [
  "What did the user ask?",
  "What tools were used?",
  "What was the outcome?",
];

const results = await askMultipleQuestions(run, questions, {
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: "openai/gpt-3.5-turbo",
});

results.forEach(r => console.log(`Q: ${r.question}\nA: ${r.answer}\n`));
```

### Format Logs for Manual Review
```typescript
import { parseLogRun, toText } from "@relay/log-parser";

const run = parseLogRun(yourLogs);
const formatted = toText(run);

console.log(formatted);
```

## Pricing

**Free Tier:**
- Limited requests per day
- Full access to all models
- Good for testing

**Paid:**
- Pay per token used
- Varies by model
- GPT-3.5: ~$0.001 per 1K tokens
- Claude 3: ~$0.003-$0.015 per 1K tokens
- GPT-4: ~$0.01-$0.03 per 1K tokens

## Troubleshooting

### ❌ "OPENROUTER_API_KEY not set"
- You haven't set the environment variable yet
- Follow Step 2 above

### ❌ "401 Unauthorized"
- Your API key is wrong or invalid
- Get a new key from https://openrouter.ai/keys

### ❌ "Model not found"
- Check that you're using a valid model ID
- See "Available Models" section above

### ❌ "Rate limited"
- You've hit the rate limit
- Wait a moment and try again
- Check your OpenRouter dashboard for limits

### ❌ "Insufficient quota"
- You've used your free tier quota
- Add a payment method or wait for reset

## Next Steps

1. ✅ Get OpenRouter API key
2. ✅ Set environment variable
3. ✅ Run test: `node dist/test-chatgpt.js`
4. ✅ Use interactive mode: `npx ts-node src/interactive.ts`
5. ✅ Integrate into your own code

## Common Workflow

```bash
# 1. Set API key (one-time per session)
export OPENROUTER_API_KEY="sk-or-..."

# 2. Parse your agent logs
npx ts-node src/interactive.ts logs.txt

# 3. Ask questions interactively
# Q: What did the agent do?
# Q: Were there any errors?
# Q: What was the final result?
# Type 'exit' to quit
```

## Questions?

- OpenRouter docs: https://openrouter.ai/docs
- API key management: https://openrouter.ai/keys
- Model listing: https://openrouter.ai/models
