import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;
import '../config/constants.dart';
import '../models/message_model.dart';
import '../models/connection_state.dart';
import '../utils/logger.dart';

typedef OnMessageCallback = void Function(ServerMessage message);
typedef OnConnectionCallback = void Function(ConnectionState state);

class WebSocketService {
  late WebSocketChannel _channel;
  late StreamSubscription _streamSubscription;
  final String userId;
  int _reconnectAttempts = 0;
  Timer? _reconnectTimer;

  // Callbacks
  OnMessageCallback? onMessage;
  OnConnectionCallback? onConnectionStateChanged;

  // Connection state
  var _connectionState = ConnectionState(status: ConnectionStatus.disconnected);

  ConnectionState get connectionState => _connectionState;
  bool get isConnected => _connectionState.isConnected;

  WebSocketService({required this.userId}) {
    Logger.websocket('WebSocketService initialized for user: $userId');
  }

  /// Connect to WebSocket server
  Future<void> connect() async {
    if (isConnected) {
      Logger.warning('Already connected');
      return;
    }

    try {
      _updateConnectionState(ConnectionStatus.connecting);

      final wsUrl = '${AppConfig.wsUrl}?userId=$userId';
      Logger.websocket('Connecting to: $wsUrl');

      _channel = WebSocketChannel.connect(Uri.parse(wsUrl));

      // Wait for connection to establish
      await _channel.ready.timeout(
        AppConfig.connectionTimeout,
        onTimeout: () => throw TimeoutException('Connection timeout'),
      );

      _reconnectAttempts = 0;
      _updateConnectionState(ConnectionStatus.connected);
      Logger.success('WebSocket connected');

      // Listen to messages
      _listenToMessages();
    } on TimeoutException {
      Logger.error('Connection timeout');
      _updateConnectionState(
        ConnectionStatus.error,
        errorMessage: 'Connection timeout',
      );
      _scheduleReconnect();
    } catch (e) {
      Logger.error('Connection error: $e');
      _updateConnectionState(
        ConnectionStatus.error,
        errorMessage: e.toString(),
      );
      _scheduleReconnect();
    }
  }

  /// Listen to incoming messages
  void _listenToMessages() {
    _streamSubscription = _channel.stream.listen(
      (dynamic message) {
        try {
          Logger.websocket('Raw message: $message');
          final jsonData = jsonDecode(message as String);
          final serverMessage = ServerMessage.fromJson(jsonData);
          Logger.websocket('Parsed message type: ${serverMessage.type}');
          onMessage?.call(serverMessage);
        } catch (e) {
          Logger.error('Failed to parse message: $e');
        }
      },
      onError: (error) {
        Logger.error('WebSocket error: $error');
        _updateConnectionState(
          ConnectionStatus.error,
          errorMessage: error.toString(),
        );
        _scheduleReconnect();
      },
      onDone: () {
        Logger.websocket('Connection closed');
        if (!_connectionState.isError) {
          _updateConnectionState(ConnectionStatus.disconnected);
        }
        _scheduleReconnect();
      },
    );
  }

  /// Send message to server
  void sendMessage(String text) {
    if (!isConnected) {
      Logger.warning('Not connected. Message not sent: $text');
      return;
    }

    try {
      final message = {
        'type': MessageTypes.chatMessage,
        'payload': {
          'text': text,
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        },
      };

      final jsonMessage = jsonEncode(message);
      Logger.websocket('Sending: $jsonMessage');
      _channel.sink.add(jsonMessage);
    } catch (e) {
      Logger.error('Error sending message: $e');
    }
  }

  /// Disconnect gracefully
  void disconnect() {
    Logger.websocket('Disconnecting...');
    _reconnectTimer?.cancel();
    _streamSubscription.cancel();
    _channel.sink.close(status.goingAway);
    _updateConnectionState(ConnectionStatus.disconnected);
  }

  /// Schedule reconnection with exponential backoff
  void _scheduleReconnect() {
    if (_reconnectAttempts >= AppConfig.maxReconnectAttempts) {
      Logger.error('Max reconnection attempts reached');
      _updateConnectionState(
        ConnectionStatus.error,
        errorMessage: 'Max reconnection attempts reached',
      );
      return;
    }

    _reconnectAttempts++;
    final delay = AppConfig.reconnectDelay * _reconnectAttempts;

    Logger.websocket(
      'Scheduling reconnect (attempt $_reconnectAttempts) in ${delay.inSeconds}s',
    );

    _updateConnectionState(
      ConnectionStatus.reconnecting,
      reconnectAttempt: _reconnectAttempts,
    );

    _reconnectTimer = Timer(delay, () {
      if (!isConnected) {
        connect();
      }
    });
  }

  /// Update connection state and notify listeners
  void _updateConnectionState(
    ConnectionStatus status, {
    String? errorMessage,
    int? reconnectAttempt,
  }) {
    _connectionState = ConnectionState(
      status: status,
      errorMessage: errorMessage,
      reconnectAttempt: reconnectAttempt ?? _connectionState.reconnectAttempt,
    );

    Logger.debug('Connection state updated: $_connectionState');
    onConnectionStateChanged?.call(_connectionState);
  }

  /// Manually trigger reconnect
  Future<void> reconnect() async {
    Logger.websocket('Manual reconnect triggered');
    disconnect();
    await Future.delayed(Duration(seconds: 1));
    await connect();
  }

  /// Cleanup resources
  void dispose() {
    Logger.websocket('Disposing WebSocketService');
    disconnect();
  }
}
