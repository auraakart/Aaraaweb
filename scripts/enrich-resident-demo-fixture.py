from pathlib import Path

repo_path = Path('apps/resident/lib/data/demo_resident_repository.dart')
screen_path = Path('apps/resident/lib/screens/services_screen.dart')

text = repo_path.read_text()

start_marker = "  final List<Map<String, dynamic>> _offerings = const ["
end_marker = "\n  ];\n\n  @override\n  Future<List<Map<String, dynamic>>> serviceOfferings"
start = text.index(start_marker)
end = text.index(end_marker, start) + len("\n  ];")

offerings = '''  final List<Map<String, dynamic>> _offerings = const [
    {
      'id': 'demo-offering-1',
      'categoryId': 'demo-category-1',
      'name': 'AC service',
      'description': 'General inspection, filter cleaning and basic servicing',
      'pricePaise': 69900,
      'discountPricePaise': 54900,
      'offerTitle': 'Monsoon AC Care · Save ₹150',
      'offerEndsOn': '30 Sep',
      'durationMinutes': 55,
      'placementType': 'SPONSORED',
      'provider': {
        'id': 'demo-provider-coolcare',
        'businessName': 'CoolCare Services',
        'description': 'Home AC servicing and cooling-system maintenance specialists.',
        'ratingAverage': 4.8,
        'ratingCount': 184,
        'completedJobs': 612,
        'membershipTier': 'PREMIUM',
        'imageUrl': 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=400&q=80',
      },
    },
    {
      'id': 'demo-offering-1b',
      'categoryId': 'demo-category-1',
      'name': 'AC service',
      'description': 'AC inspection, coil cleaning and performance check',
      'pricePaise': 69900,
      'durationMinutes': 60,
      'placementType': 'FEATURED',
      'provider': {
        'id': 'demo-provider-airpro',
        'businessName': 'AirPro Home Care',
        'description': 'Verified residential AC and appliance service team.',
        'ratingAverage': 4.6,
        'ratingCount': 126,
        'completedJobs': 438,
        'membershipTier': 'GROWTH',
        'imageUrl': 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=400&q=80',
      },
    },
    {
      'id': 'demo-offering-2',
      'categoryId': 'demo-category-2',
      'name': 'Deep cleaning',
      'description': '2 BHK home deep-cleaning package',
      'pricePaise': 169900,
      'discountPricePaise': 139900,
      'offerTitle': 'Festive Deep Clean · 18% off',
      'offerEndsOn': '05 Oct',
      'durationMinutes': 240,
      'placementType': 'FEATURED',
      'provider': {
        'id': 'demo-provider-neatnest',
        'businessName': 'NeatNest Home Services',
        'description': 'Deep cleaning and move-in/move-out cleaning specialists.',
        'ratingAverage': 4.7,
        'ratingCount': 211,
        'completedJobs': 705,
        'membershipTier': 'PREMIUM',
        'imageUrl': 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80',
      },
    },
    {
      'id': 'demo-offering-2b',
      'categoryId': 'demo-category-2',
      'name': 'Deep cleaning',
      'description': '2 BHK intensive kitchen, bathroom and floor cleaning',
      'pricePaise': 159900,
      'durationMinutes': 270,
      'placementType': 'ORGANIC',
      'provider': {
        'id': 'demo-provider-sparkle',
        'businessName': 'SparkleCrew',
        'description': 'Background-verified home cleaning professionals.',
        'ratingAverage': 4.5,
        'ratingCount': 153,
        'completedJobs': 489,
        'membershipTier': 'BASIC',
        'imageUrl': 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=400&q=80',
      },
    },
    {
      'id': 'demo-offering-3',
      'categoryId': 'demo-category-3',
      'name': 'Electrician visit',
      'description': 'Switch, fan and light troubleshooting visit',
      'pricePaise': 29900,
      'discountPricePaise': 24900,
      'offerTitle': 'First visit offer · Save ₹50',
      'offerEndsOn': '25 Sep',
      'durationMinutes': 45,
      'placementType': 'SPONSORED',
      'provider': {
        'id': 'demo-provider-powerfix',
        'businessName': 'PowerFix Electricals',
        'description': 'Residential electrical repair and installation services.',
        'ratingAverage': 4.8,
        'ratingCount': 167,
        'completedJobs': 544,
        'membershipTier': 'PREMIUM',
        'imageUrl': 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80',
      },
    },
    {
      'id': 'demo-offering-4',
      'categoryId': 'demo-category-4',
      'name': 'Plumber visit',
      'description': 'Tap, flush and minor leakage repair visit',
      'pricePaise': 34900,
      'durationMinutes': 45,
      'placementType': 'ORGANIC',
      'provider': {
        'id': 'demo-provider-flowcare',
        'businessName': 'FlowCare Plumbing',
        'description': 'Household plumbing maintenance and leak-fix professionals.',
        'ratingAverage': 4.7,
        'ratingCount': 142,
        'completedJobs': 463,
        'membershipTier': 'GROWTH',
        'imageUrl': 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=400&q=80',
      },
    },
    {
      'id': 'demo-offering-5',
      'categoryId': 'demo-category-5',
      'name': 'Washing machine service',
      'description': 'Inspection and basic repair visit',
      'pricePaise': 54900,
      'discountPricePaise': 44900,
      'offerTitle': 'Appliance Care Week · Save ₹100',
      'offerEndsOn': '28 Sep',
      'durationMinutes': 60,
      'placementType': 'FEATURED',
      'provider': {
        'id': 'demo-provider-appliancecare',
        'businessName': 'ApplianceCare Plus',
        'description': 'Multi-brand washing machine and refrigerator service.',
        'ratingAverage': 4.7,
        'ratingCount': 136,
        'completedJobs': 420,
        'membershipTier': 'PREMIUM',
        'imageUrl': 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?auto=format&fit=crop&w=400&q=80',
      },
    },
    {
      'id': 'demo-offering-6',
      'categoryId': 'demo-category-6',
      'name': 'Salon at home',
      'description': 'Basic grooming package at home',
      'pricePaise': 99900,
      'discountPricePaise': 79900,
      'offerTitle': 'Weekend Glow · 20% off',
      'offerEndsOn': '20 Sep',
      'durationMinutes': 75,
      'placementType': 'SPONSORED',
      'provider': {
        'id': 'demo-provider-glowdoor',
        'businessName': 'GlowDoor Beauty',
        'description': 'Verified at-home grooming and beauty professionals.',
        'ratingAverage': 4.8,
        'ratingCount': 201,
        'completedJobs': 669,
        'membershipTier': 'PREMIUM',
        'imageUrl': 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=400&q=80',
      },
    },
  ];'''

text = text[:start] + offerings + text[end:]
repo_path.write_text(text)

screen = screen_path.read_text()

def replace_once(old: str, new: str) -> None:
    global screen
    if old not in screen:
        raise RuntimeError(f'Expected ServicesScreen snippet not found: {old[:80]!r}')
    screen = screen.replace(old, new, 1)

replace_once(
    """                        final completedJobs = provider is Map ? (provider['completedJobs'] as num?)?.toInt() ?? 0 : 0;\n                        final duration = (offering['durationMinutes'] as num?)?.toInt();\n                        return Card(""",
    """                        final completedJobs = provider is Map ? (provider['completedJobs'] as num?)?.toInt() ?? 0 : 0;\n                        final duration = (offering['durationMinutes'] as num?)?.toInt();\n                        final providerImage = provider is Map ? provider['imageUrl']?.toString() : null;\n                        final membershipTier = provider is Map ? provider['membershipTier']?.toString() : null;\n                        final placementType = offering['placementType']?.toString() ?? 'ORGANIC';\n                        final offerTitle = offering['offerTitle']?.toString();\n                        final offerEndsOn = offering['offerEndsOn']?.toString();\n                        final offerPricePaise = (offering['discountPricePaise'] as num?)?.toInt() ?? 0;\n                        final regularPricePaise = _pricePaise(offering);\n                        final hasOffer = offerPricePaise > 0 && offerPricePaise < regularPricePaise;\n                        return Card(""",
)

replace_once(
    """                                    CircleAvatar(\n                                      child: Text(_providerInitial(offering)),\n                                    ),""",
    """                                    SizedBox(\n                                      width: 58,\n                                      height: 58,\n                                      child: ClipRRect(\n                                        borderRadius: BorderRadius.circular(16),\n                                        child: providerImage == null || providerImage.isEmpty\n                                            ? ColoredBox(\n                                                color: theme.colorScheme.surfaceContainerHighest,\n                                                child: Center(child: Text(_providerInitial(offering), style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800))),\n                                              )\n                                            : Image.network(\n                                                providerImage,\n                                                fit: BoxFit.cover,\n                                                errorBuilder: (_, __, ___) => ColoredBox(\n                                                  color: theme.colorScheme.surfaceContainerHighest,\n                                                  child: Center(child: Text(_providerInitial(offering), style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800))),\n                                                ),\n                                              ),\n                                      ),\n                                    ),""",
)

replace_once(
    """                                    Text(_price(offering['pricePaise']), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),""",
    """                                    Column(\n                                      crossAxisAlignment: CrossAxisAlignment.end,\n                                      children: [\n                                        Text(_price(hasOffer ? offerPricePaise : regularPricePaise), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900, color: hasOffer ? theme.colorScheme.primary : null)),\n                                        if (hasOffer)\n                                          Text(\n                                            _price(regularPricePaise),\n                                            style: theme.textTheme.bodySmall?.copyWith(decoration: TextDecoration.lineThrough),\n                                          ),\n                                      ],\n                                    ),""",
)

replace_once(
    """                                if ((offering['description']?.toString() ?? '').trim().isNotEmpty) ...[\n                                  const SizedBox(height: 6),\n                                  Text(offering['description'].toString(), style: theme.textTheme.bodySmall),\n                                ],\n                                const SizedBox(height: 10),\n                                Wrap(""",
    """                                if ((offering['description']?.toString() ?? '').trim().isNotEmpty) ...[\n                                  const SizedBox(height: 6),\n                                  Text(offering['description'].toString(), style: theme.textTheme.bodySmall),\n                                ],\n                                if (hasOffer && (offerTitle ?? '').trim().isNotEmpty) ...[\n                                  const SizedBox(height: 12),\n                                  Container(\n                                    width: double.infinity,\n                                    padding: const EdgeInsets.all(12),\n                                    decoration: BoxDecoration(\n                                      color: theme.colorScheme.primaryContainer.withOpacity(0.55),\n                                      borderRadius: BorderRadius.circular(14),\n                                    ),\n                                    child: Row(\n                                      children: [\n                                        Icon(Icons.local_offer_rounded, color: theme.colorScheme.primary),\n                                        const SizedBox(width: 10),\n                                        Expanded(\n                                          child: Column(\n                                            crossAxisAlignment: CrossAxisAlignment.start,\n                                            children: [\n                                              Text(offerTitle!, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),\n                                              if ((offerEndsOn ?? '').trim().isNotEmpty) Text('Valid until $offerEndsOn', style: theme.textTheme.bodySmall),\n                                            ],\n                                          ),\n                                        ),\n                                      ],\n                                    ),\n                                  ),\n                                ],\n                                const SizedBox(height: 10),\n                                Wrap(""",
)

replace_once(
    """                                  children: [\n                                    if (ratingAverage != null && ratingCount > 0)""",
    """                                  children: [\n                                    if (placementType == 'SPONSORED')\n                                      const Chip(avatar: Icon(Icons.campaign_outlined, size: 16), label: Text('Sponsored · paid placement')),\n                                    if (placementType == 'FEATURED')\n                                      const Chip(avatar: Icon(Icons.auto_awesome_rounded, size: 16), label: Text('Featured · paid placement')),\n                                    if (membershipTier == 'PREMIUM')\n                                      const Chip(avatar: Icon(Icons.workspace_premium_outlined, size: 16), label: Text('Premium provider')),\n                                    if (ratingAverage != null && ratingCount > 0)""",
)

replace_once(
    """                  final count = offerings.length;\n                  return Padding(""",
    """                  final count = offerings.length;\n                  final offerCount = offerings.where((item) {\n                    final regular = _pricePaise(item);\n                    final discounted = (item['discountPricePaise'] as num?)?.toInt() ?? 0;\n                    return discounted > 0 && discounted < regular;\n                  }).length;\n                  final heroProvider = first['provider'];\n                  final heroImage = heroProvider is Map ? heroProvider['imageUrl']?.toString() : null;\n                  return Padding(""",
)

replace_once(
    """                              const CircleAvatar(child: Icon(Icons.home_repair_service_outlined)),""",
    """                              SizedBox(\n                                width: 64,\n                                height: 64,\n                                child: ClipRRect(\n                                  borderRadius: BorderRadius.circular(18),\n                                  child: heroImage == null || heroImage.isEmpty\n                                      ? ColoredBox(\n                                          color: theme.colorScheme.surfaceContainerHighest,\n                                          child: const Icon(Icons.home_repair_service_outlined),\n                                        )\n                                      : Image.network(\n                                          heroImage,\n                                          fit: BoxFit.cover,\n                                          errorBuilder: (_, __, ___) => ColoredBox(\n                                            color: theme.colorScheme.surfaceContainerHighest,\n                                            child: const Icon(Icons.home_repair_service_outlined),\n                                          ),\n                                        ),\n                                ),\n                              ),""",
)

replace_once(
    """                                    Text('$count verified provider${count == 1 ? '' : 's'}', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),\n                                    const SizedBox(height: 4),""",
    """                                    Text('$count verified provider${count == 1 ? '' : 's'}', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),\n                                    if (offerCount > 0) ...[\n                                      const SizedBox(height: 4),\n                                      Row(\n                                        children: [\n                                          Icon(Icons.local_offer_rounded, size: 16, color: theme.colorScheme.primary),\n                                          const SizedBox(width: 5),\n                                          Text('$offerCount active offer${offerCount == 1 ? '' : 's'}', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w800, color: theme.colorScheme.primary)),\n                                        ],\n                                      ),\n                                    ],\n                                    const SizedBox(height: 4),""",
)

screen_path.write_text(screen)
print('Resident demo marketplace enriched with provider images, offers, premium tiers and clearly labelled paid placement.')
