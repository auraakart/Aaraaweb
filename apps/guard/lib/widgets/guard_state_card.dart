import 'package:flutter/material.dart';

class GuardStateCard extends StatelessWidget {
  const GuardStateCard({
    super.key,
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
    this.loading = false,
    this.error = false,
  });

  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool loading;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: error ? scheme.errorContainer : null,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            if (loading)
              const LinearProgressIndicator()
            else
              Icon(icon, size: 32, color: error ? scheme.error : scheme.primary),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 8),
              TextButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}
