const logFilesInput = document.getElementById("logFiles");
const fileSummary = document.getElementById("fileSummary");
const uploadBtn = document.getElementById("uploadBtn");
const statusEl = document.getElementById("status");
const providerSelect = document.getElementById("providerSelect");

let selectedFiles = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#f06a6a" : "";
}

function updateSummary() {
  if (selectedFiles.length === 0) {
    fileSummary.textContent = "No files selected.";
    uploadBtn.disabled = true;
    return;
  }

  const totalBytes = selectedFiles.reduce((acc, file) => acc + file.size, 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  fileSummary.textContent = `${selectedFiles.length} file(s), ${totalMb} MB total`;
  uploadBtn.disabled = false;
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

async function loadProvider() {
  const stored = await chrome.storage.sync.get({ provider: "chatgpt" });
  providerSelect.value = stored.provider;
}

async function saveProvider() {
  await chrome.storage.sync.set({ provider: providerSelect.value });
}

providerSelect.addEventListener("change", async () => {
  await saveProvider();
  setStatus("");
});

logFilesInput.addEventListener("change", () => {
  selectedFiles = Array.from(logFilesInput.files || []);
  setStatus("");
  updateSummary();
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
loadProvider();