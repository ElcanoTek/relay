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
