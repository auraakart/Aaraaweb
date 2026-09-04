import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../data/service_booking_actions.dart';

class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  bool _busy = false;

  ResidentDataController get controller => widget.controller;

  Future<void> _book(Map<String, dynamic> offering) async {
    final unitId = controller.primaryUnitId;
    if (unitId == null) {
      _message('No active household unit is available for booking.');
      return;
    }
    final offeringId = offering['id']?.toString();
    if (offeringId == null || offeringId.isEmpty) return;

    final now = DateTime.now();
    final initialDate = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
    final date = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 180)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 10, minute: 0));
    if (time == null || !mounted) return;

    final notes = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Book ${offering['name']?.toString() ?? 'service'}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Scheduled: ${date.day}/${date.month}/${date.year} · ${time.format(context)}'),
            const SizedBox(height: 12),
            TextField(
              controller: notes,
              maxLength: 300,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Notes for the provider (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Request booking')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final start = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final duration = (offering['durationMinutes'] as num?)?.toInt() ?? 60;
    final end = start.add(Duration(minutes: duration.clamp(15, 480)));
    await _run(() async {
      await controller.repository.createServiceBooking(
        unitId: unitId,
        offeringId: offeringId,
        scheduledFrom: start,
        scheduledUntil: end,
        notes: notes.text,
      );
      await controller.load();
      _message('Booking request submitted.');
    });
    notes.dispose();
  }

  Future<void> _cancel(Map<String, dynamic> booking) async {
    final id = booking['id']?.toString();
    if (id == null || id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel booking?'),
        content: const Text('This will cancel the service request and any linked provider gate access.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep booking')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel booking')),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(() async {
      await controller.repository.cancelServiceBooking(id);
      await controller.load();
      _message('Booking cancelled.');
    });
  }

  Future<void> _rate(Map<String, dynamic> booking) async {
    final id = booking['id']?.toString();
    if (id == null || id.isEmpty) return;
    var score = 5;
    final comment = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Rate this service'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                children: [
                  for (var value = 1; value <= 5; value++)
                    IconButton(
                      tooltip: '$value star${value == 1 ? '' : 's'}',
                      onPressed: () => setDialogState(() => score = value),
                      icon: Icon(value <= score ? Icons.star_rounded : Icons.star_border_rounded),
                    ),
                ],
              ),
              TextField(
                controller: comment,
                maxLength: 500,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Feedback (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Later')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Submit rating')),
          ],
        ),
      ),
    );
    if (submitted != true || !mounted) return;
    await _run(() async {
      await controller.repository.rateServiceBooking(id, score: score, comment: comment.text);
      await controller.load();
      _message('Thanks for your feedback.');
    });
    comment.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (error) {
      if (mounted) _message(error.toString().replaceFirst('ApiException', 'Request failed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _message(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Text('Home services', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('Verified professionals. Gate access handled by Aaraagate.', style: theme.textTheme.bodyLarge),
            const SizedBox(height: 18),
            const TextField(decoration: InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'What do you need help with?')),
            const SizedBox(height: 24),
            if (controller.loading && controller.serviceCategories.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (controller.servicesError != null)
              Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [const Icon(Icons.lock_outline_rounded, size: 34), const SizedBox(height: 10), const Text('Services are unavailable for this society or could not be loaded.', textAlign: TextAlign.center), const SizedBox(height: 8), TextButton(onPressed: _busy ? null : controller.load, child: const Text('Retry'))])))
            else ...[
              Text('Categories', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.serviceCategories.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No service categories are available yet.')))
              else
                Wrap(spacing: 8, runSpacing: 8, children: [for (final category in controller.serviceCategories) Chip(label: Text(category['name']?.toString() ?? 'Service'))]),
              const SizedBox(height: 24),
              Text('Available services', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.serviceOfferings.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No approved provider offerings are available yet.')))
              else
                ...controller.serviceOfferings.map((offering) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(16),
                          leading: const CircleAvatar(child: Icon(Icons.home_repair_service_outlined)),
                          title: Text(offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text(offering['description']?.toString() ?? 'Verified service provider'),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(_price(offering['pricePaise']), style: const TextStyle(fontWeight: FontWeight.w800)),
                              TextButton(onPressed: _busy ? null : () => _book(offering), child: const Text('Book')),
                            ],
                          ),
                        ),
                      ),
                    )),
              const SizedBox(height: 24),
              Text('Your bookings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.bookings.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('You have no service bookings yet.')))
              else
                ...controller.bookings.map((booking) {
                  final status = booking['status']?.toString() ?? 'REQUESTED';
                  final cancellable = status == 'REQUESTED' || status == 'CONFIRMED';
                  final rateable = status == 'COMPLETED' && booking['rating'] == null;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [Expanded(child: Text(_bookingTitle(booking), style: const TextStyle(fontWeight: FontWeight.w800))), Chip(label: Text(status.replaceAll('_', ' ')))]),
                            const SizedBox(height: 4),
                            Text('Scheduled ${_dateTime(booking['scheduledFrom'])}'),
                            if (status == 'CONFIRMED') const Padding(padding: EdgeInsets.only(top: 4), child: Text('Provider gate access is linked to this confirmed booking.')),
                            if (cancellable || rateable) ...[
                              const SizedBox(height: 10),
                              Wrap(spacing: 8, children: [
                                if (cancellable) OutlinedButton(onPressed: _busy ? null : () => _cancel(booking), child: const Text('Cancel')),
                                if (rateable) FilledButton(onPressed: _busy ? null : () => _rate(booking), child: const Text('Rate service')),
                              ]),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                }),
            ],
          ],
        ),
      ),
    );
  }

  static String _bookingTitle(Map<String, dynamic> booking) {
    final offering = booking['offering'];
    if (offering is Map && offering['name'] != null) return offering['name'].toString();
    return 'Service booking';
  }

  static String _dateTime(dynamic raw) {
    final value = DateTime.tryParse(raw?.toString() ?? '');
    if (value == null) return raw?.toString() ?? '';
    final local = value.toLocal();
    final minute = local.minute.toString().padLeft(2, '0');
    return '${local.day}/${local.month}/${local.year} · ${local.hour}:$minute';
  }

  static String _price(dynamic paise) {
    final amount = paise is num ? paise / 100 : 0;
    return '₹${amount.toStringAsFixed(amount.truncateToDouble() == amount ? 0 : 2)}';
  }
}
