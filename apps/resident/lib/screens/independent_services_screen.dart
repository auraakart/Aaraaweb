import 'package:flutter/material.dart';
import '../data/api_client.dart';
import 'consumer_booking_screen.dart';

class IndependentServicesScreen extends StatefulWidget {
  const IndependentServicesScreen({
    super.key,
    required this.apiClient,
    required this.onSignOut,
  });

  final ApiClient apiClient;
  final Future<void> Function() onSignOut;

  @override
  State<IndependentServicesScreen> createState() => _IndependentServicesScreenState();
}

class _IndependentServicesScreenState extends State<IndependentServicesScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _categories = const [];
  List<Map<String, dynamic>> _offerings = const [];
  String? _selectedCategoryId;

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
      final offeringsPath = categoryId == null
          ? '/api/v1/consumer/services/offerings'
          : '/api/v1/consumer/services/offerings?categoryId=$categoryId';
      final offeringsRaw = await widget.apiClient.get(offeringsPath);
      if (!mounted) return;
      setState(() {
        _categories = (categoriesRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _offerings = (offeringsRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openBooking(Map<String, dynamic> offering) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ConsumerBookingScreen(apiClient: widget.apiClient, offering: offering),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('External Services'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: () => widget.onSignOut(),
            icon: const Icon(Icons.logout_rounded),
          ),
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
                      child: const Icon(Icons.home_rounded),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Independent Home', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                          const SizedBox(height: 4),
                          Text(
                            'Only Aaraagate external services are available in this mode. Society features are intentionally hidden.',
                            style: theme.textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
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
                    child: ChoiceChip(
                      label: const Text('All'),
                      selected: _selectedCategoryId == null,
                      onSelected: (_) => _load(),
                    ),
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
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 36),
                child: Center(child: CircularProgressIndicator()),
              )
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
            else if (_offerings.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(18),
                  child: Text('No verified external-service offerings are available in this category yet.'),
                ),
              )
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
    final pricePaise = offering['pricePaise'] as int? ?? 0;
    final price = pricePaise / 100;
    return Card(
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.all(14),
        leading: const CircleAvatar(child: Icon(Icons.handyman_rounded)),
        title: Text(offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('${category['name'] ?? 'Service'} · ${provider['businessName'] ?? 'Verified provider'}'),
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
