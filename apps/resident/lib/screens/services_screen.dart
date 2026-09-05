import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../data/service_booking_actions.dart';
import '../widgets/app_state_card.dart';

class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  bool _busy = false;
  String _query = '';
  String? _categoryId;
  final _searchController = TextEditingController();

  ResidentDataController get controller => widget.controller;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get _visibleOfferings {
    final query = _query.trim().toLowerCase();
    return controller.serviceOfferings.where((offering) {
      if (_categoryId != null && offering['categoryId']?.toString() != _categoryId) return false;
      if (query.isEmpty) return true;
      final provider = offering['provider'];
      final category = offering['category'];
      final haystack = [
        offering['name'],
        offering['description'],
        provider is Map ? provider['businessName'] : null,
        category is Map ? category['name'] : null,
      ].whereType<Object>().map((value) => value.toString().toLowerCase()).join(' ');
      return haystack.contains(query);
    }).toList(growable: false);
  }

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
            Text('Provider: ${_providerName(offering)}'),
            const SizedBox(height: 6),
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
    if (confirmed != true || !mounted) {
      notes.dispose();
      return;
    }

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
      _message('Booking request submitted. The provider must confirm it before gate access is created.');
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
    if (submitted != true || !mounted) {
      comment.dispose();
      return;
    }
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
    final visibleOfferings = _visibleOfferings;
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
            TextField(
              controller: _searchController,
              onChanged: (value) => setState(() => _query = value),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: 'What do you need help with?',
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _query = '');
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
              ),
            ),
            const SizedBox(height: 24),
            if (controller.loading && controller.serviceCategories.isEmpty)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading home services…', loading: true)
            else if (controller.servicesError != null)
              AppStateCard(
                icon: Icons.error_outline_rounded,
                message: 'Services are unavailable for this society or could not be loaded.',
                actionLabel: 'Retry',
                onAction: _busy ? null : controller.load,
              )
            else ...[
              Text('Categories', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.serviceCategories.isEmpty)
                const AppStateCard(icon: Icons.category_outlined, message: 'No service categories are available yet.')
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('All'),
                      selected: _categoryId == null,
                      onSelected: (_) => setState(() => _categoryId = null),
                    ),
                    for (final category in controller.serviceCategories)
                      ChoiceChip(
                        label: Text(category['name']?.toString() ?? 'Service'),
                        selected: _categoryId == category['id']?.toString(),
                        onSelected: (_) => setState(() => _categoryId = category['id']?.toString()),
                      ),
                  ],
                ),
              const SizedBox(height: 24),
              Text('Available services', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.serviceOfferings.isEmpty)
                const AppStateCard(icon: Icons.home_repair_service_outlined, message: 'No approved provider offerings are available yet.')
              else if (visibleOfferings.isEmpty)
                const AppStateCard(icon: Icons.search_off_rounded, message: 'No services match your search or selected category.')
              else
                ...visibleOfferings.map((offering) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const CircleAvatar(child: Icon(Icons.home_repair_service_outlined)),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w800)),
                                    const SizedBox(height: 3),
                                    Text(_providerName(offering), style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                                    const SizedBox(height: 3),
                                    Text(offering['description']?.toString() ?? 'Verified service provider'),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 10),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(_price(offering['pricePaise']), style: const TextStyle(fontWeight: FontWeight.w800)),
                                  TextButton(onPressed: _busy ? null : () => _book(offering), child: const Text('Book')),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    )),
              const SizedBox(height: 24),
              Text('Your bookings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.bookings.isEmpty)
                const AppStateCard(icon: Icons.event_available_outlined, message: 'You have no service bookings yet.')
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
                            Text(_providerName(booking), style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 4),
                            Text('Scheduled ${_dateTime(booking['scheduledFrom'])}'),
                            const SizedBox(height: 6),
                            Text(_statusMessage(booking)),
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
            if (_busy) ...[
              const SizedBox(height: 16),
              const AppStateCard(icon: Icons.sync_rounded, message: 'Updating your service request…', loading: true),
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

  static String _providerName(Map<String, dynamic> item) {
    final provider = item['provider'];
    if (provider is Map && provider['businessName'] != null) return provider['businessName'].toString();
    return 'Verified provider';
  }

  static String _statusMessage(Map<String, dynamic> booking) {
    final status = booking['status']?.toString() ?? 'REQUESTED';
    switch (status) {
      case 'REQUESTED':
        return 'Waiting for the provider to confirm this request. No gate pass has been created yet.';
      case 'CONFIRMED':
        final access = booking['accessRequest'];
        final accessStatus = access is Map ? access['status']?.toString().replaceAll('_', ' ') : null;
        return accessStatus == null
            ? 'Provider confirmed. Gate access is linked to this booking.'
            : 'Provider confirmed. Linked gate access: $accessStatus.';
      case 'IN_PROGRESS':
        return 'Service is in progress.';
      case 'COMPLETED':
        return booking['rating'] == null ? 'Service completed. You can now rate the provider.' : 'Service completed and rated.';
      case 'CANCELLED':
        return 'This booking was cancelled. Any linked gate access is no longer valid.';
      default:
        return status.replaceAll('_', ' ');
    }
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
