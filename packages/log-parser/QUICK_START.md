# Quick Start Guide

## No log file needed!

The error was a module resolution issue - now it's fixed. You can:

### Option 1: Use an actual log file
```bash
# First, set your OpenRouter API key (one-time)
$env:OPENROUTER_API_KEY = "sk-or-your-key-here"

# Then use with a log file
node dist/interactive.js your-logs.txt

# Or with stdin
cat your-logs.txt | node dist/interactive.js
```

### Option 2: Type/paste logs directly
The tool also accepts logs from stdin, so you can:
1. Run without arguments: `node dist/interactive.js`
2. Paste your logs
3. Press Ctrl+D (or Ctrl+Z on Windows in some terminals) to finish

## Get Your API Key

1. Go to https://openrouter.ai
2. Sign up (free account)
3. Get your API key: https://openrouter.ai/keys
4. Set it:
   ```bash
   $env:OPENROUTER_API_KEY = "sk-or-v1-..."
   ```

## Test It

A test log file is included at `test-log.txt`:
```bash
node dist/interactive.js test-log.txt
```

Then ask questions like:
- "What did the user ask?"
- "What model was used?"
- "What was the response?"

## No Compilation Needed

The code is already compiled in the `dist/` folder. Just run:
```bash
node dist/interactive.js test-log.txt
```
