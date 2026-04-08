const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");

// Random userId
const userId = "9c441277-ad2f-4774-adb8-425b095fc566"
;

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
    addBotMessage(payload.message || "Something went wrong.");
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
  socket.send(text);
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