# WebSocket Integration Guide

Your WebSocket service is now **LIVE** and ready for mobile apps! 🚀

> **WebSocket URL:** `wss://coforge-fin-ai-banking.railway.app?userId=YOUR_USER_ID`

---

## 📋 Connection Requirements

- **Protocol:** WebSocket Secure (WSS)
- **URL:** `wss://coforge-fin-ai-banking.railway.app`
- **Query Parameter:** `userId` (required, any string like `user-123`, `mobile-user-1`, etc.)
- **Message Format:** JSON

Example connection URL:
```
wss://coforge-fin-ai-banking.railway.app?userId=user-john-doe
```

---

## 🧪 Quick Test

### Option 1: Browser Test (Easiest)
1. Open your browser
2. Download the test file: `test-socket.html`
3. Open `test-socket.html` in your browser
4. Click "Connect" button
5. Send messages and see responses

### Option 2: Node.js Test
```bash
npm install ws  # if not already installed
node test-socket.js
```

Expected output:
```
✅ CONNECTED - User: user-xxxxx
📤 Sending: { type: "CHAT_MESSAGE", ... }
📥 Received: { type: "SERVER_MESSAGE", ... }
```

---

## 📱 Mobile App Integration

### React Native Example
```javascript
import { useEffect, useState } from "react";

export function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [ws, setWs] = useState(null);
  const userId = "mobile-user-" + Date.now(); // Generate unique ID

  useEffect(() => {
    // Connect to WebSocket
    const wsUrl = `wss://coforge-fin-ai-banking.railway.app?userId=${userId}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log("✅ Connected");
      setWs(websocket);
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
      console.log("📨 Message received:", data);
    };

    websocket.onerror = (error) => {
      console.error("❌ Error:", error);
    };

    return () => websocket.close(); // Cleanup on unmount
  }, []);

  const sendMessage = (text) => {
    if (!ws) return;

    const message = {
      type: "CHAT_MESSAGE",
      payload: {
        text: text,
        timestamp: Date.now(),
      },
    };

    ws.send(JSON.stringify(message));
  };

  return (
    <div>
      {/* Render messages */}
      {messages.map((msg, idx) => (
        <div key={idx}>{JSON.stringify(msg)}</div>
      ))}

      {/* Send button */}
      <button onClick={() => sendMessage("Hello!")}>Send</button>
    </div>
  );
}
```

### Flutter Example (Dart)
```dart
import 'package:web_socket_channel/web_socket_channel.dart';
import 'dart:convert';

class ChatService {
  late WebSocketChannel channel;
  final String userId = 'mobile-flutter-${DateTime.now().millisecondsSinceEpoch}';

  Future<void> connect() async {
    final wsUrl = Uri.parse('wss://coforge-fin-ai-banking.railway.app?userId=$userId');
    channel = WebSocketChannel.connect(wsUrl);

    channel.stream.listen(
      (message) {
        final data = jsonDecode(message);
        print('📨 Received: $data');
        // Handle received message
      },
      onError: (error) {
        print('❌ Error: $error');
      },
      onDone: () {
        print('❌ Connection closed');
      },
    );
  }

  void sendMessage(String text) {
    final message = {
      'type': 'CHAT_MESSAGE',
      'payload': {
        'text': text,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      },
    };
    channel.sink.add(jsonEncode(message));
  }

  void disconnect() {
    channel.sink.close();
  }
}
```

### Swift (iOS) Example
```swift
import Foundation

class WebSocketManager: NSObject, URLSessionWebSocketDelegate {
    var webSocket: URLSessionWebSocket?
    let userId = "mobile-ios-\(Date().timeIntervalSince1970)"

    func connect() {
        let urlString = "wss://coforge-fin-ai-banking.railway.app?userId=\(userId)"
        let url = URL(string: urlString)!
        
        let request = URLRequest(url: url)
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
        webSocket = session.webSocketTask(with: request)
        webSocket?.resume()
        
        receiveMessage()
        print("✅ Connected")
    }

    func sendMessage(_ text: String) {
        let message: [String: Any] = [
            "type": "CHAT_MESSAGE",
            "payload": [
                "text": text,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ]
        ]
        
        if let jsonData = try? JSONSerialization.data(withJSONObject: message),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            let message = URLSessionWebSocketTask.Message.string(jsonString)
            webSocket?.send(message) { error in
                if let error = error {
                    print("Error sending: \(error)")
                }
            }
        }
    }

    func receiveMessage() {
        webSocket?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    print("📨 Received: \(text)")
                    // Handle message
                case .data(let data):
                    print("📨 Received data: \(data)")
                @unknown default:
                    break
                }
                self?.receiveMessage() // Continue listening
            case .failure(let error):
                print("❌ Error: \(error)")
            }
        }
    }

    func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
    }
}
```

### JavaScript/Web Example
```javascript
class ChatClient {
  constructor(userId) {
    this.userId = userId || `web-user-${Date.now()}`;
    this.ws = null;
  }

  connect() {
    const wsUrl = `wss://coforge-fin-ai-banking.railway.app?userId=${this.userId}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => console.log("✅ Connected");
    this.ws.onmessage = (event) => this.handleMessage(event.data);
    this.ws.onerror = (error) => console.error("❌ Error:", error);
    this.ws.onclose = () => console.log("❌ Disconnected");
  }

  sendMessage(text) {
    if (!this.ws) return;

    const message = {
      type: "CHAT_MESSAGE",
      payload: {
        text,
        timestamp: Date.now(),
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  handleMessage(data) {
    const parsed = JSON.parse(data);
    console.log("📨 Message:", parsed);
    // Process message here
  }

  disconnect() {
    if (this.ws) this.ws.close();
  }
}

// Usage
const client = new ChatClient();
client.connect();
client.sendMessage("Hello from web!");
```

---

## 📤 Message Format

### Sending a Message
```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "text": "Hello server!",
    "timestamp": 1711425600000
  }
}
```

### Server Response
```json
{
  "type": "SERVER_MESSAGE",
  "payload": {
    "from": "server",
    "text": "Server received: \"Hello server!\"",
    "timestamp": 1711425600001
  }
}
```

### Broadcast Message (from another user)
```json
{
  "type": "BROADCAST",
  "from": "user-other-id",
  "message": "{\"type\": \"CHAT_MESSAGE\", ...}",
  "timestamp": 1711425600002
}
```

---

## 🚀 Live Testing Now

Your deployment is live. Test it:

**Browser Test:**
```bash
# Simply open test-socket.html in your browser
```

**Node.js Test:**
```bash
node test-socket.js
```

**cURL (check health):**
```bash
curl https://coforge-fin-ai-banking.railway.app/health
```

---

## 🔧 Troubleshooting

### "Connection Refused"
- ✅ Server is running
- ❌ Check firewall/proxy settings
- ❌ Wrong URL format

### "Cannot connect to wss://"
- Ensure using `wss://` not `ws://` (secure)
- Check userId parameter is included

### "Timeout"
- Server may be sleeping (Hobby plan restarts after inactivity)
- Send message to wake it up

---

## 📊 Architecture

```
Mobile App (iOS/Android/Web)
         ↓
    WebSocket (WSS)
         ↓
   Railway Server
         ↓
Node.js + Express + WS
         ↓
PostgreSQL Database
```

**Flow:**
1. Mobile connects with `userId`
2. Server stores connection mapping
3. Mobile sends JSON message
4. Server processes + responds
5. Broadcasts to all connected users

---

## ✅ Checklist for Your Mobile App

- [ ] Generate unique `userId` per device/session
- [ ] Use `wss://` protocol (secure WebSocket)
- [ ] Handle `onopen` event
- [ ] Handle `onmessage` event
- [ ] Handle `onerror` event
- [ ] Handle `onclose` event (reconnect logic)
- [ ] Send messages as JSON
- [ ] Close connection on app close

---

## 🆘 Need Help?

Check logs:
```bash
curl https://coforge-fin-ai-banking.railway.app/health
```

Look at Railway dashboard logs for server-side errors.
