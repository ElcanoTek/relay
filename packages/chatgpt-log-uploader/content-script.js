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
      // Once we hit Upload files, stop spamming other Gemini controls.
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
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('[role="textbox"]')
  );
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

  sendResponse({ ok: false, error: 'Unsupported message.' });
  return true;
});
