import 'package:flutter/material.dart';

class ProviderStorefrontSheet extends StatelessWidget {
  const ProviderStorefrontSheet({
    super.key,
    required this.offering,
    required this.onBook,
  });

  final Map<String, dynamic> offering;
  final VoidCallback onBook;

  static Future<void> show(
    BuildContext context, {
    required Map<String, dynamic> offering,
    required VoidCallback onBook,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ProviderStorefrontSheet(offering: offering, onBook: onBook),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final provider = Map<String, dynamic>.from(offering['provider'] as Map? ?? const {});
    final category = Map<String, dynamic>.from(offering['category'] as Map? ?? const {});
    final businessName = provider['businessName']?.toString() ?? offering['providerName']?.toString() ?? 'Verified provider';
    final description = provider['description']?.toString().trim();
    final ratingAverage = (provider['ratingAverage'] as num?)?.toDouble();
    final ratingCount = (provider['ratingCount'] as num?)?.toInt() ?? 0;
    final completedJobs = (provider['completedJobs'] as num?)?.toInt() ?? 0;
    final pricePaise = (offering['pricePaise'] as num?)?.toInt() ?? 0;
    final price = pricePaise / 100;
    final durationMinutes = (offering['durationMinutes'] as num?)?.toInt();

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewPaddingOf(context).bottom),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: theme.colorScheme.primaryContainer,
                    foregroundColor: theme.colorScheme.onPrimaryContainer,
                    child: const Icon(Icons.storefront_rounded),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(businessName, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 4),
                        Text(category['name']?.toString() ?? offering['categoryName']?.toString() ?? 'Home service', style: theme.textTheme.bodyMedium),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            _Badge(icon: Icons.verified_rounded, label: 'Verified'),
                            if (ratingAverage != null && ratingCount > 0)
                              _Badge(icon: Icons.star_rounded, label: '${ratingAverage.toStringAsFixed(1)} ($ratingCount)'),
                            if (completedJobs > 0)
                              _Badge(icon: Icons.task_alt_rounded, label: '$completedJobs completed'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (description != null && description.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('About', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text(description),
              ],
              const SizedBox(height: 20),
              Text('Service', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const Icon(Icons.handyman_rounded),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w800)),
                            if (offering['description']?.toString().trim().isNotEmpty == true) ...[
                              const SizedBox(height: 3),
                              Text(offering['description'].toString(), style: theme.textTheme.bodySmall),
                            ],
                            if (durationMinutes != null) ...[
                              const SizedBox(height: 3),
                              Text('Approx. $durationMinutes minutes', style: theme.textTheme.bodySmall),
                            ],
                          ],
                        ),
                      ),
                      Text('₹${price.toStringAsFixed(price.truncateToDouble() == price ? 0 : 2)}', style: const TextStyle(fontWeight: FontWeight.w900)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Only providers verified by Aaraagate and currently serviceable for your selected location are shown here.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    onBook();
                  },
                  icon: const Icon(Icons.calendar_month_rounded),
                  label: const Text('Request / book service'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15),
            const SizedBox(width: 4),
            Text(label, style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}
