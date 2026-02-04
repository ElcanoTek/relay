# Relay

Relay is a lightweight Chromium extension for uploading local logs into ChatGPT, Gemini, or Claude for analysis.

## Repository layout
- `packages/relay-log-uploader` - The MV3 extension source
- `logs` - Sample or captured task logs (optional)

## Quick start
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `packages/relay-log-uploader`.
4. Pick your provider, choose log files, and click **Open new chat + upload**.

## Notes
- The extension looks for a file input in the provider UI and injects files into it.
- If providers change their upload UI, the content script may need updates.
- Screenshots should live here in the future, referenced by this README.
