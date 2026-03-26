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
    console.log("[MessageHandler] Received raw message:", rawMessage);
    
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

    console.log("[MessageHandler] Created server message:", serverMessage);
    console.log("[MessageHandler] WebSocket state:", ws.readyState, "Expected OPEN: 1");
    
    send(ws, serverMessage);
  } catch (error) {
    console.error("[MessageHandler] Error:", error.message, error.stack);
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
    console.log("[Send] Starting send, ws.readyState:", ws.readyState);
    
    if (!ws) {
      console.error("[Send] ❌ WebSocket object is null");
      return;
    }
    
    // WebSocket.OPEN = 1, but we'll check numerically to be safe
    if (ws.readyState === 1) { 
      const jsonStr = JSON.stringify(data);
      ws.send(jsonStr);
      console.log(`[Send] ✅ Response sent: ${data.type}`);
    } else {
      console.error(`[Send] ❌ WebSocket not open. State: ${ws.readyState} (1=OPEN, 0=CONNECTING, 2=CLOSING, 3=CLOSED)`);
    }
  } catch (error) {
    console.error(`[Send] ❌ Error sending response:`, error.message);
  }
};