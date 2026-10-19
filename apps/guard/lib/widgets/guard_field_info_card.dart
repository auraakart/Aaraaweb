import 'package:flutter/material.dart';

/// Read-only Watchlist and Incident rows stay compact at normal text sizes
/// while giving long operational details their own width at large text sizes.
class GuardFieldInfoCard extends StatelessWidget {
  const GuardFieldInfoCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final titleText = Text(
      title,
      style: const TextStyle(fontWeight: FontWeight.w800),
    );
    final subtitleText = Text(subtitle);
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;

    if (!largeText) {
      return Card(
        child: ListTile(
          leading: Icon(icon),
          title: titleText,
          subtitle: subtitleText,
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon),
                const SizedBox(width: 10),
                Expanded(child: titleText),
              ],
            ),
            const SizedBox(height: 8),
            subtitleText,
          ],
        ),
      ),
    );
  }
}
