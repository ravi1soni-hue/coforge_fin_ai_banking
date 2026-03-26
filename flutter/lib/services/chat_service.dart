import 'package:uuid/uuid.dart';
import '../config/constants.dart';
import '../models/message_model.dart';
import '../utils/logger.dart';
import 'websocket_service.dart';

class ChatService {
  final WebSocketService webSocketService;
  final List<Message> messages = [];
  final Function(Message)? onNewMessage;

  ChatService({
    required this.webSocketService,
    this.onNewMessage,
  }) {
    _setupListeners();
  }

  /// Setup WebSocket message listeners
  void _setupListeners() {
    webSocketService.onMessage = (serverMessage) {
      _handleServerMessage(serverMessage);
    };
  }

  /// Handle incoming server messages
  void _handleServerMessage(ServerMessage serverMessage) {
    final type = serverMessage.type;
    Logger.info('Handling message type: $type');

    switch (type) {
      case MessageTypes.serverMessage:
        _handleServerResponse(serverMessage);
        break;

      case MessageTypes.broadcast:
        _handleBroadcastMessage(serverMessage);
        break;

      case MessageTypes.error:
        _handleErrorMessage(serverMessage);
        break;

      default:
        Logger.warning('Unknown message type: $type');
    }
  }

  /// Handle server response
  void _handleServerResponse(ServerMessage serverMessage) {
    final payload = serverMessage.payload;
    final text = payload['text'] ?? 'No text';
    final timestamp = payload['timestamp'] ?? DateTime.now().millisecondsSinceEpoch;

    final message = Message(
      id: const Uuid().v4(),
      text: text,
      sender: MessageSender.server,
      timestamp: DateTime.fromMillisecondsSinceEpoch(timestamp as int),
      type: MessageType.text,
    );

    _addMessage(message);
  }

  /// Handle broadcast message from other users
  void _handleBroadcastMessage(ServerMessage serverMessage) {
    final from = serverMessage.payload['from'] ?? 'Unknown';
    final text = serverMessage.payload['message'] ?? '';
    final timestamp = serverMessage.payload['timestamp'] ?? DateTime.now().millisecondsSinceEpoch;

    final message = Message(
      id: const Uuid().v4(),
      text: text,
      sender: MessageSender.other,
      fromUser: from,
      timestamp: DateTime.fromMillisecondsSinceEpoch(timestamp as int),
      type: MessageType.text,
    );

    _addMessage(message);
  }

  /// Handle error messages
  void _handleErrorMessage(ServerMessage serverMessage) {
    final errorText = serverMessage.payload['message'] ?? 'Unknown error';

    final message = Message(
      id: const Uuid().v4(),
      text: 'Error: $errorText',
      sender: MessageSender.server,
      timestamp: DateTime.now(),
      type: MessageType.text,
      isError: true,
    );

    _addMessage(message);
  }

  /// Send a chat message
  void sendMessage(String text) {
    if (text.isEmpty || text.length > AppConfig.maxMessageLength) {
      Logger.warning('Invalid message length: ${text.length}');
      return;
    }

    // Add user message to local list
    final userMessage = Message(
      id: const Uuid().v4(),
      text: text,
      sender: MessageSender.user,
      timestamp: DateTime.now(),
      type: MessageType.text,
    );

    _addMessage(userMessage);

    // Send through WebSocket
    webSocketService.sendMessage(text);
  }

  /// Add message to list and notify listeners
  void _addMessage(Message message) {
    messages.add(message);
    Logger.debug('Message added: ${message.id}');
    onNewMessage?.call(message);
  }

  /// Clear all messages
  void clearMessages() {
    messages.clear();
    Logger.info('Messages cleared');
  }

  /// Get message count
  int getMessageCount() => messages.length;

  /// Get messages in reverse order (newest first)
  List<Message> getMessagesReverse() => messages.reversed.toList();
}
