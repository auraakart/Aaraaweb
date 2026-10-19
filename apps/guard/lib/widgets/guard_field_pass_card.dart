import 'package:flutter/material.dart';

/// Responsive presentation for an existing material/move pass. The caller
/// retains the original process callback, permission and busy state.
class GuardFieldPassCard extends StatelessWidget {
  const GuardFieldPassCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.status,
    this.action,
  });

  final String title;
  final String subtitle;
  final String status;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
    if (!largeText) {
      return Card(
        child: ListTile(
          title: Text(title),
          subtitle: Text(subtitle),
          trailing: action ?? Text(status),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(subtitle),
            const SizedBox(height: 12),
            if (action != null)
              SizedBox(
                width: double.infinity,
                child: action!,
              )
            else
              Text(
                status,
                style: Theme.of(context).textTheme.labelLarge,
              ),
          ],
        ),
      ),
    );
  }
}
