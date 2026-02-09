# Relay

Relay is a lightweight Chromium extension for uploading local logs into ChatGPT, Gemini, or Claude for analysis.

## Why Relay
- Fast path from local logs to LLM analysis.
- Works across multiple providers with one workflow.
- Uploads go directly to the selected provider (no Relay backend).

## What Relay Does
- Uploads local log files directly into a provider chat (ChatGPT, Gemini, Claude).
- Supports `.json`, `.jsonl`, `.ndjson` by default, with optional `.log` / `.txt`.
- Lets you choose the upload target: open a new chat or reuse your most recent provider tab.
- Optionally inserts a review prompt and auto-sends it.
- Works with MOC by capturing logs from the MOC page and sending them to your provider chat.
- Stores settings in Chrome sync so preferences persist across sessions.

<img src="docs/images/POPUPNEW.gif" alt="Popup new chat upload workflow" width="1200" />

The popup workflow for uploading logs into a brand new chat, including provider selection and prompt options.

<img src="docs/images/POPUPACTIVE.gif" alt="Popup most recent provider tab workflow" width="1200" />

The popup workflow for reusing your most recent provider tab instead of opening a new chat.

<img src="docs/images/MOCUPLOAD.gif" alt="MOC send-to-Relay workflow" width="1200" />

MOC workflow demo showing logs sent directly into your most recent provider chat, MOC workflow is based off the popup so if new chat is selected there, MOC will open new chat.

## Repository layout
- `packages/relay-log-uploader` - The MV3 extension source
- `docs/images` - README screenshots

## Quick start
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `packages/relay-log-uploader`.
4. Pick your provider, choose log files, select an upload target, and click **Upload logs**.

## Notes
- The extension looks for a file input in the provider UI and injects files into it.
- If providers change their upload UI, the content script may need updates.
