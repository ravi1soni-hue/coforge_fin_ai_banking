#!/usr/bin/env node

/**
 * WebSocket Test Client for locally testing
 * Usage: node test-socket.js
 */

import WebSocket from "ws";

const DEPLOYED_URL = "wss://coforge-fin-ai-banking.railway.app";
// For local testing, use: "ws://localhost:3000"

// Simulate multiple users connecting
async function testSocket() {
  console.log("🧪 Testing WebSocket Connection...\n");

  const userId = `user-${Date.now()}`;
  const wsUrl = `${DEPLOYED_URL}?userId=${userId}`;

  console.log(`📡 Connecting to: ${wsUrl}\n`);

  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log(
      `✅ CONNECTED - User: ${userId}\n`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
    );

    // Send multiple test messages
    setTimeout(() => {
      const msg = {
        type: "CHAT_MESSAGE",
        payload: {
          text: "Hello from test client! 👋",
          timestamp: Date.now(),
        },
      };
      console.log(`\n📤 Sending:`, JSON.stringify(msg, null, 2));
      ws.send(JSON.stringify(msg));
    }, 1000);

    // Send another message after 3 seconds
    setTimeout(() => {
      const msg = {
        type: "CHAT_MESSAGE",
        payload: {
          text: "This is a second test message 🚀",
          timestamp: Date.now(),
        },
      };
      console.log(`\n📤 Sending:`, JSON.stringify(msg, null, 2));
      ws.send(JSON.stringify(msg));
    }, 3000);

    // Close connection after 10 seconds
    setTimeout(() => {
      console.log("\n\n⏹️  Closing connection...");
      ws.close();
    }, 10000);
  });

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data);
      console.log(
        `\n📥 Received:`,
        JSON.stringify(parsed, null, 2)
      );
    } catch (e) {
      console.log(`\n📥 Received (raw):`, data);
    }
  });

  ws.on("error", (error) => {
    console.error("❌ Connection Error:", error.message);
  });

  ws.on("close", () => {
    console.log("\n\n✅ Connection closed\n");
    process.exit(0);
  });
}

testSocket().catch(console.error);
