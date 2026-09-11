import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../widgets/consumer_booking_post_service_panel.dart';

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

  Future<void> _rateService(String bookingId) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.72,
        minChildSize: 0.45,
        maxChildSize: 0.95,
        builder: (context, scrollController) => ListView(
          controller: scrollController,
          padding: EdgeInsets.fromLTRB(
            16,
            8,
            16,
            24 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Rate completed service',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(sheetContext).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            ConsumerBookingPostServicePanel(
              apiClient: widget.apiClient,
              bookingId: bookingId,
            ),
          ],
        ),
      ),
    );
    if (mounted) await _load();
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
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      const Icon(Icons.cloud_off_rounded),
                      const SizedBox(height: 8),
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                ),
              )
            else if (_history.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No completed external services yet.')))
            else
              for (final item in _history) ...[
                _HistoryCard(
                  item: item,
                  fallbackOffering: widget.offeringsById[item['offeringId']?.toString()],
                  onRebook: widget.onRebook,
                  onRate: () => _rateService(item['id'].toString()),
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
  const _HistoryCard({
    required this.item,
    required this.fallbackOffering,
    required this.onRebook,
    required this.onRate,
  });
  final Map<String, dynamic> item;
  final Map<String, dynamic>? fallbackOffering;
  final Future<void> Function(Map<String, dynamic> offering) onRebook;
  final Future<void> Function() onRate;

  @override
  Widget build(BuildContext context) {
    final rawCurrentOffering = item['currentOffering'];
    final currentOffering = rawCurrentOffering is Map
        ? Map<String, dynamic>.from(rawCurrentOffering)
        : fallbackOffering;
    final canRebook = item['canRebook'] == true && currentOffering != null;
    final paise = (item['servicePricePaise'] as num?)?.toInt();
    final rating = (item['ratingStars'] as num?)?.toInt();
    final ratingComment = item['ratingComment']?.toString().trim();
    final completedAt = DateTime.tryParse(item['completedAt']?.toString() ?? '');
    final dateText = completedAt == null
        ? null
        : '${completedAt.day.toString().padLeft(2, '0')}/${completedAt.month.toString().padLeft(2, '0')}/${completedAt.year}';
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
            if (rating != null) ...[
              const SizedBox(height: 10),
              Semantics(
                label: 'Your rating $rating out of 5',
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var index = 1; index <= 5; index++)
                      Icon(
                        index <= rating ? Icons.star_rounded : Icons.star_border_rounded,
                        size: 18,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    const SizedBox(width: 8),
                    Text('Your rating', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
              if (ratingComment != null && ratingComment.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('“$ratingComment”', style: Theme.of(context).textTheme.bodyMedium),
              ],
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                if (rating == null)
                  OutlinedButton.icon(
                    onPressed: onRate,
                    icon: const Icon(Icons.star_outline_rounded),
                    label: const Text('Rate service'),
                  ),
                if (canRebook)
                  FilledButton.icon(
                    onPressed: () => onRebook(currentOffering),
                    icon: const Icon(Icons.replay_rounded),
                    label: const Text('Rebook'),
                  ),
              ],
            ),
            if (!canRebook) ...[
              const SizedBox(height: 8),
              Text('This service is not currently available for rebooking.', style: Theme.of(context).textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}
