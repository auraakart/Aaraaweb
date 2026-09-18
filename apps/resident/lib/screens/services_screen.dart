import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../data/service_booking_actions.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';
import '../widgets/service_booking_timeline_sheet.dart';

class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServiceBookingInput {
  const _ServiceBookingInput({required this.notes});
  final String notes;
}

class _ServiceBookingDialog extends StatefulWidget {
  const _ServiceBookingDialog({required this.serviceName, required this.providerName, required this.price, required this.scheduled});

  final String serviceName;
  final String providerName;
  final String price;
  final String scheduled;

  @override
  State<_ServiceBookingDialog> createState() => _ServiceBookingDialogState();
}

class _ServiceBookingDialogState extends State<_ServiceBookingDialog> {
  final _notes = TextEditingController();

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: Text('Book ${widget.serviceName}'),
      scrollable: true,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PremiumSurface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.providerName, style: theme.textTheme.titleMedium),
                const SizedBox(height: AaraagateTokens.space2),
                Wrap(
                  spacing: AaraagateTokens.space2,
                  runSpacing: AaraagateTokens.space2,
                  children: [
                    AaraagateStatusPill(label: widget.price, tone: AaraagateStatusTone.neutral),
                    AaraagateStatusPill(label: widget.scheduled, tone: AaraagateStatusTone.info),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AaraagateTokens.space4),
          TextField(
            controller: _notes,
            maxLength: 300,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Notes for the provider (optional)'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, _ServiceBookingInput(notes: _notes.text)), child: const Text('Request booking')),
      ],
    );
  }
}

class _ServiceRatingInput {
  const _ServiceRatingInput({required this.score, required this.comment});
  final int score;
  final String comment;
}

class _ServiceRatingDialog extends StatefulWidget {
  const _ServiceRatingDialog();

  @override
  State<_ServiceRatingDialog> createState() => _ServiceRatingDialogState();
}

class _ServiceRatingDialogState extends State<_ServiceRatingDialog> {
  final _comment = TextEditingController();
  int _score = 5;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Rate this service'),
        scrollable: true,
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Wrap(
              children: [
                for (var value = 1; value <= 5; value++)
                  IconButton(
                    tooltip: '$value star${value == 1 ? '' : 's'}',
                    onPressed: () => setState(() => _score = value),
                    icon: Icon(value <= _score ? Icons.star_rounded : Icons.star_border_rounded),
                  ),
              ],
            ),
            TextField(
              controller: _comment,
              maxLength: 500,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Feedback (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Later')),
          FilledButton(onPressed: () => Navigator.pop(context, _ServiceRatingInput(score: _score, comment: _comment.text)), child: const Text('Submit rating')),
        ],
      );
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
        provider is Map ? provider['description'] : null,
        category is Map ? category['name'] : null,
      ].whereType<Object>().map((value) => value.toString().toLowerCase()).join(' ');
      return haystack.contains(query);
    }).toList(growable: false);
  }

  List<List<Map<String, dynamic>>> get _serviceGroups {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final offering in _visibleOfferings) {
      final categoryId = offering['categoryId']?.toString() ?? '';
      final name = offering['name']?.toString().trim().toLowerCase() ?? 'service';
      groups.putIfAbsent('$categoryId::$name', () => <Map<String, dynamic>>[]).add(offering);
    }
    return groups.values.toList(growable: false);
  }

  Future<void> _chooseProvider(List<Map<String, dynamic>> offerings) async {
    if (offerings.isEmpty) return;
    final selected = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) {
        final theme = Theme.of(context);
        final scheme = theme.colorScheme;
        final serviceName = offerings.first['name']?.toString() ?? 'Service';
        final sorted = [...offerings]..sort((a, b) => _pricePaise(a).compareTo(_pricePaise(b)));
        return FractionallySizedBox(
          heightFactor: 0.86,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space1, AaraagateTokens.pageGutter, AaraagateTokens.space5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const PremiumSectionHeader(title: 'Choose a provider'),
                const SizedBox(height: AaraagateTokens.space1),
                Text('$serviceName · ${sorted.length} verified provider${sorted.length == 1 ? '' : 's'}', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                const SizedBox(height: AaraagateTokens.space4),
                Expanded(
                  child: ListView.separated(
                    itemCount: sorted.length,
                    separatorBuilder: (_, __) => const SizedBox(height: AaraagateTokens.space3),
                    itemBuilder: (context, index) {
                      final offering = sorted[index];
                      final provider = offering['provider'];
                      final providerDescription = provider is Map ? provider['description']?.toString() : null;
                      final ratingAverage = provider is Map ? (provider['ratingAverage'] as num?)?.toDouble() : null;
                      final ratingCount = provider is Map ? (provider['ratingCount'] as num?)?.toInt() ?? 0 : 0;
                      final completedJobs = provider is Map ? (provider['completedJobs'] as num?)?.toInt() ?? 0 : 0;
                      final duration = (offering['durationMinutes'] as num?)?.toInt();
                      return PremiumSurface(
                        elevated: true,
                        padding: const EdgeInsets.all(AaraagateTokens.space4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: AaraagateTokens.iconContainer,
                                  height: AaraagateTokens.iconContainer,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                                  child: Text(_providerInitial(offering), style: theme.textTheme.titleMedium?.copyWith(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w800)),
                                ),
                                const SizedBox(width: AaraagateTokens.space3),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(_providerName(offering), style: theme.textTheme.titleMedium),
                                      const SizedBox(height: AaraagateTokens.space1),
                                      Row(
                                        children: [
                                          Icon(Icons.verified_rounded, size: 17, color: scheme.primary),
                                          const SizedBox(width: AaraagateTokens.space1),
                                          Text('Verified provider', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: AaraagateTokens.space2),
                                Text(_price(offering['pricePaise']), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                              ],
                            ),
                            if ((providerDescription ?? '').trim().isNotEmpty) ...[
                              const SizedBox(height: AaraagateTokens.space3),
                              Text(providerDescription!, style: theme.textTheme.bodyMedium),
                            ],
                            if ((offering['description']?.toString() ?? '').trim().isNotEmpty) ...[
                              const SizedBox(height: AaraagateTokens.space2),
                              Text(offering['description'].toString(), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                            ],
                            const SizedBox(height: AaraagateTokens.space3),
                            Wrap(
                              spacing: AaraagateTokens.space2,
                              runSpacing: AaraagateTokens.space2,
                              children: [
                                if (ratingAverage != null && ratingCount > 0)
                                  AaraagateStatusPill(label: '${ratingAverage.toStringAsFixed(1)} ★ · $ratingCount rating${ratingCount == 1 ? '' : 's'}', tone: AaraagateStatusTone.info),
                                if (completedJobs > 0)
                                  AaraagateStatusPill(label: '$completedJobs completed job${completedJobs == 1 ? '' : 's'}', tone: AaraagateStatusTone.neutral),
                                if (duration != null) AaraagateStatusPill(label: 'Approx. $duration min', tone: AaraagateStatusTone.neutral),
                                const AaraagateStatusPill(label: 'Society approved', tone: AaraagateStatusTone.success),
                              ],
                            ),
                            const SizedBox(height: AaraagateTokens.space4),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: () => Navigator.pop(context, offering),
                                child: Text('Choose ${_providerName(offering)}'),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (selected != null && mounted) await _book(selected);
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

    final input = await showDialog<_ServiceBookingInput>(
      context: context,
      builder: (_) => _ServiceBookingDialog(
        serviceName: offering['name']?.toString() ?? 'service',
        providerName: _providerName(offering),
        price: _price(offering['pricePaise']),
        scheduled: '${date.day}/${date.month}/${date.year} · ${time.format(context)}',
      ),
    );
    if (input == null || !mounted) return;

    final start = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final duration = (offering['durationMinutes'] as num?)?.toInt() ?? 60;
    final end = start.add(Duration(minutes: duration.clamp(15, 480)));
    await _run(() async {
      await controller.repository.createServiceBooking(
        unitId: unitId,
        offeringId: offeringId,
        scheduledFrom: start,
        scheduledUntil: end,
        notes: input.notes,
      );
      await controller.load();
      _message('Booking request submitted. The provider must confirm it before gate access is created.');
    });
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
    final input = await showDialog<_ServiceRatingInput>(
      context: context,
      builder: (_) => const _ServiceRatingDialog(),
    );
    if (input == null || !mounted) return;
    await _run(() async {
      await controller.repository.rateServiceBooking(id, score: input.score, comment: input.comment);
      await controller.load();
      _message('Thanks for your feedback.');
    });
  }

  Future<void> _showTimeline(Map<String, dynamic> booking) async {
    final id = booking['id']?.toString();
    if (id == null || id.isEmpty) return;
    Map<String, dynamic>? timeline;
    await _run(() async {
      timeline = await controller.repository.serviceBookingTimeline(id);
    });
    if (!mounted || timeline == null) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => ServiceBookingTimelineSheet(timeline: timeline!),
    );
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
    final scheme = theme.colorScheme;
    final groups = _serviceGroups;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space4, AaraagateTokens.pageGutter, AaraagateTokens.space8),
          children: [
            Text('Home services', style: theme.textTheme.headlineMedium),
            const SizedBox(height: AaraagateTokens.space2),
            Text('Compare verified professionals and choose who works for you.', style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant)),
            const SizedBox(height: AaraagateTokens.space5),
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
            const SizedBox(height: AaraagateTokens.space6),
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
              const PremiumSectionHeader(title: 'Categories'),
              const SizedBox(height: AaraagateTokens.space3),
              if (controller.serviceCategories.isEmpty)
                const AppStateCard(icon: Icons.category_outlined, message: 'No service categories are available yet.')
              else
                Wrap(
                  spacing: AaraagateTokens.space2,
                  runSpacing: AaraagateTokens.space2,
                  children: [
                    ChoiceChip(label: const Text('All'), selected: _categoryId == null, onSelected: (_) => setState(() => _categoryId = null)),
                    for (final category in controller.serviceCategories)
                      ChoiceChip(
                        label: Text(category['name']?.toString() ?? 'Service'),
                        selected: _categoryId == category['id']?.toString(),
                        onSelected: (_) => setState(() => _categoryId = category['id']?.toString()),
                      ),
                  ],
                ),
              const SizedBox(height: AaraagateTokens.space6),
              PremiumSectionHeader(
                title: 'Available services',
                supportingText: groups.isEmpty ? 'Browse society-approved providers for the selected property.' : '${groups.length} service${groups.length == 1 ? '' : 's'} match your current filters.',
              ),
              const SizedBox(height: AaraagateTokens.space3),
              if (controller.serviceOfferings.isEmpty)
                const AppStateCard(icon: Icons.home_repair_service_outlined, message: 'No approved provider offerings are available yet.')
              else if (groups.isEmpty)
                const AppStateCard(icon: Icons.search_off_rounded, message: 'No services match your search or selected category.')
              else
                ...groups.map((offerings) {
                  final first = offerings.first;
                  final minPrice = offerings.map(_pricePaise).reduce((a, b) => a < b ? a : b);
                  final count = offerings.length;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AaraagateTokens.space3),
                    child: PremiumSurface(
                      onTap: _busy ? null : () => _chooseProvider(offerings),
                      semanticLabel: '${first['name']?.toString() ?? 'Service'}, $count verified provider${count == 1 ? '' : 's'}, from ${_price(minPrice)}',
                      padding: const EdgeInsets.all(AaraagateTokens.space4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: AaraagateTokens.iconContainer,
                            height: AaraagateTokens.iconContainer,
                            decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                            child: Icon(Icons.home_repair_service_outlined, color: scheme.onPrimaryContainer),
                          ),
                          const SizedBox(width: AaraagateTokens.space3),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(first['name']?.toString() ?? 'Service', style: theme.textTheme.titleMedium),
                                const SizedBox(height: AaraagateTokens.space1),
                                Text('$count verified provider${count == 1 ? '' : 's'}', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                                const SizedBox(height: AaraagateTokens.space1),
                                Text(first['description']?.toString() ?? 'Compare providers, prices and service details.', maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                                const SizedBox(height: AaraagateTokens.space2),
                                Text('From ${_price(minPrice)}', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800, color: scheme.primary)),
                              ],
                            ),
                          ),
                          const SizedBox(width: AaraagateTokens.space2),
                          Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
                        ],
                      ),
                    ),
                  );
                }),
              const SizedBox(height: AaraagateTokens.space6),
              PremiumSectionHeader(
                title: 'Your bookings',
                supportingText: controller.bookings.isEmpty ? 'Requested and confirmed services will appear here.' : 'Track provider confirmation, gate access and completion status.',
                trailing: AaraagateStatusPill(label: '${controller.bookings.length}', tone: AaraagateStatusTone.neutral),
              ),
              const SizedBox(height: AaraagateTokens.space3),
              if (controller.bookings.isEmpty)
                const AppStateCard(icon: Icons.event_available_outlined, message: 'You have no service bookings yet.')
              else
                ...controller.bookings.map((booking) {
                  final status = booking['status']?.toString() ?? 'REQUESTED';
                  final cancellable = status == 'REQUESTED' || status == 'CONFIRMED';
                  final rateable = status == 'COMPLETED' && booking['rating'] == null;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AaraagateTokens.space3),
                    child: PremiumSurface(
                      padding: const EdgeInsets.all(AaraagateTokens.space4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: Text(_bookingTitle(booking), style: theme.textTheme.titleMedium)),
                              const SizedBox(width: AaraagateTokens.space2),
                              AaraagateStatusPill(label: status.replaceAll('_', ' '), tone: _bookingTone(status)),
                            ],
                          ),
                          const SizedBox(height: AaraagateTokens.space2),
                          Text(_providerName(booking), style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                          const SizedBox(height: AaraagateTokens.space1),
                          Text('Scheduled ${_dateTime(booking['scheduledFrom'])}', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                          const SizedBox(height: AaraagateTokens.space2),
                          Text(_statusMessage(booking), style: theme.textTheme.bodyMedium),
                          const SizedBox(height: AaraagateTokens.space3),
                          Wrap(
                            spacing: AaraagateTokens.space2,
                            runSpacing: AaraagateTokens.space2,
                            children: [
                              OutlinedButton.icon(
                                onPressed: _busy ? null : () => _showTimeline(booking),
                                icon: const Icon(Icons.timeline_rounded),
                                label: const Text('Timeline & warranty'),
                              ),
                              if (cancellable) OutlinedButton(onPressed: _busy ? null : () => _cancel(booking), child: const Text('Cancel')),
                              if (rateable) FilledButton(onPressed: _busy ? null : () => _rate(booking), child: const Text('Rate service')),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),
            ],
            if (_busy) ...[
              const SizedBox(height: AaraagateTokens.space4),
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

  static int _pricePaise(Map<String, dynamic> offering) => (offering['pricePaise'] as num?)?.toInt() ?? 0;

  static String _providerInitial(Map<String, dynamic> item) {
    final name = _providerName(item).trim();
    return name.isEmpty ? 'V' : name.substring(0, 1).toUpperCase();
  }

  static String _providerName(Map<String, dynamic> item) {
    final provider = item['provider'];
    if (provider is Map && provider['businessName'] != null) return provider['businessName'].toString();
    return 'Verified provider';
  }

  static AaraagateStatusTone _bookingTone(String status) {
    switch (status) {
      case 'CONFIRMED':
      case 'IN_PROGRESS':
        return AaraagateStatusTone.info;
      case 'COMPLETED':
        return AaraagateStatusTone.success;
      case 'CANCELLED':
        return AaraagateStatusTone.neutral;
      default:
        return AaraagateStatusTone.warning;
    }
  }

  static String _statusMessage(Map<String, dynamic> booking) {
    final status = booking['status']?.toString() ?? 'REQUESTED';
    switch (status) {
      case 'REQUESTED':
        return 'Waiting for the provider to confirm this request. No gate pass has been created yet.';
      case 'CONFIRMED':
        final access = booking['accessRequest'];
        final accessStatus = access is Map ? access['status']?.toString().replaceAll('_', ' ') : null;
        return accessStatus == null ? 'Provider confirmed. Gate access is linked to this booking.' : 'Provider confirmed. Linked gate access: $accessStatus.';
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
