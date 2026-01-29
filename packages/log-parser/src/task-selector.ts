/**
 * Interactive Task Selector & Query Tool
 * 
 * Fetch previous tasks, select one, and query it with LLM
 * Supports: BrowserOS (no API key), OpenRouter, OpenAI
 * 
 * Usage:
 *   node dist/task-selector.js
 */

import * as readline from "readline";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { parseJsonLog, askAboutLogs, POPULAR_MODELS } from "./index.js";
import { queryLLMViaBrowser, checkBrowserOSConnection } from "./llm-browser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file if it exists
function loadEnvFile(): string[] {
  const envPaths = [
    // dist/ -> package root
    path.join(__dirname, "..", ".env"),
    // dist/ -> repo root
    path.join(__dirname, "..", "..", "..", ".env"),
  ];

  const loadedPaths: string[] = [];
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").trim();
        if (key && value) process.env[key.trim()] = value.replace(/^["']|["']$/g, "");
      }
    });
    loadedPaths.push(envPath);
  }
  return loadedPaths;
}

const loadedEnvPaths = loadEnvFile();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Note: These are read fresh from process.env, not cached
function getConfig() {
  return {
    API_KEY: process.env.OPENROUTER_API_KEY,
    AUTH_TOKEN: process.env.LOG_AUTH_TOKEN,
    CSRF_TOKEN: process.env.LOG_CSRF_TOKEN,
    AUTH_COOKIE: process.env.LOG_AUTH_COOKIE,
    MODEL: process.env.LOG_MODEL || "openai/gpt-4-turbo",
    TASKS_API: process.env.LOG_TASKS_API || "https://moc.elcanotek.com/tasks",
    BASE_URL: process.env.LOG_BASE_URL || "https://moc.elcanotek.com/logs",
    LIMIT: parseInt(process.env.LOG_PREVIOUS_LIMIT || "50", 10),
  };
}

const AUTH_TOKEN = getConfig().AUTH_TOKEN;

interface Task {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
}

interface TaskWithDerivedTitle extends Task {
  _derivedTitle?: string;
}

function normalizeTitle(value?: string, maxLength = 80): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function getTaskDisplayTitle(task: Task): string {
  const explicit = normalizeTitle(task.title) || normalizeTitle(task.name);
  if (explicit) return explicit;
  const desc = normalizeTitle(task.description, 60);
  if (desc) return desc;
  const derived = normalizeTitle((task as TaskWithDerivedTitle)._derivedTitle, 80);
  if (derived) return derived;
  if (task.id) return `Task ${task.id.slice(0, 8)}`;
  return "Untitled";
}

function buildAuthHeaders(): Record<string, string> {
  const { AUTH_TOKEN, CSRF_TOKEN, AUTH_COOKIE } = getConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) headers.Authorization = AUTH_TOKEN;
  if (CSRF_TOKEN) headers["x-csrf-token"] = CSRF_TOKEN;
  if (AUTH_COOKIE) headers.Cookie = AUTH_COOKIE;
  return headers;
}

function deriveTitleFromLog(logJsonData: any): string | undefined {
  const direct =
    normalizeTitle(logJsonData?.title) ||
    normalizeTitle(logJsonData?.name) ||
    normalizeTitle(logJsonData?.task_title) ||
    normalizeTitle(logJsonData?.taskName) ||
    normalizeTitle(logJsonData?.task?.title) ||
    normalizeTitle(logJsonData?.task?.name) ||
    normalizeTitle(logJsonData?.task?.description) ||
    normalizeTitle(logJsonData?.task?.prompt) ||
    normalizeTitle(logJsonData?.prompt);
  if (direct) return direct;

  const messages =
    (Array.isArray(logJsonData) && logJsonData) ||
    logJsonData?.messages ||
    logJsonData?.data?.messages ||
    logJsonData?.log?.messages ||
    logJsonData?.run?.messages ||
    logJsonData?.payload?.messages ||
    [];
  if (!Array.isArray(messages)) return undefined;

  const firstUser = messages.find(
    (msg: any) => msg?.role === "user" && typeof msg?.content === "string"
  );
  const firstUserContent = firstUser?.content || logJsonData?.events?.find(
    (evt: any) => evt?.role === "user" && typeof evt?.text === "string"
  )?.text;
  if (!firstUserContent) return undefined;

  const lines = firstUserContent
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("you are ") && line.length < 60) continue;
    if (lower.startsWith("important") || lower.startsWith("critical")) continue;
    if (lower.startsWith("##")) continue;
    const sentence = line.split(/[.!?]/)[0]?.trim() || "";
    const candidate = normalizeTitle(sentence || line, 80);
    if (candidate) return candidate;
  }

  return normalizeTitle(firstUserContent, 60);
}

async function enrichTasksWithDerivedTitles(tasks: Task[]): Promise<TaskWithDerivedTitle[]> {
  const enriched: TaskWithDerivedTitle[] = [];
  for (const task of tasks) {
    const explicit = normalizeTitle(task.title) || normalizeTitle(task.name) || normalizeTitle(task.description);
    if (explicit) {
      enriched.push(task);
      continue;
    }

    const logContent = await fetchTaskLog(task.id);
    if (logContent) {
      const derived = deriveTitleFromLog(logContent);
      enriched.push({ ...task, _derivedTitle: derived });
    } else {
      enriched.push(task);
    }
  }
  return enriched;
}

async function fetchTasks(): Promise<Task[]> {
  try {
    const { TASKS_API, AUTH_TOKEN, LIMIT } = getConfig();
    console.log(`\n🌐 Fetching tasks from: ${TASKS_API}`);
    const response = await fetch(`${TASKS_API}?limit=${LIMIT}&offset=0`, {
      headers: buildAuthHeaders(),
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch tasks: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json() as any;
    const tasks = Array.isArray(data) ? data : data.tasks || data.data || [];
    return tasks as Task[];
  } catch (error) {
    console.error(`❌ Error fetching tasks: ${error}`);
    return [];
  }
}

async function fetchTaskLog(taskId: string): Promise<any | null> {
  try {
    const { BASE_URL } = getConfig();
    const url = `${BASE_URL}/${taskId}`;
    const response = await fetch(url, {
      headers: buildAuthHeaders(),
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch log for ${taskId}: ${response.status} ${response.statusText}`);
      return null;
    }

    // Return JSON directly - no conversion needed
    return await response.json();
  } catch (error) {
    console.error(`❌ Error fetching task log: ${error}`);
    return null;
  }
}

function formatTaskForDisplay(task: Task, index: number): string {
  const title = getTaskDisplayTitle(task);
  const created = task.created_at ? new Date(task.created_at).toLocaleString() : "N/A";
  const status = task.status ? ` [${task.status}]` : "";
  return `${index + 1}. ${title}${status} - ${created}`;
}

async function selectLLMProvider(): Promise<{
  type: "browser" | "api";
  config: any;
}> {
  console.log("\n🤖 LLM Provider Options:");
  console.log("  0: 🌐 Browser (ChatGPT/Claude - no API key needed)");
  console.log("  1: OpenRouter API");
  console.log("  2: OpenAI API (ChatGPT)");

  const choice = await question("Select provider (0-2): ");

  // Browser option
  if (choice === "0") {
    const mcpUrl = process.env.BROWSEROS_MCP_URL;
    if (!mcpUrl) {
      console.error("❌ BROWSEROS_MCP_URL not set in .env");
      return selectLLMProvider();
    }

    console.log("\n🔍 Checking BrowserOS connection...");
    const connected = await checkBrowserOSConnection(mcpUrl);
    if (!connected) {
      console.error(`❌ Cannot connect to BrowserOS at: ${mcpUrl}`);
      console.error("   Make sure BrowserOS MCP server is running");
      return selectLLMProvider();
    }

    console.log("✓ BrowserOS connected!");
    const serviceInput = await question(
      "Which service? (chatgpt/claude) [chatgpt]: "
    );

    return {
      type: "browser",
      config: {
        mcpServerUrl: mcpUrl,
        service: serviceInput.toLowerCase() === "claude" ? "claude" : "chatgpt",
      },
    };
  }

  // OpenRouter option
  if (choice === "1") {
    const { API_KEY, MODEL } = getConfig();
    
    console.log(`\n📋 Configuration Status:`);
    console.log(`   API Key: ${API_KEY ? "✓ Set (" + API_KEY.substring(0, 15) + "...)" : "❌ Not set"}`);

    if (!API_KEY) {
      console.error("❌ OPENROUTER_API_KEY not set in .env");
      return selectLLMProvider();
    }
    
    // Let user select model
    // const selectedModel = await selectModel(MODEL);
    
    // console.log(`✓ Using OpenRouter with ${selectedModel}`);
    // return {
    //   type: "api",
    //   config: { provider: "openrouter", apiKey: API_KEY, model: selectedModel },
    // };

    console.log(`✓ Using OpenRouter with default model: ${MODEL}`);
    return {
        type: "api",
        config: { provider: "openrouter", apiKey: API_KEY, model: MODEL },
    };
  }

  // OpenAI option
  if (choice === "2") {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error("❌ OPENAI_API_KEY not set in .env");
      return selectLLMProvider();
    }
    console.log("✓ Using OpenAI");
    return {
      type: "api",
      config: { provider: "openai", apiKey: openaiKey, model: "gpt-3.5-turbo" },
    };
  }

  console.log("Invalid choice");
  return selectLLMProvider();
}

async function selectModel(defaultModel: string): Promise<string> {
  console.log("\n🤖 Available Models (via OpenRouter):");
  const topModels = POPULAR_MODELS.slice(0, 5);
  topModels.forEach((model, i) => {
    const isDefault = model.id === defaultModel ? " (default)" : "";
    console.log(`  ${i}: ${model.name}${isDefault}`);
    console.log(`     Cost: ${model.cost}`);
  });

  const choice = await question("\nSelect model (0-4): ");
  const index = parseInt(choice, 10);

  if (index >= 0 && index < topModels.length) {
    return topModels[index].id;
  }

  console.log("Invalid choice, using default model");
  return defaultModel;
}

async function queryLog(logJsonData: any, taskTitle: string): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 Task: ${taskTitle}`);
  console.log(`${"=".repeat(60)}\n`);

  // Parse the log from JSON
  let run;
  try {
    run = parseJsonLog(logJsonData);
    console.log(`✓ Parsed ${run.events.length} events`);
    if (run.warnings.length > 0) {
      console.log(`⚠️  ${run.warnings.length} warnings`);
    }
  } catch (error) {
    console.error(`❌ Failed to parse log: ${error}`);
    return;
  }

  // Select LLM provider
  const llmChoice = await selectLLMProvider();

  // Interactive questioning
  console.log(`\n💬 Ask questions about this log (type 'exit' or 'back' to return to task list):\n`);

  while (true) {
    const userQuestion = await question("Your question: ");

    const normalizedQuestion = userQuestion.trim().toLowerCase();
    if (normalizedQuestion === "exit" || normalizedQuestion === "back") {
      break;
    }

    if (!normalizedQuestion) {
      continue;
    }

    try {
      console.log(`\n⏳ Analyzing...\n`);

      let answer: string;

      if (llmChoice.type === "browser") {
        // Use BrowserOS - pass JSON as string
        const logString = typeof logJsonData === "string" ? logJsonData : JSON.stringify(logJsonData);
        const response = await queryLLMViaBrowser(logString, userQuestion, llmChoice.config);
        answer = response.answer;
        console.log(`🌐 (${response.provider})`);
      } else {
        // Use API-based provider
        const analysis = await askAboutLogs(run, userQuestion, llmChoice.config as any);
        answer = (analysis as any).answer;
      }

      console.log(`📊 Answer: ${answer}\n`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ Error: ${error.message}\n`);
      } else {
        console.error(`❌ Error: ${error}\n`);
      }
    }
  }
}

async function main() {
  console.log("\n🔍 Task Log Query Tool");
  console.log(`${"=".repeat(60)}`);

  // Load fresh configuration from environment
  const { API_KEY, MODEL, TASKS_API, AUTH_TOKEN } = getConfig();

  // Debug: Show environment status
  console.log("\n📋 Configuration Status:");
  console.log(`  ✓ Loaded .env from: ${loadedEnvPaths.length ? loadedEnvPaths.join(", ") : "none"}`);
  console.log(`  ✓ OPENROUTER_API_KEY: ${API_KEY ? "✓ Set (" + API_KEY.substring(0, 10) + "...)" : "❌ Not set"}`);
  console.log(`  ✓ LOG_AUTH_TOKEN: ${AUTH_TOKEN ? "✓ Set" : "❌ Not set"}`);
  console.log(`  ✓ LOG_CSRF_TOKEN: ${getConfig().CSRF_TOKEN ? "✓ Set" : "❌ Not set"}`);
  console.log(`  ✓ Tasks API: ${TASKS_API}`);
  console.log(`  ✓ Model: ${MODEL}\n`);

  if (!API_KEY) {
    console.error("❌ OPENROUTER_API_KEY not set in .env");
    console.error("   Get one from: https://openrouter.ai/keys");
    process.exit(1);
  }

  if (!API_KEY.includes("sk-or-v1-") && !API_KEY.includes("sk-your")) {
    console.warn("\n⚠️  Warning: API key format looks unusual");
    console.warn("   Should start with 'sk-or-v1-'");
  }

  if (!AUTH_TOKEN) {
    console.error("❌ LOG_AUTH_TOKEN not set in .env");
    process.exit(1);
  }

  // Fetch tasks
  const tasks = await fetchTasks();

  if (tasks.length === 0) {
    console.error("❌ No tasks found");
    rl.close();
    process.exit(1);
  }

  console.log(`\n✓ Found ${tasks.length} tasks\n`);

  const tasksWithTitles = await enrichTasksWithDerivedTitles(tasks);

  // Main loop
  while (true) {
    // Display tasks
    console.log("\n📋 Available Tasks:");
    console.log("-".repeat(60));
    tasksWithTitles.forEach((task, i) => {
      console.log(formatTaskForDisplay(task, i));
    });
    console.log("-".repeat(60));

    const choice = await question("\nSelect task (1-" + tasksWithTitles.length + ") or 'exit': ");

    // if (choice.toLowerCase() === "exit") {
    //   break;
    // }

    const normalizedChoice = choice.trim().toLowerCase();
    if (normalizedChoice === "exit") {
        console.log("\n👋 Goodbye!");
        rl.close();
        return;
    }


    const taskIndex = parseInt(normalizedChoice, 10) - 1;

    if (taskIndex < 0 || taskIndex >= tasksWithTitles.length) {
      console.log("❌ Invalid selection");
      continue;
    }

    const selectedTask = tasksWithTitles[taskIndex];
    console.log(`\n⏳ Fetching log for: ${selectedTask.title || selectedTask.name || "Unknown"}...`);

    const logContent = await fetchTaskLog(selectedTask.id);

    if (!logContent) {
      console.error("❌ Failed to fetch log content");
      continue;
    }

    const baseTitle = getTaskDisplayTitle(selectedTask);
    const derivedTitle = deriveTitleFromLog(logContent);
    const finalTitle =
      normalizeTitle(selectedTask.title) || normalizeTitle(selectedTask.name)
        ? baseTitle
        : derivedTitle || baseTitle;

    // Query the log
    await queryLog(logContent, finalTitle);
  }

  console.log("\n👋 Goodbye!");
  rl.close();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});


