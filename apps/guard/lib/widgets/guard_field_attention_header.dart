import 'package:flutter/material.dart';
import 'guard_operation_ui.dart';

/// A gate-attention heading that retains status semantics and fits large text.
class GuardFieldAttentionHeader extends StatelessWidget {
  const GuardFieldAttentionHeader({super.key, required this.urgent});

  final int urgent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final clear = urgent == 0;
    final status = GuardStatusPill(
      label: clear ? 'CLEAR' : '$urgent OPEN',
      tone: clear ? GuardStatusTone.ready : GuardStatusTone.waiting,
    );
    final heading = Row(
      children: [
        Icon(
          clear ? Icons.verified_outlined : Icons.notification_important_outlined,
          color: clear ? scheme.primary : scheme.error,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            clear ? 'Attention queue clear' : 'Attention now',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = MediaQuery.textScalerOf(context).scale(1) > 1.3 ||
            constraints.maxWidth < 300;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              heading,
              const SizedBox(height: 8),
              status,
            ],
          );
        }

        return Row(
          children: [
            Expanded(child: heading),
            const SizedBox(width: 8),
            status,
          ],
        );
      },
    );
  }
}
