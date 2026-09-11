import 'dart:async';
import 'package:flutter/material.dart';
import '../data/api_client.dart';
import 'consumer_booking_screen.dart';
import 'provider_storefront_sheet.dart';

class ConsumerOffersScreen extends StatefulWidget {
  const ConsumerOffersScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  State<ConsumerOffersScreen> createState() => _ConsumerOffersScreenState();
}

class _ConsumerOffersScreenState extends State<ConsumerOffersScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _locations = const [];
  List<Map<String, dynamic>> _offers = const [];
  List<Map<String, dynamic>> _offerings = const [];
  List<Map<String, dynamic>> _commercialPlacements = const [];
  String? _selectedLocationKey;

  String _locationKey(Map<String, dynamic> location) => '${location['type']}:${location['id']}';

  Map<String, dynamic>? get _selectedLocation {
    final key = _selectedLocationKey;
    if (key == null) return null;
    for (final location in _locations) {
      if (_locationKey(location) == key) return location;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rawLocations = await widget.apiClient.get('/api/v1/consumer/services/locations');
      final locations = (rawLocations as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      String? selectedKey = _selectedLocationKey;
      if (selectedKey == null || !locations.any((item) => _locationKey(item) == selectedKey && item['serviceAddressConfigured'] != false)) {
        for (final location in locations) {
          if (location['type'] == 'HOME' && location['serviceAddressConfigured'] != false) {
            selectedKey = _locationKey(location);
            break;
          }
        }
        if (selectedKey == null) {
          for (final location in locations) {
            if (location['serviceAddressConfigured'] != false) {
              selectedKey = _locationKey(location);
              break;
            }
          }
        }
      }

      List<Map<String, dynamic>> offers = const [];
      List<Map<String, dynamic>> offerings = const [];
      List<Map<String, dynamic>> commercialPlacements = const [];
      if (selectedKey != null) {
        final location = locations.firstWhere((item) => _locationKey(item) == selectedKey);
        final params = Uri(queryParameters: {
          'locationType': location['type'].toString(),
          'locationId': location['id'].toString(),
        }).query;
        final results = await Future.wait<dynamic>([
          widget.apiClient.get('/api/v1/consumer/services/offers?$params'),
          widget.apiClient.get('/api/v1/consumer/services/offerings?$params'),
        ]);
        offers = (results[0] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        offerings = (results[1] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        try {
          final rawCommercial = await widget.apiClient.get('/api/v1/consumer/services/commercial-placements?$params');
          commercialPlacements = (rawCommercial as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        } catch (_) {
          // Paid placement is optional presentation metadata and must never block organic offers.
        }
      }

      if (!mounted) return;
      setState(() {
        _locations = locations;
        _selectedLocationKey = selectedKey;
        _offers = offers;
        _offerings = offerings;
        _commercialPlacements = commercialPlacements;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _selectLocation(String? key) async {
    if (key == null) return;
    setState(() => _selectedLocationKey = key);
    await _load();
  }

  Map<String, dynamic>? _offeringFor(Map<String, dynamic> offer) {
    final id = offer['offeringId']?.toString();
    if (id == null || id.isEmpty) return null;
    for (final offering in _offerings) {
      if (offering['id']?.toString() == id) return offering;
    }
    return null;
  }

  Map<String, dynamic> _offeringFromPlacement(Map<String, dynamic> placement) {
    return <String, dynamic>{
      'id': placement['id'],
      'name': placement['name'],
      'pricePaise': placement['pricePaise'],
      'durationMinutes': placement['durationMinutes'],
      'categoryId': placement['categoryId'],
      'categoryName': placement['categoryName'],
      'providerId': placement['providerId'],
      'providerName': placement['providerName'],
      'providerDescription': placement['providerDescription'],
      'category': <String, dynamic>{
        'id': placement['categoryId'],
        'name': placement['categoryName'],
      },
      'provider': <String, dynamic>{
        'id': placement['providerId'],
        'businessName': placement['providerName'],
        'description': placement['providerDescription'],
      },
    };
  }

  Future<void> _openOffer(Map<String, dynamic> offer) async {
    final offering = _offeringFor(offer);
    if (offering == null) return;
    await _openOffering(offering);
  }

  Future<void> _openPlacement(Map<String, dynamic> placement) async {
    await _openOffering(_offeringFromPlacement(placement));
  }

  Future<void> _openOffering(Map<String, dynamic> offering) async {
    final location = _selectedLocation;
    if (location == null) return;
    final provider = offering['provider'] as Map<String, dynamic>? ?? const {};
    final providerId = offering['providerId']?.toString() ?? provider['id']?.toString();
    Map<String, dynamic>? experience;
    if (providerId != null && providerId.isNotEmpty) {
      try {
        final params = Uri(queryParameters: {
          'locationType': location['type'].toString(),
          'locationId': location['id'].toString(),
        }).query;
        final raw = await widget.apiClient.get('/api/v1/consumer/services/providers/$providerId/experience?$params');
        if (raw is Map) experience = Map<String, dynamic>.from(raw);
      } catch (_) {
        // Core authorized offering remains usable without rich storefront metadata.
      }
    }
    if (!mounted) return;
    await ProviderStorefrontSheet.show(
      context,
      offering: offering,
      experience: experience,
      onBook: () => unawaited(Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => ConsumerBookingScreen(apiClient: widget.apiClient, offering: offering, initialLocation: location),
      ))),
    );
  }

  String _discountLabel(Map<String, dynamic> offer) {
    final type = offer['discountType']?.toString();
    final value = (offer['discountValue'] as num?)?.toInt() ?? 0;
    if (type == 'PERCENT') {
      final percent = value / 100;
      return '${percent.toStringAsFixed(value % 100 == 0 ? 0 : 2)}% off';
    }
    final rupees = value / 100;
    return '₹${rupees.toStringAsFixed(value % 100 == 0 ? 0 : 2)} off';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Offers')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Text('Offers for your selected home', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text('Only active offers from verified providers serving this address are shown.', style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            if (_locations.length > 1) ...[
              Text('Service location', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              for (final location in _locations)
                RadioListTile<String>(
                  value: _locationKey(location),
                  groupValue: _selectedLocationKey,
                  onChanged: _loading || location['serviceAddressConfigured'] == false ? null : _selectLocation,
                  title: Text(location['label']?.toString() ?? 'Home'),
                  subtitle: location['serviceAddressConfigured'] == false ? const Text('Service address not configured') : null,
                ),
              const SizedBox(height: 8),
            ],
            if (_loading)
              const Padding(padding: EdgeInsets.only(top: 80), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(children: [
                    const Icon(Icons.cloud_off_rounded),
                    const SizedBox(height: 10),
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _load, child: const Text('Retry')),
                  ]),
                ),
              )
            else if (_selectedLocation == null)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Add or configure a service address to see relevant offers.')))
            else ...[
              if (_commercialPlacements.isNotEmpty) ...[
                Row(
                  children: [
                    Expanded(child: Text('Featured services', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
                    Tooltip(
                      message: 'Paid placement is separate from provider verification and ratings.',
                      child: Icon(Icons.info_outline_rounded, size: 18, color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text('Clearly labeled paid placements from verified providers serving this address.', style: theme.textTheme.bodySmall),
                const SizedBox(height: 10),
                for (final placement in _commercialPlacements) ...[
                  _CommercialPlacementCard(placement: placement, onOpen: () => _openPlacement(placement)),
                  const SizedBox(height: 10),
                ],
                const SizedBox(height: 8),
              ],
              Text('Current offers', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              if (_offers.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No active offers are available for this address right now.')))
              else
                for (final offer in _offers) ...[
                  _OfferCard(
                    offer: offer,
                    discountLabel: _discountLabel(offer),
                    canOpenService: _offeringFor(offer) != null,
                    onOpen: () => _openOffer(offer),
                  ),
                  const SizedBox(height: 10),
                ],
            ],
          ],
        ),
      ),
    );
  }
}

class _CommercialPlacementCard extends StatelessWidget {
  const _CommercialPlacementCard({required this.placement, required this.onOpen});

  final Map<String, dynamic> placement;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final placementType = placement['commercialPlacement']?.toString() == 'SPONSORED' ? 'Sponsored' : 'Featured';
    final pricePaise = (placement['pricePaise'] as num?)?.toInt() ?? 0;
    final price = pricePaise / 100;
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Chip(
                    avatar: const Icon(Icons.campaign_rounded, size: 16),
                    label: Text(placementType, style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  const Spacer(),
                  Text('₹${price.toStringAsFixed(price.truncateToDouble() == price ? 0 : 2)}', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
                ],
              ),
              const SizedBox(height: 8),
              Text(placement['name']?.toString() ?? 'Home service', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 3),
              Text(placement['providerName']?.toString() ?? 'Verified provider', style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 3),
              Text(placement['categoryName']?.toString() ?? 'Home service'),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.verified_rounded, size: 17),
                  const SizedBox(width: 5),
                  const Expanded(child: Text('Verified provider · paid visibility is separate from trust status')),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer, required this.discountLabel, required this.canOpenService, required this.onOpen});

  final Map<String, dynamic> offer;
  final String discountLabel;
  final bool canOpenService;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final endsAt = DateTime.tryParse(offer['endsAt']?.toString() ?? '')?.toLocal();
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.local_offer_rounded, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              Expanded(child: Text(offer['title']?.toString() ?? 'Special offer', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
              Chip(label: Text(discountLabel, style: const TextStyle(fontWeight: FontWeight.w800))),
            ]),
            const SizedBox(height: 8),
            Text(offer['providerName']?.toString() ?? 'Verified provider', style: const TextStyle(fontWeight: FontWeight.w800)),
            if (offer['offeringName']?.toString().isNotEmpty == true) ...[
              const SizedBox(height: 3),
              Text(offer['offeringName'].toString()),
            ] else ...[
              const SizedBox(height: 3),
              const Text('Provider-wide offer · choose an eligible service from Services'),
            ],
            if (offer['description']?.toString().trim().isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(offer['description'].toString()),
            ],
            if (endsAt != null) ...[
              const SizedBox(height: 8),
              Text('Valid until ${MaterialLocalizations.of(context).formatMediumDate(endsAt)}', style: theme.textTheme.bodySmall),
            ],
            if (offer['terms']?.toString().trim().isNotEmpty == true) ...[
              const SizedBox(height: 6),
              Text(offer['terms'].toString(), style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
            if (canOpenService) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(onPressed: onOpen, icon: const Icon(Icons.arrow_forward_rounded), label: const Text('View service')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
