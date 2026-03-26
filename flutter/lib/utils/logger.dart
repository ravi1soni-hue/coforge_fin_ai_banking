// Simple logging utility

class Logger {
  static const String _prefix = '[CoforgeChat]';

  static void info(String message) {
    print('$_prefix ℹ️ $message');
  }

  static void success(String message) {
    print('$_prefix ✅ $message');
  }

  static void warning(String message) {
    print('$_prefix ⚠️ $message');
  }

  static void error(String message, [dynamic exception]) {
    print('$_prefix ❌ $message');
    if (exception != null) {
      print('$_prefix Exception: $exception');
    }
  }

  static void debug(String message) {
    print('$_prefix 🐛 $message');
  }

  static void websocket(String message) {
    print('$_prefix 📡 WS: $message');
  }
}
