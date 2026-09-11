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
      }

      if (!mounted) return;
      setState(() {
        _locations = locations;
        _selectedLocationKey = selectedKey;
        _offers = offers;
        _offerings = offerings;
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

  Future<void> _openOffer(Map<String, dynamic> offer) async {
    final offering = _offeringFor(offer);
    final location = _selectedLocation;
    if (offering == null || location == null) return;
    final provider = offering['provider'] as Map<String, dynamic>? ?? const {};
    final providerId = offer['providerId']?.toString() ?? offering['providerId']?.toString() ?? provider['id']?.toString();
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
        // The authorized offer and core offering remain usable without rich storefront metadata.
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
            else if (_offers.isEmpty)
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
