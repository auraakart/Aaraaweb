import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';

class WorkforceAttendanceSheet extends StatelessWidget {
  const WorkforceAttendanceSheet({super.key, required this.controller, required this.assignmentId});
  final ResidentDataController controller;
  final String assignmentId;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: .88,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: FutureBuilder<Map<String, dynamic>>(
            future: controller.workforceAttendance(assignmentId),
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return Center(child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(snapshot.error.toString(), textAlign: TextAlign.center),
                ));
              }
              final data = snapshot.data ?? const <String, dynamic>{};
              final summary = data['summary'] is Map
                  ? Map<String, dynamic>.from(data['summary'] as Map)
                  : const <String, dynamic>{};
              final days = data['days'] is List
                  ? (data['days'] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
                  : <Map<String, dynamic>>[];
              final leaves = data['leaves'] is List
                  ? (data['leaves'] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
                  : <Map<String, dynamic>>[];
              final schedule = data['schedule'] is Map
                  ? Map<String, dynamic>.from(data['schedule'] as Map)
                  : const <String, dynamic>{};
              return ListView(
                children: [
                  const Text('Attendance register', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  Text('${data['from'] ?? ''} to ${data['to'] ?? ''}', style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      Chip(avatar: const Icon(Icons.event_available_outlined, size: 18), label: Text('${summary['presentDays'] ?? 0} present days')),
                      Chip(avatar: const Icon(Icons.door_front_door_outlined, size: 18), label: Text('${summary['totalVisits'] ?? 0} visits')),
                      Chip(avatar: const Icon(Icons.event_busy_outlined, size: 18), label: Text('${summary['leavePeriods'] ?? 0} leave periods')),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _AttendanceCalendar(
                    from: data['from']?.toString(),
                    to: data['to']?.toString(),
                    attendanceDays: days,
                    leaves: leaves,
                    schedule: schedule,
                  ),
                  const SizedBox(height: 16),
                  if (days.isEmpty)
                    const Card(child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('No gate attendance evidence exists for this period.'),
                    ))
                  else
                    ...days.map((day) {
                      final date = day['date']?.toString().split('T').first ?? 'Date';
                      final minutes = int.tryParse('${day['minutesInside'] ?? 0}') ?? 0;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.event_available_outlined),
                        title: Text(date, style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(
                          'In ${_clock(day['firstEntryAt'])} · Out ${day['openVisit'] == true ? 'Still inside' : _clock(day['lastExitAt'])} · ${minutes ~/ 60}h ${minutes % 60}m',
                        ),
                        trailing: Text('${day['visitCount'] ?? 1}×'),
                      );
                    }),
                  const Divider(height: 28),
                  Text(
                    data['boundary']?.toString() ?? 'Attendance is derived from gate records.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  static String _clock(dynamic value) {
    if (value == null) return '—';
    final parsed = DateTime.tryParse(value.toString());
    if (parsed == null) return value.toString();
    final local = parsed.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}

class _AttendanceCalendar extends StatelessWidget {
  const _AttendanceCalendar({
    required this.from,
    required this.to,
    required this.attendanceDays,
    required this.leaves,
    required this.schedule,
  });

  final String? from;
  final String? to;
  final List<Map<String, dynamic>> attendanceDays;
  final List<Map<String, dynamic>> leaves;
  final Map<String, dynamic> schedule;

  static const _weekdayNames = <int, String>{
    DateTime.monday: 'MONDAY',
    DateTime.tuesday: 'TUESDAY',
    DateTime.wednesday: 'WEDNESDAY',
    DateTime.thursday: 'THURSDAY',
    DateTime.friday: 'FRIDAY',
    DateTime.saturday: 'SATURDAY',
    DateTime.sunday: 'SUNDAY',
  };

  @override
  Widget build(BuildContext context) {
    final start = DateTime.tryParse(from ?? '');
    final end = DateTime.tryParse(to ?? '');
    if (start == null || end == null || end.isBefore(start)) return const SizedBox.shrink();

    final present = attendanceDays
        .map((day) => day['date']?.toString().split('T').first)
        .whereType<String>()
        .toSet();
    final scheduledDays = (schedule['days'] is List)
        ? (schedule['days'] as List)
            .whereType<String>()
            .map((day) => day.toUpperCase())
            .toSet()
        : <String>{};
    final hasExplicitSchedule = scheduledDays.isNotEmpty;
    final dates = <DateTime>[];
    for (var cursor = DateTime(start.year, start.month, start.day);
        !cursor.isAfter(DateTime(end.year, end.month, end.day)) && dates.length < 31;
        cursor = cursor.add(const Duration(days: 1))) {
      dates.add(cursor);
    }

    bool leaveOn(String key) => leaves.any((leave) {
      final starts = leave['startsOn']?.toString().split('T').first;
      final ends = leave['endsOn']?.toString().split('T').first;
      return starts != null && ends != null && key.compareTo(starts) >= 0 && key.compareTo(ends) <= 0;
    });

    String key(DateTime date) =>
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Monthly attendance view', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text(
          'P = gate presence · L = recorded leave · E = scheduled day with no gate evidence · — = no attendance inference',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: dates.map((date) {
            final dateKey = key(date);
            final onLeave = leaveOn(dateKey);
            final isPresent = present.contains(dateKey);
            final scheduled = hasExplicitSchedule && scheduledDays.contains(_weekdayNames[date.weekday]);
            final state = isPresent ? 'P' : onLeave ? 'L' : scheduled ? 'E' : '—';
            final detail = isPresent
                ? 'Gate presence recorded'
                : onLeave
                    ? 'Recorded leave'
                    : scheduled
                        ? 'Expected schedule day; no gate evidence'
                        : 'No attendance inference';
            return Semantics(
              label: '${date.day}/${date.month}: $detail',
              child: Container(
                width: 46,
                padding: const EdgeInsets.symmetric(vertical: 7),
                decoration: BoxDecoration(
                  border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                  borderRadius: BorderRadius.circular(10),
                  color: isPresent
                      ? Theme.of(context).colorScheme.primaryContainer
                      : onLeave
                          ? Theme.of(context).colorScheme.secondaryContainer
                          : Theme.of(context).colorScheme.surfaceContainerLow,
                ),
                child: Column(
                  children: [
                    Text('${date.day}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(state, style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            );
          }).toList(growable: false),
        ),
      ],
    );
  }
}

class WorkforcePaymentSheet extends StatefulWidget {
  const WorkforcePaymentSheet({super.key, required this.controller, required this.assignmentId});
  final ResidentDataController controller;
  final String assignmentId;

  @override
  State<WorkforcePaymentSheet> createState() => _WorkforcePaymentSheetState();
}

class _WorkforcePaymentSheetState extends State<WorkforcePaymentSheet> {
  final _amount = TextEditingController();
  final _period = TextEditingController();
  final _note = TextEditingController();
  String _kind = 'SALARY';
  DateTime _paymentDate = DateTime.now();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _period.text = '${_paymentDate.year}-${_paymentDate.month.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _amount.dispose();
    _period.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _chooseDate() async {
    final chosen = await showDatePicker(
      context: context,
      firstDate: DateTime(DateTime.now().year - 2),
      lastDate: DateTime.now(),
      initialDate: _paymentDate,
    );
    if (chosen != null && mounted) setState(() => _paymentDate = chosen);
  }

  Future<void> _save() async {
    final rupees = double.tryParse(_amount.text.trim());
    if (rupees == null || rupees <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid positive amount.')));
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.controller.recordWorkforcePayment(
        assignmentId: widget.assignmentId,
        kind: _kind,
        amountPaise: (rupees * 100).round(),
        paymentDate: _paymentDate,
        periodMonth: _period.text.trim(),
        note: _note.text,
        idempotencyKey: 'staff-pay-${widget.assignmentId}-${DateTime.now().microsecondsSinceEpoch}',
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _amount.clear();
        _note.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment record saved. Aaraagate did not move or verify money.')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final records = widget.controller.paymentsForWorkforce(widget.assignmentId);
    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: .9,
        child: ListView(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
          children: [
            const Text('Staff payments', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text('Private household record only; this does not execute a bank or cash transfer.', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _kind,
              decoration: const InputDecoration(labelText: 'Record type', border: OutlineInputBorder()),
              items: const ['SALARY', 'ADVANCE', 'BONUS', 'REIMBURSEMENT', 'ADJUSTMENT']
                  .map((value) => DropdownMenuItem(value: value, child: Text(value.replaceAll('_', ' '))))
                  .toList(),
              onChanged: _busy ? null : (value) => setState(() => _kind = value ?? 'SALARY'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _amount,
              enabled: !_busy,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount (₹)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _period,
              enabled: !_busy,
              decoration: const InputDecoration(labelText: 'Period (YYYY-MM)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _busy ? null : _chooseDate,
              icon: const Icon(Icons.calendar_today_outlined),
              label: Text('Payment date · ${_paymentDate.toIso8601String().split('T').first}'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _note,
              enabled: !_busy,
              maxLength: 300,
              decoration: const InputDecoration(labelText: 'Note (optional)', border: OutlineInputBorder()),
            ),
            FilledButton.icon(
              onPressed: _busy ? null : _save,
              icon: const Icon(Icons.add_card_rounded),
              label: Text(_busy ? 'SAVING…' : 'SAVE PAYMENT RECORD'),
            ),
            const SizedBox(height: 22),
            Text('Recent records', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (records.isEmpty)
              const Text('No staff payment records yet.')
            else
              ...records.take(24).map((record) {
                final paise = int.tryParse('${record['amountPaise'] ?? 0}') ?? 0;
                final amount = (paise / 100).toStringAsFixed(2);
                final date = record['paymentDate']?.toString().split('T').first ?? '';
                final period = record['periodMonth']?.toString();
                final note = record['note']?.toString();
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text('₹$amount · ${record['kind'] ?? 'PAYMENT'}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text('$date${period == null ? '' : ' · $period'}${note == null || note.isEmpty ? '' : '\n$note'}'),
                );
              }),
          ],
        ),
      ),
    );
  }
}
