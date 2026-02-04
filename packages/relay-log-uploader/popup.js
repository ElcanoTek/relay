const logFilesInput = document.getElementById("logFiles");
const fileSummary = document.getElementById("fileSummary");
const uploadBtn = document.getElementById("uploadBtn");
const statusEl = document.getElementById("status");
const providerSelect = document.getElementById("providerSelect");
const includeNonJsonToggle = document.getElementById("includeNonJson");
const includePromptToggle = document.getElementById("includePrompt");
const autoSendPromptToggle = document.getElementById("autoSendPrompt");
const reviewPromptInput = document.getElementById("reviewPrompt");

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
  includeNonJsonToggle.checked = stored.includeNonJson;
  includePromptToggle.checked = stored.includePrompt;
  autoSendPromptToggle.checked = stored.autoSendPrompt;
  reviewPromptInput.value = stored.reviewPrompt || DEFAULT_REVIEW_PROMPT;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    provider: providerSelect.value,
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

includeNonJsonToggle.addEventListener("change", async () => {
  await saveSettings();
  setStatus("");
  applyFileFilter();
});

includePromptToggle.addEventListener("change", async () => {
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

    const rawPrompt = (reviewPromptInput.value || "").trim();
    const shouldIncludePrompt = includePromptToggle.checked || rawPrompt.length > 0;
    const promptText = shouldIncludePrompt
      ? rawPrompt || DEFAULT_REVIEW_PROMPT
      : "";

    const result = await sendMessageToBackground({
      type: "OPEN_AND_UPLOAD",
      files: payload,
      provider: providerSelect.value,
      prompt: promptText,
      autoSendPrompt: autoSendPromptToggle.checked,
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
