/**
 * Utility functions for log conversion and processing
 */

/**
 * Convert JSON log format (from web API) to Victoria format
 * JSON logs come from moc.elcanotek.com with a messages array
 * Victoria format is lines like: ROLE\nCONTENT\n\n
 */
export function convertJsonToVictoria(jsonData: any): string {
  const messages = jsonData.messages || [];
  let victoria = "";

  for (const msg of messages) {
    const role = msg.role?.toUpperCase() || "USER";
    victoria += `${role}\n`;
    victoria += `${msg.content || ""}\n\n`;
  }

  return victoria.trim();
}

/**
 * Detect if log content is in JSON format (from web API)
 */
export function isJsonLog(content: string): boolean {
  try {
    const data = JSON.parse(content);
    return !!(data.messages || data.data);
  } catch {
    return false;
  }
}

/**
 * Parse either Victoria or JSON format log
 */
export function normalizeLogFormat(content: string): string {
  if (isJsonLog(content)) {
    const data = JSON.parse(content);
    return convertJsonToVictoria(data);
  }
  return content;
}
