/**
 * Test script to fetch and display raw logs
 */
import * as fs from "fs";

async function test() {
  const authToken = process.env.LOG_AUTH_TOKEN;
  if (!authToken) {
    console.error("LOG_AUTH_TOKEN not set");
    process.exit(1);
  }

  const url = "https://moc.elcanotek.com/logs/db30f519-3c37-4603-87e6-e8b7b9950d02";

  console.log("Fetching logs...");
  const response = await fetch(url, {
    headers: { Authorization: authToken },
  });

  if (!response.ok) {
    console.error(`Error: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const content = await response.text();
  console.log(`Got ${content.length} characters`);
  console.log("\n--- First 1000 chars (hex + text) ---\n");
  
  // Show hex and text
  const chunk = content.substring(0, 1000);
  console.log("TEXT:");
  console.log(chunk);
  console.log("\n\nHEX:");
  let hex = "";
  for (let i = 0; i < Math.min(200, chunk.length); i++) {
    hex += chunk.charCodeAt(i).toString(16).padStart(2, "0") + " ";
  }
  console.log(hex);

  // Save full content
  fs.writeFileSync("raw-logs.txt", content);
  console.log("\n✓ Full logs saved to raw-logs.txt");
}

test().catch(console.error);
