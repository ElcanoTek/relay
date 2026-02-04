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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPEN_AND_UPLOAD") {
    const files = message.files || [];
    const provider = message.provider || "chatgpt";

    (async () => {
      try {
        const tab = await openProviderTab(provider);
        const result = await retrySendFiles(tab.id, files, provider);
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
    if (!url) {
      sendResponse({ ok: false, error: "No URL provided." });
      return true;
    }

    (async () => {
      try {
        const files = await fetchFileAsPayload(url);
        const tab = await openProviderTab(provider);
        const result = await retrySendFiles(tab.id, files, provider);
        sendResponse({ ok: true, result });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || "Failed to fetch URL." });
      }
    })();

    return true;
  }
});
