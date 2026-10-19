import 'package:flutter/material.dart';

/// Keeps operational section labels and their actions legible on small devices
/// without changing the guard's existing action or permission callbacks.
class GuardFieldSectionHeader extends StatelessWidget {
  const GuardFieldSectionHeader({
    super.key,
    required this.title,
    required this.icon,
    this.action,
  });

  final String title;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = MediaQuery.textScalerOf(context).scale(1) > 1.3 ||
            constraints.maxWidth < 320;
        final heading = Row(
          children: [
            Icon(icon),
            const SizedBox(width: 8),
            Expanded(child: Text(title, style: theme.textTheme.titleLarge)),
          ],
        );

        if (action == null) return heading;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              heading,
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: action!,
              ),
            ],
          );
        }
        return Row(
          children: [
            Icon(icon),
            const SizedBox(width: 8),
            Expanded(child: Text(title, style: theme.textTheme.titleLarge)),
            action!,
          ],
        );
      },
    );
  }
}
