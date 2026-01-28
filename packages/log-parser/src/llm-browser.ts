/**
 * BrowserOS MCP LLM Provider
 * 
 * Properly communicates with BrowserOS via MCP (Model Context Protocol)
 * BrowserOS automates ChatGPT/Claude web interface
 * No API keys needed - uses browser session authentication
 */

export interface BrowserOSConfig {
  mcpServerUrl: string;
  service: "chatgpt" | "claude";
}

export interface BrowserLLMResponse {
  question: string;
  answer: string;
  provider: "browser-chatgpt" | "browser-claude";
}

/**
 * Query LLM through BrowserOS MCP server
 * BrowserOS handles browser automation and interaction with ChatGPT/Claude
 */
export async function queryLLMViaBrowser(
  logContent: string,
  question: string,
  config: BrowserOSConfig
): Promise<BrowserLLMResponse> {
  const mcpUrl = config.mcpServerUrl.replace(/\/$/, "");

  try {
    console.log(`\n🌐 Using BrowserOS MCP Server`);
    console.log(`   URL: ${mcpUrl}`);
    console.log(`   Service: ${config.service}`);
    console.log(`   ℹ️  Browser window will open for interaction\n`);

    const fullPrompt = `Here is an agent execution log:

\`\`\`
${logContent}
\`\`\`

Question: ${question}

Please analyze the log and answer the question. Base your answer only on the information provided in the log.`;

    // Call BrowserOS MCP with proper tool invocation
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.random(),
        method: "tools/call",
        params: {
          name: "query_llm_browser",
          arguments: {
            service: config.service,
            prompt: fullPrompt,
            timeout: 120000, // 2 minutes timeout
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `BrowserOS MCP Server Error (${response.status}):\n${errorText}\n\n` +
        `Make sure BrowserOS MCP is running at: ${mcpUrl}\n` +
        `You can start it with: npx @browseros/mcp`
      );
    }

    const data: any = await response.json();

    // Handle MCP response format
    if (data.error) {
      throw new Error(`BrowserOS Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Extract answer from MCP result
    let answer = "";
    if (typeof data.result === "string") {
      answer = data.result;
    } else if (data.result?.content?.[0]?.text) {
      answer = data.result.content[0].text;
    } else if (data.result?.answer) {
      answer = data.result.answer;
    } else {
      throw new Error(`Invalid MCP response format: ${JSON.stringify(data)}`);
    }

    return {
      question,
      answer: answer.trim(),
      provider: config.service === "chatgpt" ? "browser-chatgpt" : "browser-claude",
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`BrowserOS query failed: ${error}`);
  }
}

/**
 * Check if BrowserOS MCP server is available and responding
 */
export async function checkBrowserOSConnection(mcpServerUrl: string): Promise<boolean> {
  try {
    const url = mcpServerUrl.replace(/\/$/, "");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok || response.status === 400; // Both are valid MCP responses
    } catch (e) {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    return false;
  }
}
