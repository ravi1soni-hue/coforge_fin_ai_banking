# Complete Flutter WebSocket Integration Guide

Your complete Flutter chat app is ready to use! 🚀

---

## 📁 File Structure

All files are organized in the `flutter/` folder:

```
flutter/
├── lib/
│   ├── main.dart                          # App entry point
│   ├── config/
│   │   └── constants.dart                 # Configuration & constants
│   ├── models/
│   │   ├── message_model.dart             # Message data model
│   │   └── connection_state.dart          # Connection state model
│   ├── services/
│   │   ├── websocket_service.dart         # WebSocket connection logic
│   │   └── chat_service.dart              # Chat business logic
│   ├── providers/
│   │   └── chat_provider.dart             # State management (Provider)
│   ├── screens/
│   │   ├── login_screen.dart              # Login/User ID entry
│   │   └── chat_screen.dart               # Main chat interface
│   ├── widgets/
│   │   ├── message_bubble.dart            # Message display
│   │   ├── message_input.dart             # Message input field
│   │   └── connection_indicator.dart      # Connection status
│   └── utils/
│       └── logger.dart                    # Logging utility
└── pubspec.yaml                           # Dependencies
```

---

## 🚀 Getting Started

### Step 1: Create Flutter Project
```bash
flutter create coforge_chat_app
cd coforge_chat_app
```

### Step 2: Copy Files
Copy all files from the `flutter/` directory into your project's corresponding folders.

Structure should look like:
```
coforge_chat_app/
├── lib/
│   ├── config/
│   ├── models/
│   ├── services/
│   ├── providers/
│   ├── screens/
│   ├── widgets/
│   ├── utils/
│   └── main.dart
├── pubspec.yaml
└── ...
```

### Step 3: Get Dependencies
```bash
flutter pub get
```

### Step 4: Run App
```bash
flutter run
```

Or for specific device:
```bash
flutter run -d chrome           # Web
flutter run -d emulator-5554    # Android emulator
flutter run -d iPhone           # iOS simulator
```

---

## 🎯 Features Included

✅ **WebSocket Connection Management**
- Automatic reconnection with exponential backoff
- Connection status monitoring
- Graceful disconnect

✅ **Message Handling**
- Send/receive messages
- Message history
- User/server/broadcast message types
- Error handling

✅ **UI/UX**
- Material Design 3
- Chat bubble design
- Real-time connection indicator
- Login screen with user ID
- Auto-scroll to latest message
- Loading states

✅ **State Management**
- Provider package for clean architecture
- Centralized chat state
- Connection state tracking

✅ **Error Handling**
- Network error management
- Timeout handling
- User-friendly error messages
- Automatic reconnection

---

## 🔧 Configuration

Edit `lib/config/constants.dart` to change WebSocket URL:

```dart
class AppConfig {
  // Change this for different server
  static const String wsUrl = 'wss://coforge-fin-ai-banking.railway.app';
  // For local testing: 'ws://localhost:3000'
}
```

---

## 📊 How It Works

```
1. User enters User ID in Login Screen
   ↓
2. App creates ChatProvider with WebSocket
   ↓
3. WebSocket connects to server
   ↓
4. Connection Indicator shows status
   ↓
5. User sends message via MessageInput
   ↓
6. ChatProvider sends via WebSocket
   ↓
7. Server responds with message
   ↓
8. Message appears in chat bubble
   ↓
9. Auto-reconnects if connection drops
```

---

## 📤 Usage Example

### 1. The app starts on Login Screen
- User enters a unique ID (e.g., "john-iphone", "user-123")
- Clicks "Start Chat"

### 2. Connection is established
- Connection Indicator shows: "Connecting..." → "Connected"
- History of any reconnection attempts shown

### 3. User sends message
```
User types: "Hello from Flutter!"
→ Sends formatted JSON via WebSocket
→ Server responds
→ Message appears in chat
```

### 4. Real-time updates
- Messages appear instantly
- Connection status updated in real-time
- Auto-scroll to latest message

---

## 🎨 Customization

### Change Colors
Edit `lib/config/constants.dart`:
```dart
class Colors {
  static const primaryColor = 0xFF667eea;  // Change this
  static const secondaryColor = 0xFF764ba2;
  // ...
}
```

### Change Message Bubble Appearance
Edit `lib/widgets/message_bubble.dart`:
```dart
decoration: BoxDecoration(
  color: backgroundColor,
  borderRadius: BorderRadius.circular(12),  // Change radius
  // ...
)
```

### Add Custom Message Types
Edit `lib/models/message_model.dart`:
```dart
enum MessageType { 
  text, 
  image,      // Add this
  audio,      // Add this
  document    // Add this
}
```

---

## 🐛 Debugging & Logging

All logs are printed to console:

```
[CoforgeChat] ✅ WebSocketService initialized for user: user-123
[CoforgeChat] 📡 WS: Connecting to: wss://coforge-fin-ai-banking.railway.app?userId=user-123
[CoforgeChat] ✅ WebSocket connected
[CoforgeChat] 📨 Raw message: {"type":"SERVER_MESSAGE",...}
[CoforgeChat] 📤 Sending: {"type":"CHAT_MESSAGE",...}
```

Check logcat on Android:
```bash
flutter logs
```

Or use DevTools:
```bash
flutter pub global activate devtools
devtools
```

---

## 📱 Building for Platforms

### Build APK (Android)
```bash
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk`

### Build iOS
```bash
flutter build ios --release
```

Then open with Xcode:
```bash
open ios/Runner.xcworkspace
```

### Build Web
```bash
flutter build web
```

Output: `build/web/`

---

## 🔌 WebSocket Message Format

### Send Message (User → Server)
```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "text": "Hello!",
    "timestamp": 1711425600000
  }
}
```

### Receive Message (Server → User)
```json
{
  "type": "SERVER_MESSAGE",
  "payload": {
    "from": "server",
    "text": "Server received: \"Hello!\"",
    "timestamp": 1711425600001
  }
}
```

### Broadcast (Other Users → You)
```json
{
  "type": "BROADCAST",
  "from": "user-john",
  "message": "{...json...}",
  "timestamp": 1711425600002
}
```

---

## ✅ Checklist Before Deploy

- [ ] Change WebSocket URL in `constants.dart`
- [ ] Add app icon: `flutter pub get && flutter pub run flutter_launcher_icons:main`
- [ ] Add app name and description
- [ ] Test on multiple devices
- [ ] Test reconnection logic (turn WiFi on/off)
- [ ] Test message history
- [ ] Build release APK
- [ ] Test push notifications (optional)

---

## 🆘 Troubleshooting

### "Connection refused"
- Ensure server is running
- Check WebSocket URL in constants.dart
- Verify userId is being passed

### "Messages not appearing"
- Check network connection
- Look at console logs for errors
- Ensure server is responding

### "App crashes on startup"
- Run `flutter clean && flutter pub get`
- Check all imports are correct
- Verify pubspec.yaml is properly formatted

### "Connection keeps dropping"
- Normal on poor networks - auto-reconnect working
- Check reconnect logic in websocket_service.dart
- Increase `maxReconnectAttempts` if needed

---

## 📚 Key Classes

### ChatProvider
State management, message handling, connection control
```dart
final chatProvider = ChatProvider(userId: 'user-123');
await chatProvider.connect();
chatProvider.sendMessage('Hello!');
```

### WebSocketService  
Low-level WebSocket connection
```dart
final ws = WebSocketService(userId: 'user-123');
await ws.connect();
ws.sendMessage('text');
ws.disconnect();
```

### Message
Data model for chat messages
```dart
Message(
  id: uuid,
  text: 'Hello',
  sender: MessageSender.user,
  timestamp: DateTime.now(),
)
```

---

## 🚀 Ready to Deploy!

Your Flutter app is production-ready. All files are structured for scalability and maintenance.

Start building! 🎉
