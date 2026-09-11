import 'package:flutter/material.dart';

class ProviderStorefrontSheet extends StatelessWidget {
  const ProviderStorefrontSheet({
    super.key,
    required this.offering,
    required this.onBook,
    this.experience,
    this.isFavorite = false,
    this.onFavoriteChanged,
  });

  final Map<String, dynamic> offering;
  final Map<String, dynamic>? experience;
  final VoidCallback onBook;
  final bool isFavorite;
  final Future<void> Function(bool active)? onFavoriteChanged;

  static Future<void> show(
    BuildContext context, {
    required Map<String, dynamic> offering,
    required VoidCallback onBook,
    Map<String, dynamic>? experience,
    bool isFavorite = false,
    Future<void> Function(bool active)? onFavoriteChanged,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ProviderStorefrontSheet(
        offering: offering,
        experience: experience,
        onBook: onBook,
        isFavorite: isFavorite,
        onFavoriteChanged: onFavoriteChanged,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final provider = Map<String, dynamic>.from(offering['provider'] as Map? ?? const {});
    final experienceProvider = Map<String, dynamic>.from(experience?['provider'] as Map? ?? const {});
    provider.addAll(experienceProvider);
    final category = Map<String, dynamic>.from(offering['category'] as Map? ?? const {});
    final media = (experience?['media'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final offers = (experience?['offers'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final promotion = Map<String, dynamic>.from(experience?['promotion'] as Map? ?? const {});

    final businessName = provider['businessName']?.toString() ?? offering['providerName']?.toString() ?? 'Verified provider';
    final description = provider['description']?.toString().trim();
    final qualityTier = provider['qualityTier']?.toString() ?? experience?['qualityTier']?.toString() ?? 'STANDARD';
    final ratingAverage = (provider['ratingAverage'] as num?)?.toDouble();
    final ratingCount = (provider['ratingCount'] as num?)?.toInt() ?? 0;
    final completedJobs = (provider['completedJobs'] as num?)?.toInt() ?? 0;
    final pricePaise = (offering['pricePaise'] as num?)?.toInt() ?? 0;
    final price = pricePaise / 100;
    final durationMinutes = (offering['durationMinutes'] as num?)?.toInt();
    final logo = media.cast<Map<String, dynamic>?>().firstWhere(
          (item) => item?['kind'] == 'LOGO' && item?['publicUrl']?.toString().isNotEmpty == true,
          orElse: () => null,
        );
    final gallery = media.where((item) => item['kind'] == 'GALLERY' && item['publicUrl']?.toString().isNotEmpty == true).toList();

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
                  _ProviderLogo(url: logo?['publicUrl']?.toString()),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(businessName, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900))),
                            if (promotion.isNotEmpty) const _Badge(icon: Icons.campaign_rounded, label: 'Sponsored'),
                            if (onFavoriteChanged != null) ...[
                              const SizedBox(width: 4),
                              IconButton(
                                tooltip: isFavorite ? 'Remove from favourites' : 'Add to favourites',
                                onPressed: () async {
                                  await onFavoriteChanged!(!isFavorite);
                                  if (context.mounted) Navigator.of(context).pop();
                                },
                                icon: Icon(isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(category['name']?.toString() ?? offering['categoryName']?.toString() ?? 'Home service', style: theme.textTheme.bodyMedium),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            const _Badge(icon: Icons.verified_rounded, label: 'Verified'),
                            if (qualityTier == 'TRUSTED') const _Badge(icon: Icons.shield_rounded, label: 'Trusted'),
                            if (qualityTier == 'PREMIUM') const _Badge(icon: Icons.workspace_premium_rounded, label: 'Premium'),
                            if (ratingAverage != null && ratingCount > 0)
                              _Badge(icon: Icons.star_rounded, label: '${ratingAverage.toStringAsFixed(1)} ($ratingCount)'),
                            if (completedJobs > 0) _Badge(icon: Icons.task_alt_rounded, label: '$completedJobs completed'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (gallery.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('Work gallery', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                SizedBox(
                  height: 132,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: gallery.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (context, index) {
                      final item = gallery[index];
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Image.network(
                          item['publicUrl'].toString(),
                          width: 190,
                          height: 132,
                          fit: BoxFit.cover,
                          semanticLabel: item['altText']?.toString(),
                          errorBuilder: (_, __, ___) => Container(
                            width: 190,
                            alignment: Alignment.center,
                            color: theme.colorScheme.surfaceContainerHighest,
                            child: const Icon(Icons.broken_image_outlined),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
              if (description != null && description.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('About', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text(description),
              ],
              if (offers.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('Offers', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                for (final offer in offers) ...[
                  _OfferCard(offer: offer),
                  const SizedBox(height: 8),
                ],
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
                promotion.isNotEmpty
                    ? 'Sponsored placement is commercial and does not change this provider’s verification or quality tier.'
                    : 'Only providers verified by Aaraagate and currently serviceable for your selected location are shown here.',
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

class _ProviderLogo extends StatelessWidget {
  const _ProviderLogo({this.url});
  final String? url;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (url == null || url!.isEmpty) {
      return CircleAvatar(
        radius: 28,
        backgroundColor: theme.colorScheme.primaryContainer,
        foregroundColor: theme.colorScheme.onPrimaryContainer,
        child: const Icon(Icons.storefront_rounded),
      );
    }
    return CircleAvatar(
      radius: 28,
      backgroundColor: theme.colorScheme.surfaceContainerHighest,
      foregroundImage: NetworkImage(url!),
      onForegroundImageError: (_, __) {},
      child: const Icon(Icons.storefront_rounded),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer});
  final Map<String, dynamic> offer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final type = offer['discountType']?.toString();
    final value = (offer['discountValue'] as num?)?.toInt() ?? 0;
    final discount = type == 'PERCENT'
        ? '${(value / 100).toStringAsFixed(value % 100 == 0 ? 0 : 2)}% off'
        : '₹${(value / 100).toStringAsFixed(value % 100 == 0 ? 0 : 2)} off';
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.local_offer_rounded, color: theme.colorScheme.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(offer['title']?.toString() ?? 'Special offer', style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 3),
                  Text(discount, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                  if (offer['description']?.toString().trim().isNotEmpty == true) ...[
                    const SizedBox(height: 3),
                    Text(offer['description'].toString(), style: theme.textTheme.bodySmall),
                  ],
                  if (offer['terms']?.toString().trim().isNotEmpty == true) ...[
                    const SizedBox(height: 4),
                    Text(offer['terms'].toString(), style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ],
              ),
            ),
          ],
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
