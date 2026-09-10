import 'package:flutter/material.dart';
import '../data/amenity_actions.dart';
import '../data/resident_repository.dart';
import '../widgets/app_state_card.dart';

class AmenitiesScreen extends StatefulWidget {
  const AmenitiesScreen({super.key, required this.repository, required this.unitId});

  final ResidentRepository repository;
  final String unitId;

  @override
  State<AmenitiesScreen> createState() => _AmenitiesScreenState();
}

class _AmenitiesScreenState extends State<AmenitiesScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _amenities = const [];
  List<Map<String, dynamic>> _bookings = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        widget.repository.amenities(),
        widget.repository.amenityBookings(widget.unitId),
      ]);
      if (!mounted) return;
      setState(() {
        _amenities = results[0];
        _bookings = results[1];
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = _friendlyError(error);
      });
    }
  }

  Future<void> _book(Map<String, dynamic> amenity) async {
    final slotMinutes = _asInt(amenity['slotMinutes'], fallback: 60);
    final selection = await showModalBottomSheet<_BookingSelection>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => _BookingSheet(
        amenity: amenity,
        slotMinutes: slotMinutes,
      ),
    );
    if (selection == null || !mounted) return;

    final startsAt = selection.startsAt;
    final endsAt = startsAt.add(Duration(minutes: slotMinutes));
    if (!startsAt.isAfter(DateTime.now())) {
      _showMessage('Choose a future time slot.');
      return;
    }

    setState(() => _submitting = true);
    try {
      final created = await widget.repository.createAmenityBooking(
        amenityId: amenity['id'].toString(),
        unitId: widget.unitId,
        startsAt: startsAt,
        endsAt: endsAt,
      );
      if (!mounted) return;
      _showMessage(created['status']?.toString() == 'PENDING'
          ? 'Booking request sent for approval.'
          : 'Amenity booked.');
      await _load();
    } catch (error) {
      if (mounted) _showMessage(_friendlyError(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancel(Map<String, dynamic> booking) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      builder: (sheetContext) {
        final theme = Theme.of(sheetContext);
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Cancel booking?', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text('${booking['amenityName'] ?? 'Amenity'} · ${_formatApiDate(booking['startsAt'])}'),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(sheetContext, false),
                      child: const Text('Keep booking'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => Navigator.pop(sheetContext, true),
                      child: const Text('Cancel booking'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      await widget.repository.cancelAmenityBooking(booking['id'].toString());
      if (!mounted) return;
      _showMessage('Booking cancelled.');
      await _load();
    } catch (error) {
      if (mounted) _showMessage(_friendlyError(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final upcoming = [..._bookings]
      ..sort((a, b) => (a['startsAt']?.toString() ?? '').compareTo(b['startsAt']?.toString() ?? ''));

    return Scaffold(
      appBar: AppBar(title: const Text('Amenities')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            Text('Book society facilities', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              'Choose a facility and time for your currently selected property.',
              style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 24),
            if (_loading && _amenities.isEmpty)
              const AppStateCard(icon: Icons.event_available_outlined, message: 'Loading amenities…', loading: true)
            else if (_error != null)
              AppStateCard(icon: Icons.error_outline_rounded, message: _error!, actionLabel: 'Retry', onAction: _load)
            else if (_amenities.isEmpty)
              const AppStateCard(icon: Icons.weekend_outlined, message: 'No bookable amenities are available right now.')
            else ...[
              _SectionHeading(title: 'Available facilities', count: _amenities.length),
              const SizedBox(height: 12),
              for (final amenity in _amenities) ...[
                _AmenityCard(amenity: amenity, busy: _submitting, onBook: () => _book(amenity)),
                const SizedBox(height: 12),
              ],
            ],
            const SizedBox(height: 20),
            _SectionHeading(title: 'Your bookings', count: upcoming.length),
            const SizedBox(height: 12),
            if (!_loading && upcoming.isEmpty)
              const AppStateCard(icon: Icons.calendar_month_outlined, message: 'You have no amenity bookings for this property.')
            else
              for (final booking in upcoming) ...[
                _BookingCard(
                  booking: booking,
                  busy: _submitting,
                  onCancel: _isCancelable(booking) ? () => _cancel(booking) : null,
                ),
                const SizedBox(height: 10),
              ],
          ],
        ),
      ),
    );
  }

  bool _isCancelable(Map<String, dynamic> booking) {
    final status = booking['status']?.toString();
    return status == 'PENDING' || status == 'CONFIRMED';
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  static String _friendlyError(Object error) {
    final text = error.toString();
    if (text.contains('403')) return 'Amenities are not enabled for this society or your role.';
    if (text.contains('409')) return 'That slot is no longer available. Choose another time.';
    if (text.contains('401')) return 'Your session has expired. Sign in again.';
    return 'Amenities could not be loaded. Check your connection and try again.';
  }
}

class _BookingSelection {
  const _BookingSelection(this.startsAt);
  final DateTime startsAt;
}

class _BookingSheet extends StatefulWidget {
  const _BookingSheet({required this.amenity, required this.slotMinutes});

  final Map<String, dynamic> amenity;
  final int slotMinutes;

  @override
  State<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends State<_BookingSheet> {
  late DateTime _date;
  TimeOfDay? _time;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _date = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
  }

  DateTime? get _startsAt {
    final time = _time;
    if (time == null) return null;
    return DateTime(_date.year, _date.month, _date.day, time.hour, time.minute);
  }

  Future<void> _pickMoreDates() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 180)),
      initialDate: _date,
    );
    if (date != null && mounted) setState(() => _date = date);
  }

  Future<void> _pickTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: _time ?? const TimeOfDay(hour: 10, minute: 0),
    );
    if (time != null && mounted) setState(() => _time = time);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final now = DateTime.now();
    final quickDates = List<DateTime>.generate(7, (index) {
      final day = DateTime(now.year, now.month, now.day).add(Duration(days: index + 1));
      return day;
    });
    final approval = widget.amenity['requiresApproval'] == true;
    final startsAt = _startsAt;
    final invalidPast = startsAt != null && !startsAt.isAfter(now);

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.amenity['name']?.toString() ?? 'Amenity', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              '${widget.slotMinutes} min · ${_feeLabel(widget.amenity['feePaise'])} · ${approval ? 'Approval required' : 'Server confirmation'}',
              style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 24),
            Text('Choose date', style: theme.textTheme.titleMedium),
            const SizedBox(height: 12),
            SizedBox(
              height: 68,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: quickDates.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final date = quickDates[index];
                  final selected = _sameDay(date, _date);
                  return ChoiceChip(
                    selected: selected,
                    onSelected: (_) => setState(() => _date = date),
                    label: SizedBox(
                      width: 46,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(_weekday(date), style: theme.textTheme.labelSmall),
                          const SizedBox(height: 2),
                          Text('${date.day}', style: theme.textTheme.titleMedium),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _pickMoreDates,
                icon: const Icon(Icons.calendar_month_outlined, size: 18),
                label: Text(_isQuickDate(_date, quickDates) ? 'Choose another date' : _shortDate(_date)),
              ),
            ),
            const SizedBox(height: 8),
            Text('Choose time', style: theme.textTheme.titleMedium),
            const SizedBox(height: 10),
            InkWell(
              onTap: _pickTime,
              borderRadius: BorderRadius.circular(16),
              child: Ink(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    Icon(Icons.schedule_rounded, color: scheme.primary),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _time == null ? 'Select start time' : _time!.format(context),
                        style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
              ),
            ),
            if (invalidPast) ...[
              const SizedBox(height: 8),
              Text('Choose a future time.', style: theme.textTheme.bodySmall?.copyWith(color: scheme.error)),
            ],
            const SizedBox(height: 20),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(approval ? Icons.schedule_send_outlined : Icons.verified_user_outlined, color: scheme.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      approval
                          ? 'Your society will review this booking after you submit it.'
                          : 'Your selected time is only a request until the server confirms that capacity is still available.',
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: startsAt == null || invalidPast
                    ? null
                    : () => Navigator.pop(context, _BookingSelection(startsAt)),
                icon: const Icon(Icons.event_available_rounded),
                label: Text(approval ? 'Request booking' : 'Check & book'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.count});
  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(child: Text(title, style: theme.textTheme.titleMedium)),
        Text('$count', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

class _AmenityCard extends StatelessWidget {
  const _AmenityCard({required this.amenity, required this.busy, required this.onBook});
  final Map<String, dynamic> amenity;
  final bool busy;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final approval = amenity['requiresApproval'] == true;
    final slotMinutes = _asInt(amenity['slotMinutes'], fallback: 60);
    final description = amenity['description']?.toString() ?? '';

    return Card(
      color: scheme.surface,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.sports_tennis_rounded, color: scheme.onPrimaryContainer),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(amenity['name']?.toString() ?? 'Amenity', style: theme.textTheme.titleMedium),
                      if (amenity['location'] != null) ...[
                        const SizedBox(height: 3),
                        Text(amenity['location'].toString(), style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ),
                _StatusPill(label: approval ? 'Approval' : 'Server check'),
              ],
            ),
            if (description.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(description, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium?.copyWith(height: 1.45)),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                _Meta(icon: Icons.schedule_outlined, label: '$slotMinutes min'),
                const SizedBox(width: 16),
                _Meta(icon: Icons.payments_outlined, label: _feeLabel(amenity['feePaise'])),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: busy ? null : onBook,
                icon: const Icon(Icons.calendar_month_outlined),
                label: const Text('Choose date & time'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking, required this.busy, this.onCancel});
  final Map<String, dynamic> booking;
  final bool busy;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = booking['status']?.toString() ?? 'PENDING';
    final statusLabel = status.replaceAll('_', ' ').toLowerCase();

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: scheme.surfaceContainer,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.calendar_today_outlined, color: scheme.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(booking['amenityName']?.toString() ?? 'Amenity', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(_formatApiDate(booking['startsAt']), style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 3),
                  Text('${_feeLabel(booking['feePaise'])} · ${_titleCase(statusLabel)}', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
            if (onCancel != null)
              TextButton(onPressed: busy ? null : onCancel, child: const Text('Cancel')),
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 5),
        Text(label, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

bool _isQuickDate(DateTime date, List<DateTime> quickDates) => quickDates.any((item) => _sameDay(item, date));

String _weekday(DateTime date) {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return names[date.weekday - 1];
}

String _shortDate(DateTime date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${date.day} ${months[date.month - 1]}';
}

String _titleCase(String value) => value.isEmpty ? value : '${value[0].toUpperCase()}${value.substring(1)}';

int _asInt(dynamic value, {required int fallback}) {
  if (value is int) return value;
  return int.tryParse(value?.toString() ?? '') ?? fallback;
}

String _feeLabel(dynamic feePaise) {
  final paise = _asInt(feePaise, fallback: 0);
  if (paise <= 0) return 'Free';
  final rupees = paise / 100;
  return rupees == rupees.roundToDouble() ? '₹${rupees.toInt()}' : '₹${rupees.toStringAsFixed(2)}';
}

String _formatApiDate(dynamic value) {
  final parsed = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  return parsed == null ? 'Time unavailable' : _formatDateTime(parsed);
}

String _formatDateTime(DateTime value) {
  final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;
  final minute = value.minute.toString().padLeft(2, '0');
  final period = value.hour >= 12 ? 'PM' : 'AM';
  return '${value.day}/${value.month}/${value.year} · $hour:$minute $period';
}
