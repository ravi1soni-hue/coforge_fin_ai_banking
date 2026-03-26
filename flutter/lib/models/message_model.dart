import 'dart:convert';

enum MessageSender { user, server, other }

class Message {
  final String id;
  final String text;
  final MessageSender sender;
  final DateTime timestamp;
  final String? fromUser;
  final MessageType type;
  final bool isError;

  Message({
    required this.id,
    required this.text,
    required this.sender,
    required this.timestamp,
    this.fromUser,
    this.type = MessageType.text,
    this.isError = false,
  });

  // Convert to JSON for storage
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'text': text,
      'sender': sender.toString(),
      'timestamp': timestamp.toIso8601String(),
      'fromUser': fromUser,
      'type': type.toString(),
      'isError': isError,
    };
  }

  // Create from JSON
  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      text: json['text'] as String,
      sender: MessageSender.values.firstWhere(
        (e) => e.toString() == json['sender'],
        orElse: () => MessageSender.server,
      ),
      timestamp: DateTime.parse(json['timestamp'] as String),
      fromUser: json['fromUser'] as String?,
      type: MessageType.values.firstWhere(
        (e) => e.toString() == json['type'],
        orElse: () => MessageType.text,
      ),
      isError: json['isError'] as bool? ?? false,
    );
  }

  @override
  String toString() => 'Message($id, $text, $sender, $timestamp)';
}

enum MessageType { text, image, audio, document }

class ServerMessage {
  final String type;
  final dynamic payload;

  ServerMessage({required this.type, required this.payload});

  factory ServerMessage.fromJson(Map<String, dynamic> json) {
    return ServerMessage(
      type: json['type'] as String,
      payload: json['payload'],
    );
  }

  Map<String, dynamic> toJson() {
    return {'type': type, 'payload': payload};
  }
}
