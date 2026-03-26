import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/connection_state.dart';
import '../providers/chat_provider.dart';

class ConnectionIndicator extends StatelessWidget {
  const ConnectionIndicator({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Consumer<ChatProvider>(
      builder: (context, chatProvider, child) {
        final wsService = chatProvider.chatService.webSocketService;
        final state = wsService.connectionState;

        Color statusColor;
        String statusText;
        IconData statusIcon;
        bool showPulse = false;

        switch (state.status) {
          case ConnectionStatus.connected:
            statusColor = Colors.green;
            statusText = 'Connected';
            statusIcon = Icons.check_circle;
            showPulse = true;
            break;

          case ConnectionStatus.connecting:
            statusColor = Colors.orange;
            statusText = 'Connecting...';
            statusIcon = Icons.access_time;
            showPulse = true;
            break;

          case ConnectionStatus.disconnected:
            statusColor = Colors.grey;
            statusText = 'Disconnected';
            statusIcon = Icons.circle_outlined;
            break;

          case ConnectionStatus.error:
            statusColor = Colors.red;
            statusText =
                'Error${state.errorMessage != null ? ': ${state.errorMessage}' : ''}';
            statusIcon = Icons.error_outline;
            break;

          case ConnectionStatus.reconnecting:
            statusColor = Colors.blue;
            statusText =
                'Reconnecting... (${state.reconnectAttempt}/${4})';
            statusIcon = Icons.sync;
            showPulse = true;
        }

        return Container(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: statusColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: statusColor.withOpacity(0.3),
              width: 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showPulse)
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: statusColor,
                    shape: BoxShape.circle,
                  ),
                  child: _PulseAnimation(
                    color: statusColor,
                  ),
                )
              else
                Icon(
                  statusIcon,
                  size: 14,
                  color: statusColor,
                ),
              SizedBox(width: 8),
              Text(
                statusText,
                style: TextStyle(
                  color: statusColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (state.status == ConnectionStatus.error)
                SizedBox(width: 8),
              if (state.status == ConnectionStatus.error)
                GestureDetector(
                  onTap: () => chatProvider.chatService.webSocketService.reconnect(),
                  child: Icon(
                    Icons.refresh,
                    size: 14,
                    color: statusColor,
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _PulseAnimation extends StatefulWidget {
  final Color color;

  const _PulseAnimation({required this.color});

  @override
  State<_PulseAnimation> createState() => _PulseAnimationState();
}

class _PulseAnimationState extends State<_PulseAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: Duration(seconds: 2),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween<double>(begin: 1, end: 1.5).animate(_controller),
      child: Opacity(
        opacity: Tween<double>(begin: 1, end: 0.3).evaluate(_controller),
        child: Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: widget.color,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}
