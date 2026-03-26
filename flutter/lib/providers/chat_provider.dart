import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/message_model.dart';
import '../services/chat_service.dart';
import '../services/websocket_service.dart';
import '../utils/logger.dart';

class ChatProvider extends ChangeNotifier {
  late ChatService _chatService;
  final String userId;

  List<Message> _messages = [];
  String? _errorMessage;

  ChatProvider({required this.userId}) {
    _initializeServices();
  }

  // Getters
  List<Message> get messages => _messages;
  List<Message> get messagesReverse => _messages.reversed.toList();
  String? get errorMessage => _errorMessage;
  bool get hasError => _errorMessage != null;

  ChatService get chatService => _chatService;

  /// Initialize WebSocket and Chat services
  void _initializeServices() {
    try {
      final webSocketService = WebSocketService(userId: userId);

      _chatService = ChatService(
        webSocketService: webSocketService,
        onNewMessage: (message) {
          _addMessage(message);
        },
      );

      Logger.success('ChatProvider initialized');
    } catch (e) {
      Logger.error('Error initializing ChatProvider: $e');
      _errorMessage = 'Failed to initialize chat: $e';
      notifyListeners();
    }
  }

  /// Connect to WebSocket
  Future<void> connect() async {
    try {
      _errorMessage = null;
      await _chatService.webSocketService.connect();
      notifyListeners();
    } catch (e) {
      Logger.error('Connection error: $e');
      _errorMessage = 'Connection failed: $e';
      notifyListeners();
    }
  }

  /// Send message
  void sendMessage(String text) {
    try {
      _errorMessage = null;
      _chatService.sendMessage(text);
      notifyListeners();
    } catch (e) {
      Logger.error('Error sending message: $e');
      _errorMessage = 'Failed to send message: $e';
      notifyListeners();
    }
  }

  /// Add message to list
  void _addMessage(Message message) {
    _messages.add(message);
    Logger.debug('Message added by provider');
    notifyListeners();
  }

  /// Clear all messages
  void clearMessages() {
    _chatService.clearMessages();
    _messages.clear();
    notifyListeners();
  }

  /// Clear error
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  /// Get connection status
  String getConnectionStatus() {
    final state = _chatService.webSocketService.connectionState;
    switch (state.status) {
      case ConnectionStatus.connected:
        return 'Connected';
      case ConnectionStatus.connecting:
        return 'Connecting...';
      case ConnectionStatus.disconnected:
        return 'Disconnected';
      case ConnectionStatus.error:
        return 'Error: ${state.errorMessage}';
      case ConnectionStatus.reconnecting:
        return 'Reconnecting... (${state.reconnectAttempt}/${4})';
    }
  }

  /// Disconnect
  void disconnect() {
    _chatService.webSocketService.disconnect();
    notifyListeners();
  }

  @override
  void dispose() {
    _chatService.webSocketService.dispose();
    super.dispose();
  }
}
