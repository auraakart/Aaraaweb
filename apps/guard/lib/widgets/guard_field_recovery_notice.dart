import 'package:flutter/material.dart';
import '../theme/aaraagate_guard_theme.dart';

/// Failure feedback that never automatically repeats a security mutation.
/// Refresh status performs only the screen's existing read operation.
class GuardFieldRecoveryNotice extends StatelessWidget {
  const GuardFieldRecoveryNotice({
    super.key,
    required this.message,
    required this.onRefresh,
    this.refreshLabel = 'Refresh status',
  });

  final String message;
  final VoidCallback? onRefresh;
  final String refreshLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      container: true,
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: AaraagateGuardTokens.space3),
        padding: const EdgeInsets.all(AaraagateGuardTokens.space4),
        decoration: BoxDecoration(
          color: scheme.errorContainer,
          borderRadius: BorderRadius.circular(
            AaraagateGuardTokens.radiusCard,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, color: scheme.onErrorContainer),
                const SizedBox(width: AaraagateGuardTokens.space2),
                Expanded(
                  child: Text(
                    message,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: scheme.onErrorContainer,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AaraagateGuardTokens.space3),
            OutlinedButton.icon(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh_rounded),
              label: Text(refreshLabel, textAlign: TextAlign.center, softWrap: true),
              style: OutlinedButton.styleFrom(
                foregroundColor: scheme.onErrorContainer,
                side: BorderSide(color: scheme.onErrorContainer),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
