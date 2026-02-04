const logFilesInput = document.getElementById("logFiles");
const fileSummary = document.getElementById("fileSummary");
const uploadBtn = document.getElementById("uploadBtn");
const statusEl = document.getElementById("status");
const providerSelect = document.getElementById("providerSelect");
const includeNonJsonToggle = document.getElementById("includeNonJson");

const JSON_EXTENSIONS = [".json", ".jsonl", ".ndjson"];
const NON_JSON_EXTENSIONS = [".log", ".txt"];

let rawSelectedFiles = [];
let selectedFiles = [];
let ignoredFiles = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f06a6a" : "";
}

function getExtension(filename) {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
}

function isJsonFile(file) {
  const extension = getExtension(file.name);
  if (JSON_EXTENSIONS.includes(extension)) {
    return true;
  }
  return file.type.toLowerCase().includes("json");
}

function isAcceptedFile(file) {
  if (isJsonFile(file)) {
    return true;
  }
  if (!includeNonJsonToggle.checked) {
    return false;
  }
  const extension = getExtension(file.name);
  return NON_JSON_EXTENSIONS.includes(extension);
}

function updateSummary() {
  if (selectedFiles.length === 0) {
    if (rawSelectedFiles.length === 0) {
      fileSummary.textContent = "No files selected.";
    } else if (includeNonJsonToggle.checked) {
      fileSummary.textContent = "No supported files found in selection.";
    } else {
      fileSummary.textContent = `${ignoredFiles.length} file(s) ignored (non-JSON).`;
    }
    uploadBtn.disabled = true;
    return;
  }

  const totalBytes = selectedFiles.reduce((acc, file) => acc + file.size, 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  const ignoredMessage =
    ignoredFiles.length > 0 ? `, ${ignoredFiles.length} ignored` : "";
  fileSummary.textContent = `${selectedFiles.length} file(s), ${totalMb} MB total${ignoredMessage}`;
  uploadBtn.disabled = false;
}

function applyFileFilter() {
  selectedFiles = rawSelectedFiles.filter((file) => isAcceptedFile(file));
  ignoredFiles = rawSelectedFiles.filter((file) => !isAcceptedFile(file));
  updateSummary();
}

async function readFilesAsPayload() {
  const payload = [];
  for (const file of selectedFiles) {
    const arrayBuffer = await file.arrayBuffer();
    payload.push({
      name: file.name,
      type: file.type || "application/json",
      lastModified: file.lastModified,
      data: Array.from(new Uint8Array(arrayBuffer))
    });
  }
  return payload;
}

async function sendMessageToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get({
    provider: "chatgpt",
    includeNonJson: false
  });
  providerSelect.value = stored.provider;
  includeNonJsonToggle.checked = stored.includeNonJson;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    provider: providerSelect.value,
    includeNonJson: includeNonJsonToggle.checked
  });
}

providerSelect.addEventListener("change", async () => {
  await saveSettings();
  setStatus("");
});

includeNonJsonToggle.addEventListener("change", async () => {
  await saveSettings();
  setStatus("");
  applyFileFilter();
});

logFilesInput.addEventListener("change", () => {
  rawSelectedFiles = Array.from(logFilesInput.files || []);
  setStatus("");
  applyFileFilter();
});

uploadBtn.addEventListener("click", async () => {
  try {
    setStatus("Preparing files…");
    const payload = await readFilesAsPayload();
    setStatus("Opening provider…");

    const result = await sendMessageToBackground({
      type: "OPEN_AND_UPLOAD",
      files: payload,
      provider: providerSelect.value
    });

    if (result?.ok) {
      setStatus("Provider opened. Files uploaded.");
    } else {
      setStatus(result?.error || "Upload failed.", true);
    }
  } catch (error) {
    setStatus(error.message || "Upload failed.", true);
  }
});

updateSummary();
loadSettings();
