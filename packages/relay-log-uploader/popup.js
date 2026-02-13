const logFilesInput = document.getElementById("logFiles");
const fileSummary = document.getElementById("fileSummary");
const uploadBtn = document.getElementById("uploadBtn");
const statusEl = document.getElementById("status");
const providerSelect = document.getElementById("providerSelect");
const uploadTargetSelect = document.getElementById("uploadTarget");
const includeNonJsonToggle = document.getElementById("includeNonJson");
const includePromptToggle = document.getElementById("includePrompt");
const autoSendPromptToggle = document.getElementById("autoSendPrompt");
const reviewPromptInput = document.getElementById("reviewPrompt");
const tabWarning = document.getElementById("tabWarning");
const uploadMode = document.getElementById("uploadMode");

const JSON_EXTENSIONS = [".json", ".jsonl", ".ndjson"];
const NON_JSON_EXTENSIONS = [".log", ".txt"];

let rawSelectedFiles = [];
let selectedFiles = [];
let ignoredFiles = [];

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
    useCurrentTab: false,
    uploadTarget: "",
    includeNonJson: false,
    includePrompt: true,
    autoSendPrompt: false,
    reviewPrompt: DEFAULT_REVIEW_PROMPT
  });
  const normalizedPrompt = (stored.reviewPrompt || "").trim();
  const shouldResetPrompt =
    normalizedPrompt.length === 0 ||
    normalizedPrompt.length < DEFAULT_REVIEW_PROMPT.length * 0.6;
  if (shouldResetPrompt) {
    stored.reviewPrompt = DEFAULT_REVIEW_PROMPT;
    await chrome.storage.sync.set({ reviewPrompt: DEFAULT_REVIEW_PROMPT });
  }
  providerSelect.value = stored.provider;
  const legacyUseCurrent = stored.useCurrentTab === true;
  const normalizedTarget = (stored.uploadTarget || "").trim();
  const targetValue = normalizedTarget || (legacyUseCurrent ? "recent" : "new");
  if (targetValue === "new" || targetValue === "recent") {
    uploadTargetSelect.value = targetValue;
  } else {
    uploadTargetSelect.value = "new";
    await chrome.storage.sync.set({ uploadTarget: "new" });
  }
  includeNonJsonToggle.checked = stored.includeNonJson;
  includePromptToggle.checked = stored.includePrompt;
  autoSendPromptToggle.checked = stored.includePrompt ? stored.autoSendPrompt : false;
  autoSendPromptToggle.disabled = !stored.includePrompt;
  reviewPromptInput.value = stored.reviewPrompt || DEFAULT_REVIEW_PROMPT;
  if (!stored.includePrompt && stored.autoSendPrompt) {
    await chrome.storage.sync.set({ autoSendPrompt: false });
  }
  await updateCurrentTabState();
}

async function saveSettings() {
  await chrome.storage.sync.set({
    provider: providerSelect.value,
    uploadTarget: uploadTargetSelect.value,
    useCurrentTab: false,
    includeNonJson: includeNonJsonToggle.checked,
    includePrompt: includePromptToggle.checked,
    autoSendPrompt: autoSendPromptToggle.checked,
    reviewPrompt: reviewPromptInput.value
  });
}

providerSelect.addEventListener("change", async () => {
  await saveSettings();
  setStatus("");
});

uploadTargetSelect.addEventListener("change", async () => {
  await saveSettings();
  setStatus("");
  await updateCurrentTabState();
});

includeNonJsonToggle.addEventListener("change", async () => {
  await saveSettings();
  setStatus("");
  applyFileFilter();
});

includePromptToggle.addEventListener("change", async () => {
  if (!includePromptToggle.checked) {
    autoSendPromptToggle.checked = false;
    autoSendPromptToggle.disabled = true;
  } else {
    autoSendPromptToggle.disabled = false;
  }
  await saveSettings();
  setStatus("");
});

autoSendPromptToggle.addEventListener("change", async () => {
  await saveSettings();
  setStatus("");
});

reviewPromptInput.addEventListener("input", async () => {
  await saveSettings();
});

function providerFromUrl(url) {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    if (hostname.includes("gemini.google.com")) return "gemini";
    if (hostname.includes("claude.ai")) return "claude";
    if (hostname.includes("chatgpt.com") || hostname.includes("chat.openai.com")) return "chatgpt";
    return null;
  } catch (_error) {
    return null;
  }
}

function setTabWarning(message) {
  if (!tabWarning) return;
  if (message) {
    tabWarning.textContent = message;
    tabWarning.hidden = false;
  } else {
    tabWarning.hidden = true;
  }
}

function updateUploadModeText() {
  if (!uploadMode) return;
  const target = uploadTargetSelect.value;
  if (target === "recent") {
    uploadMode.textContent = "Uses the most recent provider tab.";
    return;
  }
  uploadMode.textContent = "Opens a new chat for upload.";
}

async function updateCurrentTabState() {
  const target = uploadTargetSelect.value;
  const useRecent = target === "recent";
  providerSelect.disabled = useRecent;
  updateUploadModeText();
  if (!useRecent) {
    setTabWarning("");
    return;
  }

  const tabs = await chrome.tabs.query({});
  const providerTabs = tabs
    .map((tab) => ({ tab, provider: providerFromUrl(tab.url) }))
    .filter((entry) => entry.provider);
  if (providerTabs.length === 0) {
    setTabWarning("No provider tab found. A new chat will be opened.");
    return;
  }
  providerTabs.sort((a, b) => (b.tab.lastAccessed || 0) - (a.tab.lastAccessed || 0));
  providerSelect.value = providerTabs[0].provider;
  setTabWarning("");
}


logFilesInput.addEventListener("change", () => {
  rawSelectedFiles = Array.from(logFilesInput.files || []);
  setStatus("");
  applyFileFilter();
});

uploadBtn.addEventListener("click", async () => {
  try {
    await saveSettings();
    setStatus("Preparing files…");
    const payload = await readFilesAsPayload();
    setStatus("Opening provider…");

    const rawPrompt = (reviewPromptInput.value || "").trim();
    const shouldIncludePrompt = includePromptToggle.checked;
    const promptText = shouldIncludePrompt ? rawPrompt || DEFAULT_REVIEW_PROMPT : "";
    const uploadTarget = uploadTargetSelect.value === "recent" ? "recent" : "new";

    const focusTab = uploadTarget !== "new" || shouldIncludePrompt || autoSendPromptToggle.checked;
    const result = await sendMessageToBackground({
      type: "OPEN_AND_UPLOAD",
      files: payload,
      provider: providerSelect.value,
      uploadTarget,
      reuseRecentTab: uploadTarget === "recent",
      focusTab,
      skipPrompt: !shouldIncludePrompt,
      prompt: promptText,
      autoSendPrompt: shouldIncludePrompt && autoSendPromptToggle.checked,
      includePrompt: shouldIncludePrompt
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
