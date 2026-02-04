const PROVIDERS = {
  chatgpt: "https://chatgpt.com/",
  gemini: "https://gemini.google.com/app",
  claude: "https://claude.ai/new"
};

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openProviderTab(providerKey) {
  const url = PROVIDERS[providerKey] || PROVIDERS.chatgpt;
  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabComplete(tab.id);
  return tab;
}

function mocHook() {
  if (window.__relayMocHook) return;
  window.__relayMocHook = true;

  function isLogsEndpoint(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.pathname.startsWith("/logs/");
    } catch (_error) {
      return false;
    }
  }

  function postUrl(url, contentType) {
    window.postMessage(
      {
        source: "relay-moc",
        type: "LOGS_URL",
        url,
        contentType: contentType || ""
      },
      "*"
    );
  }

  function postPayload(url, contentType, text) {
    window.postMessage(
      {
        source: "relay-moc",
        type: "LOGS_PAYLOAD",
        url,
        contentType: contentType || "application/json",
        text: text || ""
      },
      "*"
    );
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      const contentType = response.headers && response.headers.get
        ? response.headers.get("content-type") || ""
        : "";
      if (isLogsEndpoint(url)) {
        postUrl(url, contentType);
        response.clone().text().then((text) => {
          postPayload(url, contentType, text);
        }).catch(() => {});
      }
    } catch (_error) {
      // ignore
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__relayUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        const url = this.__relayUrl;
        const contentType = this.getResponseHeader("content-type") || "";
        if (isLogsEndpoint(url)) {
          postUrl(url, contentType);
          if (typeof this.responseText === "string") {
            postPayload(url, contentType, this.responseText);
          }
        }
      } catch (_error) {
        // ignore
      }
    });
    return originalSend.apply(this, args);
  };
}

function parseFilenameFromHeaders(headers, fallbackName) {
  const contentDisposition = headers.get("content-disposition") || "";
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (_error) {
      return utf8Match[1];
    }
  }
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (filenameMatch?.[1]) {
    return filenameMatch[1];
  }
  return fallbackName;
}

function filenameFromUrl(url, fallbackName) {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop();
    return lastSegment || fallbackName;
  } catch (_error) {
    return fallbackName;
  }
}

async function fetchFileAsPayload(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to fetch logs (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") || "application/json";
  const fallbackName = filenameFromUrl(url, "moc-logs.json");
  const filename = parseFilenameFromHeaders(response.headers, fallbackName);
  const arrayBuffer = await response.arrayBuffer();
  return [
    {
      name: filename,
      type: contentType || "application/octet-stream",
      lastModified: Date.now(),
      data: Array.from(new Uint8Array(arrayBuffer))
    }
  ];
}

async function sendFilesToTab(tabId, files, provider) {
  const message = { type: "UPLOAD_FILES", files };
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    for (const frame of frames) {
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(resp);
        });
      });
      if (response?.ok) {
        return response;
      }
    }
  } catch (_error) {
    // ignore and fall back
  }
  return chrome.tabs.sendMessage(tabId, message);
}

async function retrySendFiles(tabId, files, provider) {
  const timeoutMs = provider === "gemini" ? 20000 : 12000;
  const start = Date.now();
  let lastError = "No frame handled the upload.";

  while (Date.now() - start < timeoutMs) {
    const result = await sendFilesToTab(tabId, files, provider);
    if (result?.ok) {
      return result;
    }
    lastError = result?.error || lastError;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  return { ok: false, error: lastError };
}

const DEFAULT_REVIEW_PROMPT = `You are reviewing an agent interaction log. Provide structured, actionable feedback.

Output format (use these exact headings):
1) Executive Summary
- 3 bullets max.
2) Strengths
- Specific behaviors that were good.
3) Issues / Risks
- Concrete problems, with evidence from the log.
4) Missed Opportunities
- Things the agent should have done but didn't.
5) Suggested Improvements
- Actionable steps (numbered), prioritized.
6) Checklist for Next Run
- Short checklist to guide the next attempt.

Failure Detection & Explanation (mandatory):
- ONLY produce a Failure Analysis Report if there is explicit log evidence of failure.
- If failure evidence exists, append a "Failure Analysis Report" after the normal sections (do not replace them).
- Failure Analysis Report must include:
  failure_stage (one of: discovery, download, normalization, analysis, reconciliation, reporting, delivery)
  failure_type (one of: no_matching_reports, incorrect_report_type, missing_date_coverage, tool_call_error, schema_mismatch, reconciliation_failure, execution_timeout, logic_violation, unknown)
  evidence (quote exact log lines/tool outputs)
  root_cause_hypothesis (clearly mark hypotheses vs confirmed facts)
  impact_assessment
  remediation_steps

Constraints:
- Cite evidence by quoting short snippets (max 1 sentence each).
- Do not infer or invent causes.
- If the log is incomplete, say so and what is missing.
- Keep total length under 400 words.`;

async function loadPromptSettings() {
  const stored = await chrome.storage.sync.get({
    includePrompt: true,
    reviewPrompt: "",
    autoSendPrompt: false
  });
  const rawPrompt = (stored.reviewPrompt || "").trim();
  const includePrompt = stored.includePrompt || rawPrompt.length > 0;
  return {
    prompt: includePrompt ? (rawPrompt || DEFAULT_REVIEW_PROMPT) : "",
    autoSendPrompt: stored.autoSendPrompt === true,
    includePrompt
  };
}

async function sendPromptToTab(tabId, prompt, autoSend) {
  if (!prompt) return { ok: true };
  const message = { type: "INSERT_PROMPT", prompt, autoSend };
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    for (const frame of frames) {
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(resp);
        });
      });
      if (response?.ok) {
        return response;
      }
    }
  } catch (_error) {
    // ignore and fall back
  }
  return chrome.tabs.sendMessage(tabId, message);
}

async function injectPromptWithScripting(tabId, prompt, autoSend) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "MAIN",
    func: async (promptText, shouldSend) => {
      const selectors = [
        '[data-testid="prompt-textarea"]',
        'textarea[placeholder*="Message"]',
        'textarea[aria-label*="Message"]',
        'textarea',
        'div[contenteditable="true"]',
        '[contenteditable="true"]',
        '[role="textbox"]',
        '[aria-label*="Message"]'
      ];

      const findInShadow = (root) => {
        if (!root) return null;
        for (const sel of selectors) {
          const hit = root.querySelector?.(sel);
          if (hit) return hit;
        }
        const candidates = root.querySelectorAll
          ? root.querySelectorAll('[contenteditable="true"],[role="textbox"],textarea,[aria-label]')
          : [];
        for (const node of candidates) {
          const label = (node.getAttribute?.("aria-label") || "").toLowerCase();
          if (label.includes("message")) return node;
        }
        const walker = root.querySelectorAll ? root.querySelectorAll("*") : [];
        for (const node of walker) {
          if (node.shadowRoot) {
            const found = findInShadow(node.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };

      const summarizeMatches = () => {
        const summary = selectors.map((sel) => {
          const nodes = Array.from(document.querySelectorAll(sel));
          return `${sel}: ${nodes.length}`;
        });
        const editableCount = document.querySelectorAll('[contenteditable="true"]').length;
        const textboxCount = document.querySelectorAll('[role="textbox"]').length;
        summary.push(`[contenteditable="true"]: ${editableCount}`);
        summary.push(`[role="textbox"]: ${textboxCount}`);
        return summary.join("\n");
      };

      const setOverlay = () => {};

      const waitForComposer = async (timeoutMs = 15000, intervalMs = 300) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const composer =
            selectors.map((sel) => document.querySelector(sel)).find(Boolean) ||
            findInShadow(document) ||
            null;
          const active = document.activeElement;
          const activeMatches =
            active &&
            (active.tagName === "TEXTAREA" ||
              active.tagName === "INPUT" ||
              active.getAttribute?.("contenteditable") === "true" ||
              active.getAttribute?.("role") === "textbox" ||
              (active.getAttribute?.("aria-label") || "").toLowerCase().includes("message"))
              ? active
              : null;
          if (composer && composer.isConnected && !composer.disabled) {
            return composer;
          }
          if (activeMatches && activeMatches.isConnected && !activeMatches.disabled) {
            return activeMatches;
          }
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        return null;
      };

      setOverlay();
      const composer = await waitForComposer();
      if (!composer) {
        return { ok: false, error: "Composer not found." };
      }

      let matchedSelector = "shadow";
      for (const sel of selectors) {
        if (document.querySelector(sel) === composer) {
          matchedSelector = sel;
          break;
        }
      }

      try {
        if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
          const proto = composer.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) {
            setter.call(composer, promptText);
          } else {
            composer.value = promptText;
          }
        } else {
          composer.textContent = promptText;
        }
        composer.dispatchEvent(new Event("input", { bubbles: true }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));
        composer.focus();
      } catch (error) {
        return { ok: false, error: error?.message || "Failed to set prompt." };
      }

      if (!shouldSend) {
        return { ok: true };
      }

      const sendButton =
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[aria-label="Send prompt"]') ||
        document.querySelector('button[aria-label="Send message"]') ||
        document.querySelector('button[aria-label="Send"]');

      if (sendButton && !sendButton.disabled) {
        sendButton.click();
        return { ok: true };
      }

      // Fallback: try Enter key
      composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      composer.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      return { ok: true };
    },
    args: [prompt, autoSend]
  });

  const result = results?.[0]?.result;
  return result || { ok: false, error: "Prompt injection failed." };
}

async function retrySendPrompt(tabId, prompt, autoSend) {
  const start = Date.now();
  const timeoutMs = 15000;
  let lastError = "Prompt insert failed.";
  while (Date.now() - start < timeoutMs) {
    const result = await sendPromptToTab(tabId, prompt, autoSend);
    if (result?.ok) {
      return result;
    }
    const injected = await injectPromptWithScripting(tabId, prompt, autoSend);
    if (injected?.ok) {
      return injected;
    }
    lastError = injected?.error || result?.error || lastError;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return { ok: false, error: lastError };
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPEN_AND_UPLOAD") {
    const files = message.files || [];
    const provider = message.provider || "chatgpt";
    const prompt = message.prompt || "";
    const autoSendPrompt = message.autoSendPrompt === true;
    const includePrompt = message.includePrompt === true;

    (async () => {
      try {
        const tab = await openProviderTab(provider);
        const result = await retrySendFiles(tab.id, files, provider);
        const promptSettings = prompt
          ? { prompt, autoSendPrompt, includePrompt }
          : await loadPromptSettings();
        if (promptSettings.prompt) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await retrySendPrompt(tab.id, promptSettings.prompt, promptSettings.autoSendPrompt);
        }
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || "Failed to open provider." });
      }
    })();

    return true;
  }
  if (message?.type === "OPEN_AND_UPLOAD_FROM_URL") {
    const provider = message.provider || "chatgpt";
    const url = message.url;
    const overridePrompt = (message.prompt || "").trim();
    const overrideAutoSend = message.autoSendPrompt === true;
    if (!url) {
      sendResponse({ ok: false, error: "No URL provided." });
      return true;
    }

    (async () => {
      try {
        const files = await fetchFileAsPayload(url);
        const promptSettings = overridePrompt
          ? { prompt: overridePrompt, autoSendPrompt: overrideAutoSend, includePrompt: true }
          : await loadPromptSettings();
        const tab = await openProviderTab(provider);
        const result = await retrySendFiles(tab.id, files, provider);
        if (promptSettings.prompt) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await retrySendPrompt(tab.id, promptSettings.prompt, promptSettings.autoSendPrompt);
        }
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || "Failed to fetch URL." });
      }
    })();

    return true;
  }
  if (message?.type === "MOC_INJECT_HOOK") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No active tab." });
      return true;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: mocHook
      },
      () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true });
      }
    );

    return true;
  }
});
