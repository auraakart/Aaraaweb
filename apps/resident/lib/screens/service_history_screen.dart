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
  final Set<String> _rebooking = <String>{};

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

  Future<void> _rebookService(Map<String, dynamic> item, Map<String, dynamic> offering) async {
    final bookingId = item['id']?.toString();
    if (bookingId == null || bookingId.isEmpty || !mounted) return;

    final now = DateTime.now();
    final initialDate = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
    final selectedDate = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1, now.month, now.day),
      initialDate: initialDate,
      helpText: 'Choose service date',
    );
    if (selectedDate == null || !mounted) return;

    final selectedTime = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 10, minute: 0),
      helpText: 'Choose service time',
    );
    if (selectedTime == null || !mounted) return;

    final durationMinutes = (offering['durationMinutes'] as num?)?.toInt() ?? 60;
    final scheduledFrom = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
      selectedTime.hour,
      selectedTime.minute,
    );
    final scheduledUntil = scheduledFrom.add(Duration(minutes: durationMinutes > 0 ? durationMinutes : 60));
    if (!scheduledFrom.isAfter(DateTime.now())) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose a future date and time.')));
      return;
    }

    setState(() => _rebooking.add(bookingId));
    try {
      await widget.apiClient.post('/api/v1/consumer/services/history/$bookingId/rebook', {
        'scheduledFrom': scheduledFrom.toUtc().toIso8601String(),
        'scheduledUntil': scheduledUntil.toUtc().toIso8601String(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Service rebooked using current availability and pricing.')));
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _rebooking.remove(bookingId));
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
                  rebooking: _rebooking.contains(item['id']?.toString()),
                  onRebook: (offering) => _rebookService(item, offering),
                  onLegacyRebook: widget.onRebook,
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
    required this.rebooking,
    required this.onRebook,
    required this.onLegacyRebook,
    required this.onRate,
  });
  final Map<String, dynamic> item;
  final Map<String, dynamic>? fallbackOffering;
  final bool rebooking;
  final Future<void> Function(Map<String, dynamic> offering) onRebook;
  final Future<void> Function(Map<String, dynamic> offering) onLegacyRebook;
  final Future<void> Function() onRate;

  @override
  Widget build(BuildContext context) {
    final rawCurrentOffering = item['currentOffering'];
    final currentOffering = rawCurrentOffering is Map
        ? Map<String, dynamic>.from(rawCurrentOffering)
        : fallbackOffering;
    final canRebook = item['canRebook'] == true && currentOffering != null;
    final bookingId = item['id']?.toString();
    final canSafeRebook = canRebook && bookingId != null && bookingId.isNotEmpty;
    final paise = (item['servicePricePaise'] as num?)?.toInt();
    final rating = (item['ratingStars'] as num?)?.toInt();
    final ratingComment = item['ratingComment']?.toString().trim();
    final warrantyDays = (item['warrantyDays'] as num?)?.toInt();
    final revisitPolicy = item['revisitPolicy']?.toString().trim();
    final warrantyUntil = DateTime.tryParse(item['warrantyUntil']?.toString() ?? '')?.toLocal();
    final warrantyActive = item['warrantyActive'] == true;
    final hasWarrantyTerms = warrantyDays != null || (revisitPolicy != null && revisitPolicy.isNotEmpty);
    final completedAt = DateTime.tryParse(item['completedAt']?.toString() ?? '');
    final dateText = completedAt == null
        ? null
        : '${completedAt.day.toString().padLeft(2, '0')}/${completedAt.month.toString().padLeft(2, '0')}/${completedAt.year}';
    final warrantyDateText = warrantyUntil == null
        ? null
        : '${warrantyUntil.day.toString().padLeft(2, '0')}/${warrantyUntil.month.toString().padLeft(2, '0')}/${warrantyUntil.year}';
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
            if (hasWarrantyTerms) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: warrantyActive
                      ? Theme.of(context).colorScheme.secondaryContainer
                      : Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(warrantyActive ? Icons.verified_user_rounded : Icons.history_toggle_off_rounded, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            warrantyActive
                                ? 'Warranty active${warrantyDateText == null ? '' : ' until $warrantyDateText'}'
                                : warrantyDateText == null
                                    ? 'Service warranty terms captured at completion'
                                    : 'Warranty expired on $warrantyDateText',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                    if (warrantyDays != null) ...[
                      const SizedBox(height: 6),
                      Text('$warrantyDays-day warranty captured when this service was completed.'),
                    ],
                    if (revisitPolicy != null && revisitPolicy.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(revisitPolicy),
                    ],
                  ],
                ),
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
                    onPressed: rebooking
                        ? null
                        : () => canSafeRebook ? onRebook(currentOffering) : onLegacyRebook(currentOffering),
                    icon: rebooking
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.replay_rounded),
                    label: Text(rebooking ? 'Rebooking…' : 'Rebook'),
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
