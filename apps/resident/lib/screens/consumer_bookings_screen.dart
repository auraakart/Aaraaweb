import 'package:flutter/material.dart';
import '../data/api_client.dart';

class ConsumerBookingsScreen extends StatefulWidget {
  const ConsumerBookingsScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  State<ConsumerBookingsScreen> createState() => _ConsumerBookingsScreenState();
}

class _ConsumerBookingsScreenState extends State<ConsumerBookingsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _bookings = const [];
  final Set<String> _cancelling = <String>{};

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
      final raw = await widget.apiClient.get('/api/v1/consumer/services/bookings');
      if (!mounted) return;
      setState(() {
        _bookings = (raw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openTimeline(Map<String, dynamic> booking) async {
    final id = booking['id']?.toString();
    if (id == null || id.isEmpty) return;
    try {
      final raw = await widget.apiClient.get('/api/v1/consumer/services/bookings/$id/events');
      if (!mounted) return;
      final events = (raw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (context) => _BookingTimelineSheet(booking: booking, events: events),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _cancel(Map<String, dynamic> booking) async {
    final id = booking['id']?.toString();
    if (id == null || id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel service request?'),
        content: Text('Cancel ${booking['offeringName'] ?? 'this service'}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep booking')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Cancel booking')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling.add(id));
    try {
      await widget.apiClient.post('/api/v1/consumer/services/bookings/$id/cancel');
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Service request cancelled.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _cancelling.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Bookings')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? ListView(children: const [SizedBox(height: 180), Center(child: CircularProgressIndicator())])
            : _error != null
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            children: [
                              const Icon(Icons.cloud_off_rounded),
                              const SizedBox(height: 10),
                              Text(_error!, textAlign: TextAlign.center),
                              const SizedBox(height: 12),
                              FilledButton(onPressed: _load, child: const Text('Retry')),
                            ],
                          ),
                        ),
                      ),
                    ],
                  )
                : _bookings.isEmpty
                    ? ListView(
                        padding: const EdgeInsets.all(16),
                        children: const [
                          SizedBox(height: 80),
                          Icon(Icons.event_note_rounded, size: 48),
                          SizedBox(height: 12),
                          Text('No service bookings yet.', textAlign: TextAlign.center),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _bookings.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, index) => _BookingCard(
                          booking: _bookings[index],
                          cancelling: _cancelling.contains(_bookings[index]['id']?.toString()),
                          onTap: () => _openTimeline(_bookings[index]),
                          onCancel: () => _cancel(_bookings[index]),
                        ),
                      ),
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking, required this.cancelling, required this.onTap, required this.onCancel});

  final Map<String, dynamic> booking;
  final bool cancelling;
  final VoidCallback onTap;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final status = booking['status']?.toString() ?? 'REQUESTED';
    final scheduled = DateTime.tryParse(booking['scheduledFrom']?.toString() ?? '')?.toLocal();
    final pricePaise = booking['servicePricePaise'] as int? ?? 0;
    final cancellable = status == 'REQUESTED' || status == 'CONFIRMED';
    final theme = Theme.of(context);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      booking['offeringName']?.toString() ?? 'Service',
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
                    ),
                  ),
                  _StatusChip(status: status),
                ],
              ),
              const SizedBox(height: 6),
              Text(booking['providerName']?.toString() ?? 'Verified provider'),
              const SizedBox(height: 12),
              if (scheduled != null)
                _InfoRow(
                  icon: Icons.schedule_rounded,
                  text: '${MaterialLocalizations.of(context).formatMediumDate(scheduled)} · ${TimeOfDay.fromDateTime(scheduled).format(context)}',
                ),
              const SizedBox(height: 6),
              _InfoRow(
                icon: Icons.home_rounded,
                text: '${booking['homeLabel'] ?? 'Home'} · ${booking['addressLine1'] ?? ''}, ${booking['locality'] ?? ''}, ${booking['city'] ?? ''}',
              ),
              const SizedBox(height: 6),
              _InfoRow(icon: Icons.currency_rupee_rounded, text: (pricePaise / 100).toStringAsFixed(pricePaise % 100 == 0 ? 0 : 2)),
              const SizedBox(height: 10),
              Text('Tap for status timeline', style: theme.textTheme.bodySmall),
              if (cancellable) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: cancelling ? null : onCancel,
                    icon: cancelling
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.cancel_outlined),
                    label: const Text('Cancel booking'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _BookingTimelineSheet extends StatelessWidget {
  const _BookingTimelineSheet({required this.booking, required this.events});

  final Map<String, dynamic> booking;
  final List<Map<String, dynamic>> events;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final currentStatus = booking['status']?.toString() ?? 'REQUESTED';
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(booking['offeringName']?.toString() ?? 'Service', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text('Current status: ${currentStatus.replaceAll('_', ' ')}'),
            const SizedBox(height: 18),
            Text('Status timeline', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            if (events.isEmpty)
              const Text('Your service request is waiting for its first fulfilment update.')
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: events.length,
                  separatorBuilder: (_, __) => const Divider(height: 20),
                  itemBuilder: (context, index) {
                    final event = events[index];
                    final occurredAt = DateTime.tryParse(event['occurredAt']?.toString() ?? '')?.toLocal();
                    final toStatus = event['toStatus']?.toString() ?? event['action']?.toString() ?? 'UPDATED';
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.check_circle_outline_rounded),
                      title: Text(toStatus.replaceAll('_', ' '), style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text([
                        if (occurredAt != null)
                          '${MaterialLocalizations.of(context).formatMediumDate(occurredAt)} · ${TimeOfDay.fromDateTime(occurredAt).format(context)}',
                        if ((event['note']?.toString() ?? '').isNotEmpty) event['note'].toString(),
                      ].join('\n')),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 8),
        Expanded(child: Text(text)),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    return Chip(
      visualDensity: VisualDensity.compact,
      label: Text(status.replaceAll('_', ' '), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
    );
  }
}
