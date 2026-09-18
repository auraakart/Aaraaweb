from pathlib import Path
import runpy

screen_path = Path('apps/resident/lib/screens/services_screen.dart')

# Reuse the established fixture-data enrichment. The legacy script writes the
# richer demo offerings before attempting UI patching; after the Services UI
# redesign its old widget snippets no longer exist, so that expected mismatch
# is ignored here and the premium UI is patched below.
try:
    runpy.run_path('scripts/enrich-resident-demo-fixture.py', run_name='__main__')
except RuntimeError as error:
    if 'Expected ServicesScreen snippet not found' not in str(error):
        raise

screen = screen_path.read_text()


def replace_once(old: str, new: str) -> None:
    global screen
    if old not in screen:
        raise RuntimeError(f'Expected premium ServicesScreen snippet not found: {old[:100]!r}')
    screen = screen.replace(old, new, 1)


replace_once(
    """                      final completedJobs = provider is Map ? (provider['completedJobs'] as num?)?.toInt() ?? 0 : 0;\n                      final duration = (offering['durationMinutes'] as num?)?.toInt();\n                      return PremiumSurface(""",
    """                      final completedJobs = provider is Map ? (provider['completedJobs'] as num?)?.toInt() ?? 0 : 0;\n                      final duration = (offering['durationMinutes'] as num?)?.toInt();\n                      final providerImage = provider is Map ? provider['imageUrl']?.toString() : null;\n                      final membershipTier = provider is Map ? provider['membershipTier']?.toString() : null;\n                      final placementType = offering['placementType']?.toString() ?? 'ORGANIC';\n                      final offerTitle = offering['offerTitle']?.toString();\n                      final offerEndsOn = offering['offerEndsOn']?.toString();\n                      final offerPricePaise = (offering['discountPricePaise'] as num?)?.toInt() ?? 0;\n                      final regularPricePaise = _pricePaise(offering);\n                      final hasOffer = offerPricePaise > 0 && offerPricePaise < regularPricePaise;\n                      return PremiumSurface(""",
)

replace_once(
    """                                Container(\n                                  width: AaraagateTokens.iconContainer,\n                                  height: AaraagateTokens.iconContainer,\n                                  alignment: Alignment.center,\n                                  decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),\n                                  child: Text(_providerInitial(offering), style: theme.textTheme.titleMedium?.copyWith(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w800)),\n                                ),""",
    """                                SizedBox(\n                                  width: 58,\n                                  height: 58,\n                                  child: ClipRRect(\n                                    borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),\n                                    child: providerImage == null || providerImage.isEmpty\n                                        ? ColoredBox(\n                                            color: scheme.primaryContainer,\n                                            child: Center(child: Text(_providerInitial(offering), style: theme.textTheme.titleLarge?.copyWith(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w800))),\n                                          )\n                                        : Image.network(\n                                            providerImage,\n                                            fit: BoxFit.cover,\n                                            errorBuilder: (_, __, ___) => ColoredBox(\n                                              color: scheme.primaryContainer,\n                                              child: Center(child: Text(_providerInitial(offering), style: theme.textTheme.titleLarge?.copyWith(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w800))),\n                                            ),\n                                          ),\n                                  ),\n                                ),""",
)

replace_once(
    """                                Text(_price(offering['pricePaise']), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),""",
    """                                Column(\n                                  crossAxisAlignment: CrossAxisAlignment.end,\n                                  children: [\n                                    Text(_price(hasOffer ? offerPricePaise : regularPricePaise), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: hasOffer ? scheme.primary : null)),\n                                    if (hasOffer)\n                                      Text(_price(regularPricePaise), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant, decoration: TextDecoration.lineThrough)),\n                                  ],\n                                ),""",
)

replace_once(
    """                            if ((offering['description']?.toString() ?? '').trim().isNotEmpty) ...[\n                              const SizedBox(height: AaraagateTokens.space2),\n                              Text(offering['description'].toString(), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),\n                            ],\n                            const SizedBox(height: AaraagateTokens.space3),""",
    """                            if ((offering['description']?.toString() ?? '').trim().isNotEmpty) ...[\n                              const SizedBox(height: AaraagateTokens.space2),\n                              Text(offering['description'].toString(), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),\n                            ],\n                            if (hasOffer && (offerTitle ?? '').trim().isNotEmpty) ...[\n                              const SizedBox(height: AaraagateTokens.space3),\n                              PremiumSurface(\n                                color: scheme.primaryContainer.withOpacity(0.45),\n                                padding: const EdgeInsets.all(AaraagateTokens.space3),\n                                child: Row(\n                                  children: [\n                                    Icon(Icons.local_offer_rounded, color: scheme.primary),\n                                    const SizedBox(width: AaraagateTokens.space2),\n                                    Expanded(\n                                      child: Column(\n                                        crossAxisAlignment: CrossAxisAlignment.start,\n                                        children: [\n                                          Text(offerTitle!, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),\n                                          if ((offerEndsOn ?? '').trim().isNotEmpty) Text('Valid until $offerEndsOn', style: theme.textTheme.bodySmall),\n                                        ],\n                                      ),\n                                    ),\n                                  ],\n                                ),\n                              ),\n                            ],\n                            const SizedBox(height: AaraagateTokens.space3),""",
)

replace_once(
    """                              children: [\n                                if (ratingAverage != null && ratingCount > 0)""",
    """                              children: [\n                                if (placementType == 'SPONSORED')\n                                  const AaraagateStatusPill(label: 'Sponsored · paid placement', tone: AaraagateStatusTone.warning),\n                                if (placementType == 'FEATURED')\n                                  const AaraagateStatusPill(label: 'Featured · paid placement', tone: AaraagateStatusTone.info),\n                                if (membershipTier == 'PREMIUM')\n                                  const AaraagateStatusPill(label: 'Premium provider', tone: AaraagateStatusTone.info),\n                                if (ratingAverage != null && ratingCount > 0)""",
)

replace_once(
    """                  final count = offerings.length;\n                  return Padding(""",
    """                  final count = offerings.length;\n                  final offerCount = offerings.where((item) {\n                    final regular = _pricePaise(item);\n                    final discounted = (item['discountPricePaise'] as num?)?.toInt() ?? 0;\n                    return discounted > 0 && discounted < regular;\n                  }).length;\n                  final heroProvider = first['provider'];\n                  final heroImage = heroProvider is Map ? heroProvider['imageUrl']?.toString() : null;\n                  return Padding(""",
)

replace_once(
    """                          Container(\n                            width: AaraagateTokens.iconContainer,\n                            height: AaraagateTokens.iconContainer,\n                            decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),\n                            child: Icon(Icons.home_repair_service_outlined, color: scheme.onPrimaryContainer),\n                          ),""",
    """                          SizedBox(\n                            width: 64,\n                            height: 64,\n                            child: ClipRRect(\n                              borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),\n                              child: heroImage == null || heroImage.isEmpty\n                                  ? ColoredBox(\n                                      color: scheme.primaryContainer,\n                                      child: Icon(Icons.home_repair_service_outlined, color: scheme.onPrimaryContainer),\n                                    )\n                                  : Image.network(\n                                      heroImage,\n                                      fit: BoxFit.cover,\n                                      errorBuilder: (_, __, ___) => ColoredBox(\n                                        color: scheme.primaryContainer,\n                                        child: Icon(Icons.home_repair_service_outlined, color: scheme.onPrimaryContainer),\n                                      ),\n                                    ),\n                            ),\n                          ),""",
)

replace_once(
    """                                Text('$count verified provider${count == 1 ? '' : 's'}', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),\n                                const SizedBox(height: AaraagateTokens.space1),""",
    """                                Text('$count verified provider${count == 1 ? '' : 's'}', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),\n                                if (offerCount > 0) ...[\n                                  const SizedBox(height: AaraagateTokens.space1),\n                                  Text('$offerCount active offer${offerCount == 1 ? '' : 's'}', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w800, color: scheme.primary)),\n                                ],\n                                const SizedBox(height: AaraagateTokens.space1),""",
)

screen_path.write_text(screen)
print('Resident demo marketplace enriched for premium UI with provider images, offers, premium tiers and clearly labelled paid placement.')
