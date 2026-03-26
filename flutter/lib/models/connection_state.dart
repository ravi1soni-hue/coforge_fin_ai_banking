enum ConnectionStatus {
  connecting,
  connected,
  disconnected,
  error,
  reconnecting,
}

class ConnectionState {
  final ConnectionStatus status;
  final String? errorMessage;
  final int reconnectAttempt;

  ConnectionState({
    required this.status,
    this.errorMessage,
    this.reconnectAttempt = 0,
  });

  bool get isConnected => status == ConnectionStatus.connected;
  bool get isConnecting => status == ConnectionStatus.connecting;
  bool get isDisconnected => status == ConnectionStatus.disconnected;
  bool get isError => status == ConnectionStatus.error;
  bool get isReconnecting => status == ConnectionStatus.reconnecting;

  ConnectionState copyWith({
    ConnectionStatus? status,
    String? errorMessage,
    int? reconnectAttempt,
  }) {
    return ConnectionState(
      status: status ?? this.status,
      errorMessage: errorMessage ?? this.errorMessage,
      reconnectAttempt: reconnectAttempt ?? this.reconnectAttempt,
    );
  }

  @override
  String toString() =>
      'ConnectionState($status, error: $errorMessage, attempt: $reconnectAttempt)';
}
