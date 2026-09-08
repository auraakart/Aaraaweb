import 'package:flutter/material.dart';
import '../data/api_client.dart';
import 'consumer_booking_screen.dart';
import 'consumer_bookings_screen.dart';

class IndependentServicesScreen extends StatefulWidget {
  const IndependentServicesScreen({
    super.key,
    required this.apiClient,
    this.onSignOut,
    this.independentMode = true,
  });

  final ApiClient apiClient;
  final Future<void> Function()? onSignOut;
  final bool independentMode;

  @override
  State<IndependentServicesScreen> createState() => _IndependentServicesScreenState();
}

class _IndependentServicesScreenState extends State<IndependentServicesScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _categories = const [];
  List<Map<String, dynamic>> _offerings = const [];
  List<Map<String, dynamic>> _locations = const [];
  String? _selectedCategoryId;
  String? _selectedLocationKey;

  Map<String, dynamic>? get _selectedLocation {
    final key = _selectedLocationKey;
    if (key == null) return null;
    for (final location in _locations) {
      if (_locationKey(location) == key) return location;
    }
    return null;
  }

  String _locationKey(Map<String, dynamic> location) => '${location['type']}:${location['id']}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load([String? categoryId]) async {
    setState(() {
      _loading = true;
      _error = null;
      _selectedCategoryId = categoryId;
    });
    try {
      final categoriesRaw = await widget.apiClient.get('/api/v1/consumer/services/categories');
      final locationsRaw = await widget.apiClient.get('/api/v1/consumer/services/locations');
      List<dynamic> trustRaw = const [];
      try {
        final raw = await widget.apiClient.get('/api/v1/consumer/services/providers/trust');
        trustRaw = raw as List<dynamic>? ?? const [];
      } catch (_) {
        // Trust metadata is informational and must never block service discovery.
      }
      final locations = (locationsRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      final trustByProvider = <String, Map<String, dynamic>>{};
      for (final trust in trustRaw.whereType<Map<String, dynamic>>()) {
        final providerId = trust['providerId']?.toString();
        if (providerId != null && providerId.isNotEmpty) trustByProvider[providerId] = trust;
      }

      String? selectedKey = _selectedLocationKey;
      if (selectedKey == null || !locations.any((item) => _locationKey(item) == selectedKey && item['serviceAddressConfigured'] != false)) {
        for (final location in locations) {
          if (location['serviceAddressConfigured'] != false) {
            selectedKey = _locationKey(location);
            break;
          }
        }
      }

      List<Map<String, dynamic>> offerings = const [];
      if (selectedKey != null) {
        final location = locations.firstWhere((item) => _locationKey(item) == selectedKey);
        final params = <String, String>{
          'locationType': location['type'].toString(),
          'locationId': location['id'].toString(),
          if (categoryId != null) 'categoryId': categoryId,
        };
        final raw = await widget.apiClient.get('/api/v1/consumer/services/offerings?${Uri(queryParameters: params).query}');
        offerings = (raw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().map((offering) {
          final provider = Map<String, dynamic>.from(offering['provider'] as Map? ?? const {});
          final providerId = offering['providerId']?.toString() ?? provider['id']?.toString();
          final trust = providerId == null ? null : trustByProvider[providerId];
          if (trust != null) {
            provider['ratingAverage'] = trust['averageStars'];
            provider['ratingCount'] = trust['ratingCount'];
            provider['completedJobs'] = trust['completedJobs'];
          }
          return <String, dynamic>{...offering, 'provider': provider};
        }).toList();
      }
      if (!mounted) return;
      setState(() {
        _categories = (categoriesRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _locations = locations;
        _selectedLocationKey = selectedKey;
        _offerings = offerings;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _selectLocation(String? key) async {
    if (key == null) return;
    setState(() => _selectedLocationKey = key);
    await _load(_selectedCategoryId);
  }

  Future<void> _openBooking(Map<String, dynamic> offering) async {
    final location = _selectedLocation;
    if (location == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ConsumerBookingScreen(
          apiClient: widget.apiClient,
          offering: offering,
          initialLocation: location,
        ),
      ),
    );
  }

  Future<void> _openMyBookings() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ConsumerBookingsScreen(apiClient: widget.apiClient)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('External Services'),
        actions: [
          IconButton(tooltip: 'My bookings', onPressed: _openMyBookings, icon: const Icon(Icons.event_note_rounded)),
          if (widget.onSignOut != null)
            IconButton(tooltip: 'Sign out', onPressed: () => widget.onSignOut!(), icon: const Icon(Icons.logout_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _load(_selectedCategoryId),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      backgroundColor: theme.colorScheme.primaryContainer,
                      foregroundColor: theme.colorScheme.onPrimaryContainer,
                      child: Icon(widget.independentMode ? Icons.home_rounded : Icons.apartment_rounded),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.independentMode ? 'Services for your home' : 'External services near you',
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.independentMode
                                ? 'Choose an address to see only providers that serve your area.'
                                : 'Your society apartment and saved home addresses can be used as delivery locations.',
                            style: theme.textTheme.bodyMedium,
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton.icon(
                            onPressed: _openMyBookings,
                            icon: const Icon(Icons.event_note_rounded),
                            label: const Text('My External Bookings'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Service location', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            if (_locations.isEmpty && !_loading)
              const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('No service location is available yet. Open a service to add a home address.')))
            else
              for (final location in _locations)
                RadioListTile<String>(
                  value: _locationKey(location),
                  groupValue: _selectedLocationKey,
                  onChanged: _loading || location['serviceAddressConfigured'] == false ? null : _selectLocation,
                  title: Text(location['label']?.toString() ?? 'Service location', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(
                    location['serviceAddressConfigured'] == false
                        ? 'Society service address is not configured yet.'
                        : '${location['addressLine1'] ?? ''}, ${location['locality'] ?? ''}, ${location['city'] ?? ''}',
                  ),
                  secondary: Icon(location['type'] == 'SOCIETY_UNIT' ? Icons.apartment_rounded : Icons.home_rounded),
                ),
            const SizedBox(height: 16),
            Text('Service categories', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(label: const Text('All'), selected: _selectedCategoryId == null, onSelected: (_) => _load()),
                  ),
                  for (final category in _categories)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(category['name']?.toString() ?? 'Service'),
                        selected: _selectedCategoryId == category['id']?.toString(),
                        onSelected: (_) => _load(category['id']?.toString()),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            if (_loading)
              const Padding(padding: EdgeInsets.symmetric(vertical: 36), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      const Icon(Icons.cloud_off_rounded),
                      const SizedBox(height: 8),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: () => _load(_selectedCategoryId), child: const Text('Retry')),
                    ],
                  ),
                ),
              )
            else if (_selectedLocation == null)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Choose or add a service location to find providers serving your area.')))
            else if (_offerings.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No verified providers currently serve this location for the selected category.')))
            else
              for (final offering in _offerings) ...[
                _OfferingCard(offering: offering, onTap: () => _openBooking(offering)),
                const SizedBox(height: 10),
              ],
          ],
        ),
      ),
    );
  }
}

class _OfferingCard extends StatelessWidget {
  const _OfferingCard({required this.offering, required this.onTap});
  final Map<String, dynamic> offering;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final provider = offering['provider'] as Map<String, dynamic>? ?? const {};
    final category = offering['category'] as Map<String, dynamic>? ?? const {};
    final pricePaise = (offering['pricePaise'] as num?)?.toInt() ?? 0;
    final price = pricePaise / 100;
    final ratingAverage = (provider['ratingAverage'] as num?)?.toDouble();
    final ratingCount = (provider['ratingCount'] as num?)?.toInt() ?? 0;
    final completedJobs = (provider['completedJobs'] as num?)?.toInt() ?? 0;
    return Card(
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.all(14),
        leading: const CircleAvatar(child: Icon(Icons.handyman_rounded)),
        title: Text(offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${category['name'] ?? offering['categoryName'] ?? 'Service'} · ${provider['businessName'] ?? offering['providerName'] ?? 'Verified provider'}'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 10,
                runSpacing: 6,
                children: [
                  if (ratingAverage != null && ratingCount > 0)
                    _TrustSignal(icon: Icons.star_rounded, text: '${ratingAverage.toStringAsFixed(1)} · $ratingCount rating${ratingCount == 1 ? '' : 's'}'),
                  if (completedJobs > 0)
                    _TrustSignal(icon: Icons.task_alt_rounded, text: '$completedJobs completed'),
                  const _TrustSignal(icon: Icons.verified_rounded, text: 'Verified'),
                ],
              ),
            ],
          ),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('₹${price.toStringAsFixed(price.truncateToDouble() == price ? 0 : 2)}', style: const TextStyle(fontWeight: FontWeight.w900)),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    );
  }
}

class _TrustSignal extends StatelessWidget {
  const _TrustSignal({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15),
        const SizedBox(width: 3),
        Text(text, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
