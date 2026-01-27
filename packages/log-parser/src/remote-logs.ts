/**
 * Remote Log Fetcher
 * 
 * Fetch logs from your web server and analyze them
 * 
 * Usage:
 *   export OPENROUTER_API_KEY="sk-..."
 *   export LOG_AUTH_TOKEN="Bearer ..."
 *   npx ts-node src/remote-logs.ts https://moc.elcanotek.com/logs/{sessionId}
 *   
 * Or use setup.ps1:
 *   . ./setup.ps1
 *   node dist/remote-logs.js https://moc.elcanotek.com/logs/{sessionId}
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { parseLogRun, askAboutLogs, POPULAR_MODELS } from "./index.js";

// Load .env file if it exists
function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").trim();
        if (key && value) {
          process.env[key.trim()] = value.replace(/^["']|["']$/g, "");
        }
      }
    });
  }
}

loadEnvFile();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function convertJsonToVictoria(jsonContent: string): string {
  try {
    const data = JSON.parse(jsonContent);

    // Build Victoria format from JSON session
    let victoria = "";

    // Header with session info
    victoria += `^U SESSION: ${data.id}\n`;
    victoria += `^A TITLE: ${data.title}\n`;
    victoria += `^T CREATED: ${new Date(data.created_at * 1000).toISOString()}\n`;
    victoria += `^T UPDATED: ${new Date(data.updated_at * 1000).toISOString()}\n`;
    victoria += `^T STATS: prompt_tokens=${data.prompt_tokens}, completion_tokens=${data.completion_tokens}, cost=$${data.cost}\n`;
    victoria += `\n`;

    // Convert messages to events
    if (data.messages && Array.isArray(data.messages)) {
      for (const msg of data.messages) {
        victoria += `^U MESSAGE: ${msg.id}\n`;
        victoria += `^A ROLE: ${msg.role}\n`;
        victoria += `^T CREATED: ${new Date(msg.created_at * 1000).toISOString()}\n`;

        if (msg.message_type) {
          victoria += `^T TYPE: ${msg.message_type}\n`;
        }

        if (msg.model) {
          victoria += `^T MODEL: ${msg.model}\n`;
        }

        if (msg.provider) {
          victoria += `^T PROVIDER: ${msg.provider}\n`;
        }

        // Main content
        if (msg.content) {
          victoria += `\n${msg.content}\n`;
        }

        // Reasoning if thinking
        if (msg.reasoning) {
          victoria += `\n[THINKING]\n${msg.reasoning}\n[/THINKING]\n`;
        }

        victoria += `\n---\n\n`;
      }
    }

    return victoria;
  } catch (error) {
    // If JSON parsing fails, return original content
    return jsonContent;
  }
}

async function fetchLogs(
  urlOrSessionId: string,
  authToken?: string
): Promise<string> {
  let url = urlOrSessionId;

  // If it looks like a session ID (UUID format), convert to full URL
  if (!url.startsWith("http")) {
    url = `https://moc.elcanotek.com/logs/${url}`;
  }

  console.log(`\n🌐 Fetching logs from: ${url}`);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authToken) {
      headers["Authorization"] = authToken;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}` +
          (response.status === 401
            ? "\n\nAuthentication required. Check your auth token."
            : "")
      );
    }

    const content = await response.text();

    if (!content.trim()) {
      throw new Error("Received empty response from server");
    }

    // Convert JSON to Victoria format
    const victoriaFormat = convertJsonToVictoria(content);

    return victoriaFormat;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch logs: ${error.message}`);
    }
    throw error;
  }
}

async function main() {
  console.log("\n🔍 Remote Log Analyzer");
  console.log("═".repeat(50));

  // Check for API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("❌ Error: OPENROUTER_API_KEY environment variable not set");
    console.error("\nTo get started:");
    console.error("1. Sign up at https://openrouter.ai");
    console.error("2. Get your API key from https://openrouter.ai/keys");
    console.error("3. Set it: $env:OPENROUTER_API_KEY = 'sk-...'");
    process.exit(1);
  }

  // Get session ID or URL
  let logContent = "";
  let authToken = process.env.LOG_AUTH_TOKEN;

  if (process.argv[2]) {
    // Fetch from remote URL or session ID
    try {
      logContent = await fetchLogs(process.argv[2], authToken);
      console.log(`✓ Successfully fetched logs`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ ${error.message}`);
      } else {
        console.error("❌ Failed to fetch logs");
      }
      process.exit(1);
    }
  } else {
    // Prompt for session ID or URL
    const input = await question("\nEnter session ID or log URL: ");
    if (!input.trim()) {
      console.error("❌ Session ID or URL required");
      process.exit(1);
    }

    // Ask for auth token if available
    if (!authToken) {
      const tokenInput = await question(
        "Auth token (optional, press Enter to skip): "
      );
      if (tokenInput.trim()) {
        authToken = tokenInput.trim();
      }
    }

    try {
      logContent = await fetchLogs(input, authToken);
      console.log(`✓ Successfully fetched logs`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ ${error.message}`);
      } else {
        console.error("❌ Failed to fetch logs");
      }
      process.exit(1);
    }
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
