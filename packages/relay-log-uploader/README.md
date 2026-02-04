# Relay Log Uploader (Chrome MV3)

Minimal Chromium extension that uploads local JSON logs to ChatGPT, Gemini, or Claude.

## Load the extension
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `packages/relay-log-uploader`.
4. Make sure you're logged in to your provider (ChatGPT, Gemini, or Claude).
5. Click the extension icon, choose log files, then click **Open new chat + upload**.

## Notes
- Uploading relies on finding a file input in the provider UI; if it changes, the extension may need updates.
- Large files may hit Chrome message size limits; use fewer files or the paste fallback.
- By default, only JSON files are uploaded; enable the toggle to include .log/.txt files.

## Files
- `manifest.json` - MV3 manifest
- `popup.html` / `popup.css` / `popup.js` - UI
- `content-script.js` - Injects files into supported provider pages
