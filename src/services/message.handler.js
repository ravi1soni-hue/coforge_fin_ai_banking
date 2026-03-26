import WebSocket from "ws";

// Static responses for testing (will replace with LLM later)
const STATIC_RESPONSES = [
  "That's interesting! Tell me more.",
  "I understand. What would you like to know?",
  "Got it! How can I help you with that?",
  "I hear you. Let me help with that.",
  "Thanks for sharing. What's next?",
];

let responseIndex = 0;

export const handleMessageToSender = async (ws, rawMessage) => {
  try {
    const clientMessage = JSON.parse(rawMessage);
    console.log("[MessageHandler] Parsed message:", clientMessage);

    // 🔧 TEMPORARY: Static response (will replace with LLM)
    const staticResponse = STATIC_RESPONSES[responseIndex % STATIC_RESPONSES.length];
    responseIndex++;

    const serverMessage = {
      type: "SERVER_MESSAGE",
      payload: {
        from: "server",
        text: `Server: "${staticResponse}" (You said: "${clientMessage?.payload?.text || 'no text'}")`,
        timestamp: Date.now(),
      },
    };

    console.log("[MessageHandler] Sending response:", serverMessage);
    send(ws, serverMessage);
  } catch (error) {
    console.error("[MessageHandler] Error:", error);
    send(ws, {
      type: "ERROR",
      payload: {
        message: "Invalid message format",
        error: error.message,
      },
    });
  }
};

/* ------------------- helpers ------------------- */

const send = (ws, data) => {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      console.log(`✅ Response sent: ${data.type}`);
    } else {
      console.error(`❌ WebSocket not open. State: ${ws.readyState}`);
    }
  } catch (error) {
    console.error(`❌ Error sending response:`, error);
  }
};