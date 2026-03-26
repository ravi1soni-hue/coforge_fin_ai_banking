import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/message_model.dart';

class MessageBubble extends StatelessWidget {
  final Message message;

  const MessageBubble({
    Key? key,
    required this.message,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isUser = message.sender == MessageSender.user;
    final isError = message.isError;

    Color backgroundColor;
    Color textColor;
    Alignment alignment;

    if (isError) {
      backgroundColor = Colors.red.withOpacity(0.1);
      textColor = Colors.red;
      alignment = Alignment.centerRight;
    } else if (isUser) {
      backgroundColor = const Color(0xFF667eea);
      textColor = Colors.white;
      alignment = Alignment.centerRight;
    } else {
      backgroundColor = Colors.grey.withOpacity(0.2);
      textColor = Colors.black87;
      alignment = Alignment.centerLeft;
    }

    return Align(
      alignment: alignment,
      child: Container(
        margin: EdgeInsets.symmetric(
          vertical: 8,
          horizontal: isUser ? 70 : 16,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
        decoration: BoxDecoration(
          color: backgroundColor,
          borderRadius: BorderRadius.circular(12),
          border: isError ? Border.all(color: Colors.red, width: 1) : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.sender == MessageSender.other && message.fromUser != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  'From: ${message.fromUser}',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            Text(
              message.text,
              style: TextStyle(
                color: textColor,
                fontSize: 15,
                height: 1.3,
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                DateFormat('HH:mm').format(message.timestamp),
                style: TextStyle(
                  fontSize: 11,
                  color: isUser ? Colors.white70 : Colors.grey,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
