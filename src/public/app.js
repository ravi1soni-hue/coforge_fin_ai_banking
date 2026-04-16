const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");
 
// Canonical test identity used for both retail and corporate flows
const userId = "9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1";
 
 
// ✅ New session per connection
const sessionId = crypto.randomUUID();
 
 
// WebSocket connection
const socket = new WebSocket(
  `ws://localhost:3000?userId=${userId}`
);
 
socket.onopen = () => {
  addBotMessage("Hello! How can I help you with your finances today?");
};
 
socket.onmessage = (event) => {
  removeTyping();
 
  const payload = JSON.parse(event.data);
 
  if (payload.status === "success") {
    addBotMessage(payload.data.message);
  } else {
    addBotMessage(
      payload.error?.message || payload.message || "Something went wrong."
    );
  }
};
 
socket.onerror = () => {
  addBotMessage("WebSocket connection error.");
};
 
// Send message
function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
 
  addUserMessage(text);
 
  // Send structured payload; server still supports plain-text fallback.
  socket.send(
    JSON.stringify({
      v: 1,
      type: "CHAT_QUERY",
      requestId: `ui-${Date.now()}`,
      sessionId: sessionId,
      payload: {
        message: text,
      },
      meta: {
        platform: "web",
      },
    })
  );
  input.value = "";
 
  addTyping();
}
 
// UI helpers
function addUserMessage(text) {
  addMessage(text, "user");
}
 
function addBotMessage(text) {
  addMessage(text, "bot");
}
 
function addMessage(text, type) {
  const row = document.createElement("div");
  row.className = `message-row ${type}`;
 
  const bubble = document.createElement("div");
  bubble.className = "message";
  bubble.textContent = text;
 
  row.appendChild(bubble);
  chat.appendChild(row);
 
  chat.scrollTop = chat.scrollHeight;
}
 
function addTyping() {
  const row = document.createElement("div");
  row.className = "message-row bot";
  row.id = "typing";
 
  const bubble = document.createElement("div");
  bubble.className = "message typing";
  bubble.textContent = "Thinking...";
 
  row.appendChild(bubble);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}
 
function removeTyping() {
  const typing = document.getElementById("typing");
  if (typing) typing.remove();
}
 
// Send on Enter
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});