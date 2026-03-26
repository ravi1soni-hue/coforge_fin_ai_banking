# WebSocket Configuration - Static Response Testing Guide

## ✅ What Was Fixed

Your WebSocket server now has:

1. **Heartbeat/Ping-Pong** - Keeps connections alive and prevents timeout
2. **Connection Establishment Message** - Confirms connection is working
3. **Error Handling** - Better error logging and recovery
4. **Static Responses** - Temporary responses for testing (will integrate LLM later)
5. **Request Logging** - Tracks all incoming requests

---

## 🧪 Test Your Connection Now

### Step 1: Stop your old backend (if running)
```bash
# If running locally
pkill -f "npm start"
```

### Step 2: Deploy new backend
The backend is already deployed to Railway. It will auto-update in 1-2 minutes after the git push.

### Step 3: Restart Flutter App
```bash
flutter clean
flutter pub get
flutter run
```

### Step 4: Test Message Flow

1. **Enter User ID:** `ravi123` (or any unique ID)
2. **Click:** Start Chat
3. **You should see:**
   - ✅ Status: "Connected"
   - ✅ Welcome message: "Welcome ravi123!"

4. **Send Message:** Type `Hi` → Click Send

5. **You should RECEIVE:**
   - Your message: "Hi"
   - Server response: "Server: That's interesting! Tell me more. (You said: Hi)"

---

## 📊 Console Logs (What to Expect)

### When Connection Established
```
[CoforgeChat] 📡 WS: Connecting to: wss://coforge-fin-ai-banking.railway.app?userId=ravi123
[CoforgeChat] ✅ WebSocket connected
[CoforgeChat] 📨 Raw message: {"type":"CONNECTION_ESTABLISHED",...}
[CoforgeChat] 📨 Parsed message type: CONNECTION_ESTABLISHED
```

### When Sending Message
```
[CoforgeChat] 📤 Sending: {"type":"CHAT_MESSAGE","payload":{"text":"Hi",...}}
[CoforgeChat] 📨 Raw message: {"type":"SERVER_MESSAGE","payload":{"text":"Server: That's interesting! Tell me more..."}}
```

---

## 🔄 Server-Side Static Responses

Current static responses rotate through:
- "That's interesting! Tell me more."
- "I understand. What would you like to know?"
- "Got it! How can I help you with that?"
- "I hear you. Let me help with that."
- "Thanks for sharing. What's next?"

**Each message gets the next response in the list.**

---

## 🚀 Integrate LLM Later (OpenAI GPT-5)

When ready to integrate your OpenAI API key, replace in `src/services/message.handler.js`:

### Current (Static):
```javascript
const STATIC_RESPONSES = [
  "That's interesting! Tell me more.",
  "I understand. What would you like to know?",
  // ...
];

let responseIndex = 0;

export const handleMessageToSender = async (ws, rawMessage) => {
  const clientMessage = JSON.parse(rawMessage);
  const staticResponse = STATIC_RESPONSES[responseIndex % STATIC_RESPONSES.length];
  responseIndex++;
  // ... send staticResponse
};
```

### Replace With (LLM):
```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handleMessageToSender = async (ws, rawMessage) => {
  try {
    const clientMessage = JSON.parse(rawMessage);
    const userText = clientMessage?.payload?.text;

    // Call ChatGPT-5
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "user",
          content: userText,
        },
      ],
      max_tokens: 500,
    });

    const aiResponse = response.choices[0].message.content;

    send(ws, {
      type: "SERVER_MESSAGE",
      payload: {
        from: "server",
        text: aiResponse,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error("OpenAI Error:", error);
    send(ws, {
      type: "ERROR",
      payload: {
        message: "AI service error",
        error: error.message,
      },
    });
  }
};
```

### Dependencies to Add:
```bash
npm install openai
```

### Update package.json:
```json
{
  "dependencies": {
    "openai": "^4.0.0"
  }
}
```

---

## 📝 Testing Checklist

- [ ] Flutter app starts without errors
- [ ] Can enter user ID and start chat
- [ ] Connection Indicator shows "Connected ✅"
- [ ] Can send message "Hi"
- [ ] Receive response from server
- [ ] Response appears in chat bubble
- [ ] Console logs show all steps
- [ ] Can send multiple messages
- [ ] Responses rotate through static list
- [ ] App auto-reconnects if connection drops

---

## 🐛 Troubleshooting

### "Still not receiving messages"
Check Flutter logs:
```bash
flutter logs
```

Look for:
```
[CoforgeChat] 📨 Raw message: {"type":"SERVER_MESSAGE",...}
```

If you don't see this, the message handler on server isn't sending.

### "Connection keeps closing"
Check that you're using correct URL:
```
wss://coforge-fin-ai-banking.railway.app?userId=YOUR_USER_ID
```

Not:
```
ws://localhost:3000  # This is for local development
```

### "OpenAI API Key Error" (when you integrate LLM)
Ensure environment variable is set in Railway:
```
OPENAI_API_KEY=1bb83fa3-7e28-4261-ab66-81b96231d4dc
```

---

## 📝 Future: Advanced Features

Once basic test works, add:

1. **Chat History** - Persist messages to PostgreSQL
2. **Typing Indicator** - Show when user is typing
3. **User Presence** - Show who's connected
4. **Message Reactions** - Add emoji reactions
5. **File Sharing** - Send images/documents
6. **User Typing Status** - Send `typing` event

---

## 🎯 How It Works Now

```
Flutter App                          Node.js Server
    ↓                                    ↓
User sends "Hi"                    Receives message
    ↓                                    ↓
Parse to JSON                      Parse payload
    ↓                                    ↓
Send via WebSocket                 Get static response
    ↓                                    ↓
    ←--- Send response back ---
    ↓
Receive response
    ↓
Parse response
    ↓
Add to messages list
    ↓
Show in chat bubble
```

---

## ✅ Summary

✅ WebSocket is now **properly configured**  
✅ Connection keeps **alive with heartbeat**  
✅ Static responses **ready for testing**  
✅ Error handling **in place**  
✅ Ready to integrate **LLM when you want**  

**Test now and let me know if you receive messages!** 🚀
