/**
 * Interactive Log Analyzer
 * 
 * Parse agent logs and ask questions about them using OpenRouter
 * 
 * Usage:
 *   export OPENROUTER_API_KEY="sk-..."
 *   npx ts-node src/interactive.ts <logfile>
 *   
 * Or use with stdin:
 *   cat logs.txt | npx ts-node src/interactive.ts
 */

import * as readline from "readline";
import * as fs from "fs";
import { parseLogRun, askAboutLogs, POPULAR_MODELS } from "./index.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log("\n🔍 Interactive Log Analyzer");
  console.log("═".repeat(50));

  // Check for API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("❌ Error: OPENROUTER_API_KEY environment variable not set");
    console.error("\nTo get started:");
    console.error("1. Sign up at https://openrouter.ai");
    console.error("2. Get your API key from https://openrouter.ai/keys");
    console.error("3. Set it: export OPENROUTER_API_KEY='sk-...'");
    process.exit(1);
  }

  // Get log file
  let logContent = "";

  if (process.argv[2]) {
    // Read from file
    const filePath = process.argv[2];
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    logContent = fs.readFileSync(filePath, "utf-8");
    console.log(`\n📄 Loaded log file: ${filePath}`);
  } else {
    // Read from stdin or ask for input
    console.log("\n📝 Paste your agent logs (Ctrl+D when done):");
    logContent = await question("");
  }

  // Parse logs
  console.log("\n⏳ Parsing logs...");
  let run;
  try {
    run = parseLogRun(logContent);
    console.log(`✓ Parsed ${run.events.length} events`);
    if (run.warnings.length > 0) {
      console.log(`⚠️  ${run.warnings.length} warnings found`);
    }
  } catch (error) {
    console.error("❌ Failed to parse logs:", error);
    process.exit(1);
  }

  // Model selection
  console.log("\n🤖 Available Models:");
  POPULAR_MODELS.forEach((model, i) => {
    console.log(`  ${i + 1}. ${model.name} (${model.cost})`);
  });
  console.log("  0. Use default (GPT-3.5 Turbo)");

  const modelChoice = await question("\nSelect model (0-5): ");
  let selectedModel = "openai/gpt-3.5-turbo";

  const choice = parseInt(modelChoice);
  if (choice > 0 && choice <= POPULAR_MODELS.length) {
    selectedModel = POPULAR_MODELS[choice - 1].id;
  }

  console.log(`\n✓ Using: ${selectedModel}`);

  // Interactive questioning
  console.log("\n💬 Ask questions about your logs (type 'exit' to quit):\n");

  while (true) {
    const question_text = await question("Your question: ");

    if (question_text.toLowerCase() === "exit") {
      break;
    }

    if (!question_text.trim()) {
      continue;
    }

    console.log("\n⏳ Analyzing...");
    try {
      const analysis = await askAboutLogs(run, question_text, {
        apiKey,
        model: selectedModel,
      });

      console.log("\n📊 Answer:");
      console.log("─".repeat(50));
      console.log(analysis.answer);
      console.log("─".repeat(50) + "\n");
    } catch (error) {
      if (error instanceof Error) {
        console.error(`\n❌ Error: ${error.message}\n`);
      } else {
        console.error(`\n❌ Unknown error\n`);
      }
    }
  }

  console.log("\n👋 Goodbye!");
  rl.close();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
