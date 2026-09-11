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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final background = error ? scheme.errorContainer : scheme.surfaceContainerLow;
    final foreground = error ? scheme.onErrorContainer : scheme.onSurface;
    final iconBackground = error ? scheme.errorContainer : scheme.primaryContainer;
    final iconForeground = error ? scheme.onErrorContainer : scheme.onPrimaryContainer;

    return Semantics(
      container: true,
      liveRegion: loading || error,
      label: loading ? 'Processing. $message' : message,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          children: [
            Container(
              width: 52,
              height: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: iconBackground,
                borderRadius: BorderRadius.circular(16),
              ),
              child: loading
                  ? SizedBox.square(
                      dimension: 24,
                      child: CircularProgressIndicator(strokeWidth: 3, color: scheme.primary),
                    )
                  : Icon(icon, size: 28, color: iconForeground),
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: foreground,
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 10),
              TextButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}
