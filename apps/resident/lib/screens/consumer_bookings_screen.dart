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
            ? const ListView(children: [SizedBox(height: 180), Center(child: CircularProgressIndicator())])
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
                          onCancel: () => _cancel(_bookings[index]),
                        ),
                      ),
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking, required this.cancelling, required this.onCancel});

  final Map<String, dynamic> booking;
  final bool cancelling;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final status = booking['status']?.toString() ?? 'REQUESTED';
    final scheduled = DateTime.tryParse(booking['scheduledFrom']?.toString() ?? '')?.toLocal();
    final pricePaise = booking['servicePricePaise'] as int? ?? 0;
    final cancellable = status == 'REQUESTED' || status == 'CONFIRMED';
    final theme = Theme.of(context);

    return Card(
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
            if (cancellable) ...[
              const SizedBox(height: 14),
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
