# Relay

Relay is a lightweight Chromium extension for uploading local logs into ChatGPT, Gemini, or Claude for analysis.

<img src="docs/images/MOCGif.gif" alt="MOC workflow" width="1200" />

MOC workflow demo showing a full task run and results summary.

## Why Relay
- Fast path from local logs to LLM analysis.
- Works across multiple providers with one workflow.
- Uploads go directly to the selected provider (no Relay backend).

## Screenshots
<img src="docs/images/POPUPGIF.gif" alt="Popup file explorer workflow" width="1200" />

Popup workflow demo showing provider selection and file upload flow.

## Repository layout
- `packages/relay-log-uploader` - The MV3 extension source
- `docs/images` - README screenshots

## Quick start
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `packages/relay-log-uploader`.
4. Pick your provider, choose log files, and click **Open new chat + upload**.

## Notes
- The extension looks for a file input in the provider UI and injects files into it.
- If providers change their upload UI, the content script may need updates.
