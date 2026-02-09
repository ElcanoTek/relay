const MOC_HOST = "moc.elcanotek.com";
const IS_MOC = window.location.hostname.includes(MOC_HOST);

function findFileInput(root = document) {
  return root.querySelector('input[type="file"]');
}

function findFileInputDeep() {
  const direct = findFileInput();
  if (direct) return direct;

  const walk = (node) => {
    if (!node) return null;
    if (node.shadowRoot) {
      const found = findFileInput(node.shadowRoot);
      if (found) return found;
    }
    for (const child of node.children || []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };

  return walk(document.body);
}

function getProvider() {
  const host = window.location.hostname;
  if (host.includes("gemini.google.com")) return "gemini";
  if (host.includes("claude.ai")) return "claude";
  return "chatgpt";
}

let lastTriggerAt = 0;
let geminiUploadClicked = false;

function findClickableForLabelText(labelText) {
  const target = labelText.toLowerCase();
  const nodes = Array.from(document.querySelectorAll("*"));
  for (const node of nodes) {
    const text = (node.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text === target || text.includes(target)) {
      const clickable = node.closest('button, [role="button"], [role="menuitem"], [role="menuitemradio"]');
      if (clickable) return clickable;
    }
  }
  return null;
}

function tryClickUploadTriggers(provider) {
  const now = Date.now();
  if (now - lastTriggerAt < 400) {
    return false;
  }

  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="menuitemradio"], [aria-label]')
  );

  const providerTerms = {
    gemini: ["open upload file menu", "upload files", "upload file", "add files", "add file", "attach", "file"],
    claude: ["upload", "attach", "add file", "file"],
    chatgpt: ["upload", "attach", "add file", "file"]
  };

  const terms = providerTerms[provider] || providerTerms.chatgpt;

  for (const el of candidates) {
    const label = `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (!label) continue;
    if (label.includes("new chat") || label.includes("new conversation")) continue;
    if (provider === "gemini" && geminiUploadClicked) {
      return false;
    }

    if (provider === "gemini") {
      if (!geminiUploadClicked) {
        const uploadEl =
          (label === "upload files" && el) ||
          findClickableForLabelText("upload files");
        if (uploadEl) {
          lastTriggerAt = now;
          geminiUploadClicked = true;
          uploadEl.click();
          return true;
        }
      }

      if (label === "open upload file menu") {
        lastTriggerAt = now;
        el.click();
        return true;
      }
    }

    if (terms.some((term) => label.includes(term))) {
      lastTriggerAt = now;
      el.click();
      return true;
    }
  }

  return false;
}

function waitForFileInput(timeoutMs = 12000, intervalMs = 300) {
  return new Promise((resolve, reject) => {
    const provider = getProvider();
    const start = Date.now();
    const timer = setInterval(() => {
      const input = findFileInputDeep();
      if (input) {
        clearInterval(timer);
        resolve(input);
        return;
      }

      tryClickUploadTriggers(provider);

      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("No file input found on the provider."));
      }
    }, intervalMs);
  });
}

function findComposer() {
  return (
    document.querySelector('[data-testid="prompt-textarea"]') ||
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('[role="textbox"]')
  );
}

function getComposerCandidates() {
  const selectors = [
    '[data-testid="prompt-textarea"]',
    'textarea[placeholder*="Message"]',
    'textarea[aria-label*="Message"]',
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[aria-label*="Message"]'
  ];
  const nodes = selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel)));
  return Array.from(new Set(nodes));
}

function pickBestComposer() {
  const candidates = getComposerCandidates();
  let best = null;
  let bestArea = 0;
  for (const node of candidates) {
    if (!isComposerReady(node)) continue;
    const rect = node.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = node;
    }
  }
  return best;
}

function summarizeComposerMatches() {
  const selectors = [
    '[data-testid="prompt-textarea"]',
    'textarea[placeholder*="Message"]',
    'textarea[aria-label*="Message"]',
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[aria-label*="Message"]'
  ];
  const summary = selectors.map((sel) => {
    const count = document.querySelectorAll(sel).length;
    return `${sel}: ${count}`;
  });
  return summary.join("\n");
}

function findComposerDeep() {
  const direct = findComposer();
  if (direct) return direct;

  const walk = (node) => {
    if (!node) return null;
    if (node.shadowRoot) {
      const found = node.shadowRoot.querySelector("textarea, [contenteditable=\"true\"], [role=\"textbox\"]");
      if (found) return found;
    }
    for (const child of node.children || []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };

  return walk(document.body);
}

function setComposerValue(composer, text) {
  if (!composer) return false;
  if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(
      composer.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )?.set;
    if (setter) {
      setter.call(composer, text);
    } else {
      composer.value = text;
    }
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
    composer.focus();
    return true;
  }

  composer.focus();
  try {
    const range = document.createRange();
    range.selectNodeContents(composer);
    range.deleteContents();
  } catch (_error) {
    // ignore
  }

  const inserted = document.execCommand && document.execCommand("insertText", false, text);
  if (!inserted) {
    composer.textContent = text;
  }

  composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  return true;
}

function findSendButton() {
  return (
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label="Send prompt"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[aria-label="Send"]')
  );
}

async function clickSendButton(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = findSendButton();
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function triggerSend(composer) {
  if (!composer) return false;
  const eventInit = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };
  composer.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  composer.dispatchEvent(new KeyboardEvent("keypress", eventInit));
  composer.dispatchEvent(new KeyboardEvent("keyup", eventInit));
  return true;
}

async function insertPromptWithRetry(prompt, autoSend, attempts = 5) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const composer = await waitForComposer(6000, 250);
      composer.click();
      const ok = setComposerValue(composer, prompt || "");
      if (ok) {
        if (autoSend) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const sent = await clickSendButton(15000);
          if (!sent) {
            triggerSend(composer);
          }
        }
        return { ok: true };
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ok: false, error: lastError?.message || "Prompt insert failed." };
}

function isComposerReady(composer) {
  if (!composer || !composer.isConnected) return false;
  if (composer.disabled) return false;
  const style = window.getComputedStyle(composer);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

function waitForComposer(timeoutMs = 12000, intervalMs = 300) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const composer = pickBestComposer() || findComposerDeep();
      if (composer && isComposerReady(composer)) {
        clearInterval(timer);
        resolve(composer);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error("No composer found on the provider."));
      }
    }, intervalMs);
  });
}

function buildDataTransfer(filePayloads) {
  const dataTransfer = new DataTransfer();
  for (const payload of filePayloads) {
    const bytes = new Uint8Array(payload.data);
    const file = new File([bytes], payload.name, {
      type: payload.type || "application/json",
      lastModified: payload.lastModified || Date.now()
    });
    dataTransfer.items.add(file);
  }
  return dataTransfer;
}

async function injectFilesDefault(filePayloads) {
  const input = await waitForFileInput();
  const dataTransfer = buildDataTransfer(filePayloads);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

async function injectFiles(filePayloads) {
  return injectFilesDefault(filePayloads);
}

function canHandleUpload(provider) {
  if (findFileInputDeep()) return true;
  if (provider === "gemini") return true;
  return false;
}

let mocHookRequested = false;

function requestMocHook() {
  if (mocHookRequested) return;
  mocHookRequested = true;
  chrome.runtime.sendMessage({ type: "MOC_INJECT_HOOK" });
}

if (IS_MOC) {
  setupMocRelay();
}

let mocLastLogsUrl = null;
let mocLastLogsText = null;
let mocLastLogsType = "application/json";
let mocLastLogsTaskId = null;
let mocStatusEl = null;
let mocSendButton = null;
let mocDownloadButton = null;

function setupMocRelay() {
  injectRelayStyles();
  requestMocHook();
  observeMocDom();
  window.addEventListener("message", handleMocMessage);
}

function observeMocDom() {
  const observer = new MutationObserver(() => {
    tryInjectMocButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryInjectMocButton();
}

function injectRelayStyles() {
  if (document.getElementById("relay-moc-style")) return;
  const style = document.createElement("style");
  style.id = "relay-moc-style";
  style.textContent = `
    .relay-moc-button {
      margin-left: 8px;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: linear-gradient(135deg, #8fd6ff, #6ab7ff);
      color: #0b1525;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    .relay-moc-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .relay-moc-status {
      margin-left: 10px;
      font-size: 11px;
      color: #b9c5ff;
    }
  `;
  document.head.appendChild(style);
}

function tryInjectMocButton() {
  const downloadBtn = findDownloadLogsButton();
  if (!downloadBtn) return;

  if (mocSendButton && mocSendButton.isConnected) {
    return;
  }

  mocDownloadButton = downloadBtn;
  mocLastLogsTaskId = downloadBtn.getAttribute("data-task-id") || null;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Send to Relay";
  button.className = "relay-moc-button";
  button.addEventListener("click", () => {
    handleSendToRelayClick();
  });

  const status = document.createElement("span");
  status.className = "relay-moc-status";
  status.textContent = "";

  mocSendButton = button;
  mocStatusEl = status;

  downloadBtn.insertAdjacentElement("afterend", status);
  downloadBtn.insertAdjacentElement("afterend", button);
}

function setMocStatus(message, isError = false) {
  if (!mocStatusEl) return;
  mocStatusEl.textContent = message;
  mocStatusEl.style.color = isError ? "#f7b2b2" : "#b9c5ff";
}

function findDownloadLogsButton() {
  const direct = document.querySelector("button.download-logs-btn[data-task-id]");
  if (direct) return direct;
  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], a, [data-action]')
  );
  for (const el of candidates) {
    const text = (el.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.includes("download logs")) {
      return el;
    }
  }
  return null;
}

function extractUrlFromElement(el) {
  if (!el) return null;
  if (el.href) return el.href;
  const dataUrl = el.getAttribute("data-url") || el.getAttribute("data-href");
  return dataUrl || null;
}

function buildMocFilename() {
  if (mocLastLogsTaskId) {
    return `task-${mocLastLogsTaskId}-logs.json`;
  }
  if (mocLastLogsUrl) {
    const parts = mocLastLogsUrl.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      return `task-${last}-logs.json`;
    }
  }
  return "moc-logs.json";
}

async function handleSendToRelayClick() {
  if (!mocSendButton) return;
  mocSendButton.disabled = true;
  setMocStatus("Preparing logs...");

  try {
    const { provider, uploadTarget, includePrompt, autoSendPrompt, reviewPrompt } = await getStoredRelaySettings();
    const resolvedTarget = uploadTarget === "recent" ? "recent" : "new";
    const promptText = includePrompt ? (reviewPrompt || "") : "";
    const focusTab = resolvedTarget !== "new" || includePrompt || autoSendPrompt;

    mocLastLogsText = null;
    mocLastLogsType = "application/json";

    const url = mocLastLogsUrl || extractUrlFromElement(mocDownloadButton);
    if (url) {
      mocLastLogsUrl = url;
    }

    if (mocDownloadButton) {
      mocDownloadButton.click();
    }

    const payload = await waitForLogsPayload(8000);
    if (!payload) {
      setMocStatus("Could not capture logs. Click Download Logs once, then try again.", true);
      return;
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(payload.text || "");
    const files = [
      {
        name: buildMocFilename(),
        type: payload.type || "application/json",
        lastModified: Date.now(),
        data: Array.from(bytes)
      }
    ];

    const response = await chrome.runtime.sendMessage({
      type: "OPEN_AND_UPLOAD",
      files,
      provider,
      uploadTarget: resolvedTarget,
      reuseRecentTab: resolvedTarget === "recent",
      focusTab,
      skipPrompt: includePrompt === false,
      prompt: promptText,
      autoSendPrompt: includePrompt ? autoSendPrompt : false,
      includePrompt: includePrompt === true
    });

    if (response?.ok) {
      if (resolvedTarget === "recent") {
        if (response.openedNew) {
          setMocStatus("No provider tab found. Opened a new chat and sent logs.");
        } else {
          setMocStatus("Sent logs to your most recent provider chat.");
        }
      } else {
        setMocStatus("Opened a new chat and sent logs.");
      }
    } else {
      setMocStatus(response?.error || "Failed to send logs.", true);
    }
  } catch (error) {
    setMocStatus(error.message || "Failed to send logs.", true);
  } finally {
    mocSendButton.disabled = false;
  }
}

function waitForLogsPayload(timeoutMs) {
  return new Promise((resolve) => {
    if (mocLastLogsText) {
      resolve({ text: mocLastLogsText, type: mocLastLogsType });
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      if (mocLastLogsText) {
        clearInterval(timer);
        resolve({ text: mocLastLogsText, type: mocLastLogsType });
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 200);
  });
}

function handleMocMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "relay-moc") return;

  if (data.type === "LOGS_URL") {
    mocLastLogsUrl = data.url;return;
  }

  if (data.type === "LOGS_PAYLOAD") {
    mocLastLogsUrl = data.url || mocLastLogsUrl;
    mocLastLogsText = data.text || null;
    mocLastLogsType = data.contentType || "application/json";}
}

async function getStoredRelaySettings() {
  const stored = await chrome.storage.sync.get({
    provider: "chatgpt",
    uploadTarget: "new",
    includePrompt: true,
    autoSendPrompt: false,
    reviewPrompt: ""
  });
  return {
    provider: stored.provider || "chatgpt",
    uploadTarget: stored.uploadTarget || "new",
    includePrompt: stored.includePrompt === true,
    autoSendPrompt: stored.autoSendPrompt === true,
    reviewPrompt: (stored.reviewPrompt || "").trim()
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "UPLOAD_FILES") {
    const provider = getProvider();
    geminiUploadClicked = false;
    if (!canHandleUpload(provider)) {
      sendResponse({ ok: false, error: "UI not ready" });
      return true;
    }
    (async () => {
      try {
        const result = await injectFiles(message.files || []);
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: error.message || "Upload failed." });
      }
    })();
    return true;
  }
  if (message?.type === "INSERT_PROMPT") {
    (async () => {
      try {
        const result = await insertPromptWithRetry(message.prompt || "", message.autoSend);
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: error.message || "Prompt insert failed." });
      }
    })();
    return true;
  }

  sendResponse({ ok: false, error: "Unsupported message." });
  return true;
});

