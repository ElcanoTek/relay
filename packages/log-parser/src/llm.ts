/**
 * LLM Integration Layer
 * Uses OpenRouter to access multiple LLM providers
 * Provides a simple interface to ask questions about agent logs
 */

import type { ParsedRun } from "./types.js";

/**
 * Configuration for OpenRouter
 */
export interface OpenRouterConfig {
  apiKey: string;
  model?: string; 
}

/**
 * Question/Answer about logs
 */
export interface LogAnalysis {
  question: string;
  answer: string;
}

/**
 * Convert parsed run to text format for context
 */
export function toText(run: ParsedRun): string {
  const lines: string[] = [];

  lines.push("=== AGENT EXECUTION LOG ===\n");

  for (const event of run.events) {
    lines.push(`[${event.seq}] ${event.role.toUpperCase()} / ${event.type}`);

    if (event.model) lines.push(`    Model: ${event.model}`);
    if (event.time) lines.push(`    Time: ${event.time}`);
    if (event.toolName) lines.push(`    Tool: ${event.toolName}`);

    if (event.text) {
      lines.push("---");
      lines.push(event.text);
    }

    if (event.data?.calls) {
      lines.push("Tool Calls:");
      for (const call of event.data.calls as any[]) {
        lines.push(`  - ${call.tool}(${call.args_raw})`);
      }
    }

    lines.push("");
  }

  if (run.warnings.length > 0) {
    lines.push("=== WARNINGS ===");
    run.warnings.forEach((w: any) => lines.push(`  - ${w}`));
  }

  return lines.join("\n");
}

/**
 * Ask a question about agent logs using OpenRouter
 * 
 * @param run - The parsed agent log run
 * @param question - The question to ask about the logs
 * @param config - OpenRouter configuration
 * @returns The LLM's answer
 */
export async function askAboutLogs(
  run: ParsedRun,
  question: string,
  config: OpenRouterConfig
): Promise<LogAnalysis> {
  if (!config.apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable not set");
  }

  const logText = toText(run);

  const systemPrompt = `You are an AI assistant analyzing agent execution logs. 
The user will ask you questions about the log provided below. 
Answer based only on the information in the log.
Be concise and direct.`;

  const userPrompt = `Here is an agent execution log:

${logText}

Question: ${question}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/user/relay",
        "X-Title": "Relay Log Parser",
      },
      body: JSON.stringify({
        model: config.model || "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error: any = await response.json();
      const errorMsg = error.error?.message || response.statusText || "Unknown error";
      
      if (errorMsg.includes("cookie") || errorMsg.includes("credentials")) {
        throw new Error(
          `OpenRouter Authentication Failed: ${errorMsg}\n` +
          `Please verify your API key at: https://openrouter.ai/keys\n` +
          `Your account may need a credit balance or valid payment method.`
        );
      }
      
      throw new Error(`OpenRouter API Error: ${errorMsg}`);
    }

    const data: any = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
    }

    return {
      question,
      answer: data.choices[0].message.content,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unknown error: ${error}`);
  }
}

/**
 * Ask multiple questions about logs in sequence
 */
export async function askMultipleQuestions(
  run: ParsedRun,
  questions: string[],
  config: OpenRouterConfig
): Promise<LogAnalysis[]> {
  const results: LogAnalysis[] = [];

  for (const question of questions) {
    const analysis = await askAboutLogs(run, question, config);
    results.push(analysis);
  }

  return results;
}

/**
 * List available models on OpenRouter
 * Common models to use:
 * - openai/gpt-3.5-turbo (cheap, fast)
 * - openai/gpt-4-turbo (more capable)
 * - anthropic/claude-3-sonnet (good balance)
 * - anthropic/claude-3-opus (most capable)
 * - mistralai/mistral-7b (free tier)
 */
export const POPULAR_MODELS = [
  { id: "openai/gpt-3.5-turbo", name: "GPT-3.5 Turbo", cost: "cheap" },
  { id: "openai/gpt-4-turbo", name: "GPT-4 Turbo", cost: "expensive" },
  { id: "anthropic/claude-3-sonnet", name: "Claude 3 Sonnet", cost: "moderate" },
  { id: "anthropic/claude-3-opus", name: "Claude 3 Opus", cost: "expensive" },
  { id: "mistralai/mistral-7b", name: "Mistral 7B", cost: "free" },
  { id: "google/gemini-pro", name: "Gemini Pro", cost: "moderate" },
];

