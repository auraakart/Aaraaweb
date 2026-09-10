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
    final now = DateTime.now();
    final initialDate = DateTime(now.year, now.month, now.day).add(const Duration(days: 1));
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 180)),
      initialDate: initialDate,
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 10, minute: 0));
    if (time == null || !mounted) return;

    final startsAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    final endsAt = startsAt.add(Duration(minutes: slotMinutes));
    if (!startsAt.isAfter(DateTime.now())) {
      _showMessage('Choose a future time slot.');
      return;
    }

    final approvalText = amenity['requiresApproval'] == true ? 'This request will be sent for approval.' : 'This slot will be confirmed immediately if available.';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Book ${amenity['name'] ?? 'amenity'}?'),
        content: Text('${_formatDateTime(startsAt)} · $slotMinutes min\n${_feeLabel(amenity['feePaise'])}\n\n$approvalText'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Back')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Book')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      final created = await widget.repository.createAmenityBooking(
        amenityId: amenity['id'].toString(),
        unitId: widget.unitId,
        startsAt: startsAt,
        endsAt: endsAt,
      );
      if (!mounted) return;
      _showMessage(created['status']?.toString() == 'PENDING' ? 'Booking request sent for approval.' : 'Amenity booked.');
      await _load();
    } catch (error) {
      if (mounted) _showMessage(_friendlyError(error));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancel(Map<String, dynamic> booking) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel booking?'),
        content: Text('${booking['amenityName'] ?? 'Amenity'} · ${_formatApiDate(booking['startsAt'])}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel booking')),
        ],
      ),
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
    return Scaffold(
      appBar: AppBar(title: const Text('Amenities')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            Text('Book society facilities', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Availability and bookings are for your currently selected property.'),
            const SizedBox(height: 20),
            if (_loading && _amenities.isEmpty)
              const AppStateCard(icon: Icons.event_available_outlined, message: 'Loading amenities…', loading: true)
            else if (_error != null)
              AppStateCard(icon: Icons.error_outline_rounded, message: _error!, actionLabel: 'Retry', onAction: _load)
            else if (_amenities.isEmpty)
              const AppStateCard(icon: Icons.weekend_outlined, message: 'No bookable amenities are available right now.')
            else ...[
              Text('Available', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              for (final amenity in _amenities) ...[
                _AmenityCard(amenity: amenity, busy: _submitting, onBook: () => _book(amenity)),
                const SizedBox(height: 10),
              ],
            ],
            const SizedBox(height: 22),
            Text('Your bookings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            if (!_loading && _bookings.isEmpty)
              const AppStateCard(icon: Icons.calendar_month_outlined, message: 'You have no amenity bookings for this property.')
            else
              for (final booking in _bookings) ...[
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

class _AmenityCard extends StatelessWidget {
  const _AmenityCard({required this.amenity, required this.busy, required this.onBook});
  final Map<String, dynamic> amenity;
  final bool busy;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final approval = amenity['requiresApproval'] == true;
    final slotMinutes = _asInt(amenity['slotMinutes'], fallback: 60);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              CircleAvatar(backgroundColor: theme.colorScheme.primaryContainer, child: const Icon(Icons.sports_tennis_outlined)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(amenity['name']?.toString() ?? 'Amenity', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                if (amenity['location'] != null) Text(amenity['location'].toString()),
              ])),
              Chip(label: Text(approval ? 'Approval' : 'Instant')),
            ]),
            if ((amenity['description']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(amenity['description'].toString()),
            ],
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              _InfoChip(icon: Icons.schedule_outlined, label: '$slotMinutes min'),
              _InfoChip(icon: Icons.payments_outlined, label: _feeLabel(amenity['feePaise'])),
              _InfoChip(icon: Icons.groups_2_outlined, label: '${_asInt(amenity['maxConcurrentBookings'], fallback: 1)} per slot'),
            ]),
            const SizedBox(height: 14),
            SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: busy ? null : onBook, icon: const Icon(Icons.event_available_outlined), label: const Text('Choose a slot'))),
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
    final status = booking['status']?.toString() ?? 'PENDING';
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(16, 10, 12, 10),
        leading: const CircleAvatar(child: Icon(Icons.calendar_today_outlined)),
        title: Text(booking['amenityName']?.toString() ?? 'Amenity', style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text('${_formatApiDate(booking['startsAt'])}\n${_feeLabel(booking['feePaise'])} · ${status.replaceAll('_', ' ')}'),
        isThreeLine: true,
        trailing: onCancel == null ? null : TextButton(onPressed: busy ? null : onCancel, child: const Text('Cancel')),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Chip(avatar: Icon(icon, size: 17), label: Text(label));
}

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
