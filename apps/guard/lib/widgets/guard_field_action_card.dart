import 'package:flutter/material.dart';

/// Operational action rows retain the compact ListTile at normal text sizes
/// and give the action its own row when an operator uses enlarged text.
class GuardFieldActionCard extends StatelessWidget {
  const GuardFieldActionCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.actionLabel,
    required this.onPressed,
    this.icon,
    this.strongTitle = false,
  });

  final String title;
  final String subtitle;
  final String actionLabel;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool strongTitle;

  @override
  Widget build(BuildContext context) {
    final titleText = Text(
      title,
      style: strongTitle
          ? const TextStyle(fontWeight: FontWeight.w800)
          : null,
    );
    final subtitleText = Text(subtitle);
    final action = FilledButton.tonal(
      onPressed: onPressed,
      child: Text(actionLabel),
    );
    if (MediaQuery.textScalerOf(context).scale(1) <= 1.3) {
      return Card(
        child: ListTile(
          leading: icon == null ? null : Icon(icon),
          title: titleText,
          subtitle: subtitleText,
          trailing: action,
        ),
      );
    }
    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        titleText,
        const SizedBox(height: 4),
        subtitleText,
      ],
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (icon != null)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon),
                  const SizedBox(width: 10),
                  Expanded(child: details),
                ],
              )
            else
              details,
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: action,
            ),
          ],
        ),
      ),
    );
  }
}
