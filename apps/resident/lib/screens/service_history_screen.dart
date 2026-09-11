import 'package:flutter/material.dart';
import '../data/api_client.dart';

class ServiceHistoryScreen extends StatefulWidget {
  const ServiceHistoryScreen({
    super.key,
    required this.apiClient,
    required this.location,
    required this.offeringsById,
    required this.onRebook,
  });

  final ApiClient apiClient;
  final Map<String, dynamic> location;
  final Map<String, Map<String, dynamic>> offeringsById;
  final Future<void> Function(Map<String, dynamic> offering) onRebook;

  @override
  State<ServiceHistoryScreen> createState() => _ServiceHistoryScreenState();
}

class _ServiceHistoryScreenState extends State<ServiceHistoryScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _history = const [];

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
      final params = Uri(queryParameters: {
        'locationType': widget.location['type'].toString(),
        'locationId': widget.location['id'].toString(),
      }).query;
      final raw = await widget.apiClient.get('/api/v1/consumer/services/history?$params');
      if (!mounted) return;
      setState(() => _history = (raw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList());
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Service history')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(widget.location['label']?.toString() ?? 'Selected property', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text('Completed external services for this property.', style: theme.textTheme.bodyMedium),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(_error!)))
            else if (_history.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No completed external services yet.')))
            else
              for (final item in _history) ...[
                _HistoryCard(
                  item: item,
                  offering: widget.offeringsById[item['offeringId']?.toString()],
                  onRebook: widget.onRebook,
                ),
                const SizedBox(height: 10),
              ],
          ],
        ),
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.item, required this.offering, required this.onRebook});
  final Map<String, dynamic> item;
  final Map<String, dynamic>? offering;
  final Future<void> Function(Map<String, dynamic> offering) onRebook;

  @override
  Widget build(BuildContext context) {
    final canRebook = item['canRebook'] == true && offering != null;
    final paise = (item['servicePricePaise'] as num?)?.toInt();
    final completedAt = DateTime.tryParse(item['completedAt']?.toString() ?? '');
    final dateText = completedAt == null ? null : '${completedAt.day.toString().padLeft(2, '0')}/${completedAt.month.toString().padLeft(2, '0')}/${completedAt.year}';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item['offeringName']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(item['providerName']?.toString() ?? 'Provider'),
            if (dateText != null || paise != null) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 12,
                children: [
                  if (dateText != null) Text(dateText),
                  if (paise != null) Text('₹${(paise / 100).toStringAsFixed(paise % 100 == 0 ? 0 : 2)}'),
                ],
              ),
            ],
            const SizedBox(height: 12),
            if (canRebook)
              FilledButton.icon(
                onPressed: () => onRebook(offering!),
                icon: const Icon(Icons.replay_rounded),
                label: const Text('Rebook'),
              )
            else
              Text('This service is not currently available for rebooking.', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
