import 'package:flutter/material.dart';
import '../theme/aaraagate_guard_theme.dart';

/// Reveals existing, already-loaded operational rows without another API call
/// or re-executing any security-sensitive action.
class GuardFieldMoreRecords extends StatelessWidget {
  const GuardFieldMoreRecords({
    super.key,
    required this.sectionLabel,
    required this.shown,
    required this.total,
    this.pageSize = 20,
    required this.showingTemplate,
    required this.showNextTemplate,
    required this.onPressed,
  });

  final String sectionLabel;
  final int shown;
  final int total;
  final int pageSize;
  final String showingTemplate;
  final String showNextTemplate;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    if (shown >= total) return const SizedBox.shrink();
    final displayCount = shown < 0 ? 0 : shown;
    final remaining = total - displayCount;
    final nextCount = remaining > pageSize ? pageSize : remaining;
    final caption = showingTemplate
        .replaceAll('{shown}', '$displayCount')
        .replaceAll('{total}', '$total');
    final action = showNextTemplate.replaceAll('{count}', '$nextCount');
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AaraagateGuardTokens.space2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '$sectionLabel · $caption',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: AaraagateGuardTokens.space2),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onPressed,
              icon: const Icon(Icons.expand_more_rounded),
              label: Text(action, textAlign: TextAlign.center),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, AaraagateGuardTokens.minTouchTarget),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
