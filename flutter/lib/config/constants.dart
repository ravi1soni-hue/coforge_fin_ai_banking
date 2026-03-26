// Configuration constants for the chat app

class AppConfig {
  // WebSocket Configuration
  static const String wsUrl = 'wss://coforge-fin-ai-banking.railway.app';
  // For local development: 'ws://localhost:3000'
  
  // App Configuration
  static const String appName = 'Coforge AI Chat';
  static const String appVersion = '1.0.0';
  
  // Timeouts
  static const Duration connectionTimeout = Duration(seconds: 10);
  static const Duration reconnectDelay = Duration(seconds: 3);
  static const int maxReconnectAttempts = 5;
  
  // Message Configuration
  static const int maxMessageLength = 500;
  static const Duration messageDebounce = Duration(milliseconds: 300);
}

class MessageTypes {
  static const String chatMessage = 'CHAT_MESSAGE';
  static const String serverMessage = 'SERVER_MESSAGE';
  static const String broadcast = 'BROADCAST';
  static const String error = 'ERROR';
  static const String connectionStatus = 'CONNECTION_STATUS';
}

class Colors {
  static const primaryColor = 0xFF667eea;
  static const secondaryColor = 0xFF764ba2;
  static const backgroundColor = 0xFFf5f5f5;
  static const messageBackgroundUser = 0xFF667eea;
  static const messageBackgroundServer = 0xFFe5e7eb;
}
