# ChatGPT Integration Setup

## Step 1: Get Your OpenAI API Key

1. Go to: https://platform.openai.com/api-keys
2. Sign in with your OpenAI account (create one if needed)
3. Click **"Create new secret key"**
4. Copy the key (you'll only see it once!)
5. Save it somewhere safe

## Step 2: Set the Environment Variable

### On Windows PowerShell:
```powershell
$env:OPENAI_API_KEY = "sk-your-key-here"
```

### On Windows Command Prompt:
```cmd
set OPENAI_API_KEY=sk-your-key-here
```

### On Linux/Mac:
```bash
export OPENAI_API_KEY="sk-your-key-here"
```

## Step 3: Verify It's Set

```powershell
# PowerShell
echo $env:OPENAI_API_KEY

# Or in Node.js
node -e "console.log(process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set')"
```

## Step 4: Test the Integration

Run the test script:
```bash
cd c:\Users\User\relay\packages\log-parser
npx ts-node src/test-chatgpt.ts
```

Expected output:
```
🚀 ChatGPT Integration Test

==================================================

📝 Step 1: Parsing agent logs...
✓ Parsed 3 events
  - [1] USER / message
  - [2] ASSISTANT / thought
  - [3] ASSISTANT / message

📤 Step 2: Preparing to send to ChatGPT...
  Model: gpt-4-turbo
  Tokens (approx): 150

⏳ Step 3: Sending to ChatGPT...

✓ Response received!

📊 ChatGPT Analysis:
──────────────────────────────────────────────────
[ChatGPT's analysis here...]
──────────────────────────────────────────────────
```

## Step 5: Use in Your Own Code

```typescript
import { parseLogRun, sendToOpenAI } from "@relay/log-parser";

const run = parseLogRun(yourAgentLogs);

const analysis = await sendToOpenAI(run, process.env.OPENAI_API_KEY!, {
  model: "gpt-4-turbo",
  prompt: "What happened in this agent run?",
});

console.log(analysis);
```

## Troubleshooting

### ❌ "OPENAI_API_KEY environment variable not set"
- You haven't set the environment variable yet
- Follow Step 2 above and make sure to use correct syntax for your terminal

### ❌ "401 Unauthorized"
- Your API key is wrong or expired
- Get a new key from https://platform.openai.com/api-keys
- Make sure you copied it correctly

### ❌ "429 Too Many Requests"
- You're rate limited
- Wait 60 seconds and try again
- Free accounts have strict rate limits

### ❌ "insufficient_quota"
- Your account has no credits
- Add a payment method at https://platform.openai.com/billing/overview
- Free trial credits may have expired

### ❌ "Model not found"
- Make sure you're using a valid model name:
  - `gpt-4-turbo` (current recommended)
  - `gpt-4` (older, may need special access)
  - `gpt-3.5-turbo` (cheaper, faster, less capable)

## API Costs

- **gpt-4-turbo**: ~$0.01-0.03 per 1000 tokens (input/output)
- **gpt-3.5-turbo**: ~$0.0005-0.0015 per 1000 tokens (much cheaper)

For testing, start with a short log. A typical agent run log costs $0.01-0.10.

## Next Steps

Once this works, you can:
1. ✅ Test with your real agent logs
2. ✅ Switch to Claude or Gemini
3. ✅ Set up automated analysis pipeline
4. ✅ Integrate with your agent directly
