import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';

class WorkforceAttendanceSheet extends StatefulWidget {
  const WorkforceAttendanceSheet({
    super.key,
    required this.controller,
    required this.assignmentId,
    this.clock,
  });
  final ResidentDataController controller;
  final String assignmentId;
  final DateTime Function()? clock;

  @override
  State<WorkforceAttendanceSheet> createState() => _WorkforceAttendanceSheetState();
}

class _WorkforceAttendanceSheetState extends State<WorkforceAttendanceSheet> {
  // Keep a full year of completed months available, in addition to this month.
  static const _historyMonths = 12;
  late DateTime _today;
  late DateTime _currentMonth;
  late DateTime _selectedMonth;
  late Future<Map<String, dynamic>> _attendance;

  @override
  void initState() {
    super.initState();
    final indiaNow = (widget.clock?.call() ?? DateTime.now())
        .toUtc().add(const Duration(hours: 5, minutes: 30));
    _today = DateTime(indiaNow.year, indiaNow.month, indiaNow.day);
    _currentMonth = DateTime(_today.year, _today.month);
    _selectedMonth = _currentMonth;
    _attendance = _loadMonth();
  }

  @override
  void didUpdateWidget(covariant WorkforceAttendanceSheet oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller || oldWidget.assignmentId != widget.assignmentId) {
      _attendance = _loadMonth();
    }
  }

  Future<Map<String, dynamic>> _loadMonth() async {
    final lastDay = DateTime(_selectedMonth.year, _selectedMonth.month + 1, 0);
    // Render the whole current month, but never count future days as evidence gaps.
    return widget.controller.workforceAttendance(
      widget.assignmentId,
      from: _selectedMonth,
      to: lastDay.isAfter(_today) ? _today : lastDay,
    );
  }

  void _selectMonth(DateTime month) {
    if (month == _selectedMonth) return;
    setState(() {
      _selectedMonth = month;
      _attendance = _loadMonth();
    });
  }

  void _retry() => setState(() { _attendance = _loadMonth(); });

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final oldestMonth = DateTime(_currentMonth.year, _currentMonth.month - _historyMonths);
    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: .88,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Attendance register', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Row(children: [
                  IconButton(
                    tooltip: 'Previous month',
                    onPressed: _selectedMonth.isAfter(oldestMonth)
                        ? () => _selectMonth(DateTime(_selectedMonth.year, _selectedMonth.month - 1))
                        : null,
                    icon: const Icon(Icons.chevron_left_rounded),
                  ),
                  Expanded(
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<DateTime>(
                        key: const ValueKey('attendance-month-selector'),
                        value: _selectedMonth,
                        isExpanded: true,
                        itemHeight: null,
                        borderRadius: BorderRadius.circular(12),
                        hint: const Text('Attendance month'),
                        items: List.generate(_historyMonths + 1, (index) {
                          final month = DateTime(_currentMonth.year, _currentMonth.month - index);
                          return DropdownMenuItem(
                            value: month,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Text(localizations.formatMonthYear(month)),
                            ),
                          );
                        }),
                        onChanged: (month) { if (month != null) _selectMonth(month); },
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Next month',
                    onPressed: _selectedMonth.isBefore(_currentMonth)
                        ? () => _selectMonth(DateTime(_selectedMonth.year, _selectedMonth.month + 1))
                        : null,
                    icon: const Icon(Icons.chevron_right_rounded),
                  ),
                ]),
              ]),
            ),
            Expanded(
              child: FutureBuilder<Map<String, dynamic>>(
                // A new month must never display a previous month's pending data.
                key: ValueKey('${widget.assignmentId}:$_selectedMonth'),
                future: _attendance,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator(semanticsLabel: 'Loading attendance'));
                  }
                  if (snapshot.hasError) {
                    return Center(child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Text('Could not load attendance for this month.', textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(onPressed: _retry, icon: const Icon(Icons.refresh), label: const Text('Retry')),
                      ]),
                    ));
                  }
                  final data = snapshot.data ?? const <String, dynamic>{};
                  final summary = data['summary'] is Map
                      ? Map<String, dynamic>.from(data['summary'] as Map)
                      : const <String, dynamic>{};
                  final days = _maps(data['days']);
                  final leaves = _maps(data['leaves']);
                  final schedule = data['schedule'] is Map
                      ? Map<String, dynamic>.from(data['schedule'] as Map)
                      : const <String, dynamic>{};
                  return ListView(
                    key: ValueKey('attendance-content-$_selectedMonth'),
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                    children: [
                      if (_selectedMonth == _currentMonth) ...[
                        Text('Records through ${localizations.formatShortDate(_today)} (IST)', style: Theme.of(context).textTheme.bodySmall),
                        const SizedBox(height: 12),
                      ],
                      Wrap(
                        spacing: 20,
                        runSpacing: 10,
                        children: [
                          Text('${summary['presentDays'] ?? 0} present days'),
                          Text('${summary['expectedScheduleDays'] ?? 0} scheduled days'),
                          Text('${summary['scheduledEvidenceGapDays'] ?? 0} evidence gaps'),
                          Text('${summary['totalVisits'] ?? 0} visits'),
                          Text('${summary['leavePeriods'] ?? 0} leave periods'),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _AttendanceCalendar(
                        month: _selectedMonth,
                        today: _today,
                        attendanceDays: days,
                        leaves: leaves,
                        schedule: schedule,
                      ),
                      const SizedBox(height: 20),
                      if (days.isEmpty)
                        const Text('No gate attendance evidence exists for this month.')
                      else
                        ...days.map((day) {
                          final date = day['date']?.toString().split('T').first ?? 'Date';
                          final minutes = int.tryParse('${day['minutesInside'] ?? 0}') ?? 0;
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.event_available_outlined),
                            title: Text(date, style: const TextStyle(fontWeight: FontWeight.w600)),
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
          ],
        ),
      ),
    );
  }

  static List<Map<String, dynamic>> _maps(dynamic value) => value is List
      ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
      : <Map<String, dynamic>>[];

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
    required this.month,
    required this.today,
    required this.attendanceDays,
    required this.leaves,
    required this.schedule,
  });

  final DateTime month;
  final DateTime today;
  final List<Map<String, dynamic>> attendanceDays;
  final List<Map<String, dynamic>> leaves;
  final Map<String, dynamic> schedule;

  static const _weekdayNames = <int, String>{
    DateTime.monday: 'MONDAY', DateTime.tuesday: 'TUESDAY',
    DateTime.wednesday: 'WEDNESDAY', DateTime.thursday: 'THURSDAY',
    DateTime.friday: 'FRIDAY', DateTime.saturday: 'SATURDAY', DateTime.sunday: 'SUNDAY',
  };

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final colors = Theme.of(context).colorScheme;
    final present = attendanceDays.map((day) => day['date']?.toString().split('T').first).whereType<String>().toSet();
    final scheduledDays = schedule['days'] is List
        ? (schedule['days'] as List).whereType<String>().map((day) => day.toUpperCase()).toSet()
        : <String>{};
    final dayCount = DateTime(month.year, month.month + 1, 0).day;
    // Material's weekday index is Sunday=0; DateTime's is Monday=1.
    final offset = (month.weekday % 7 - localizations.firstDayOfWeekIndex + 7) % 7;
    final cellCount = ((offset + dayCount + 6) ~/ 7) * 7;

    Widget dayCell(int day) {
      final date = DateTime(month.year, month.month, day);
      final dateKey = '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
      final future = date.isAfter(today);
      final onLeave = leaves.any((leave) {
        final starts = leave['startsOn']?.toString().split('T').first;
        final ends = leave['endsOn']?.toString().split('T').first;
        return starts != null && ends != null && dateKey.compareTo(starts) >= 0 && dateKey.compareTo(ends) <= 0;
      });
      final isPresent = !future && present.contains(dateKey);
      final scheduled = !future && scheduledDays.contains(_weekdayNames[date.weekday]);
      final state = isPresent ? 'P' : onLeave ? 'L' : scheduled ? 'E' : '—';
      final detail = isPresent ? 'Gate presence recorded'
          : onLeave ? 'Recorded leave'
          : future ? 'Upcoming day'
          : scheduled ? 'Expected schedule day; no gate evidence' : 'No attendance inference';
      final background = isPresent ? colors.primaryContainer : onLeave ? colors.secondaryContainer : colors.surfaceContainerLow;
      final foreground = isPresent ? colors.onPrimaryContainer : onLeave ? colors.onSecondaryContainer : colors.onSurfaceVariant;
      return Padding(
        padding: const EdgeInsets.all(2),
        child: Semantics(
          key: ValueKey('attendance-day-$dateKey'),
          label: '${localizations.formatFullDate(date)}: $detail',
          excludeSemantics: true,
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            padding: const EdgeInsets.symmetric(vertical: 6),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: background,
              border: date == today ? Border.all(color: colors.primary) : null,
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('$day', style: Theme.of(context).textTheme.labelMedium?.copyWith(color: foreground, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(state, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: foreground)),
            ]),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Monthly attendance view', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        Text('P = gate presence · L = recorded leave · E = scheduled day with no gate evidence · — = no attendance inference or upcoming day', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        Table(
          key: const ValueKey('attendance-calendar'),
          children: [
            TableRow(children: List.generate(7, (column) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Center(child: Text(localizations.narrowWeekdays[(localizations.firstDayOfWeekIndex + column) % 7], style: Theme.of(context).textTheme.labelMedium)),
            ))),
            for (var row = 0; row < cellCount ~/ 7; row++)
              TableRow(children: List.generate(7, (column) {
                final day = row * 7 + column - offset + 1;
                return day < 1 || day > dayCount ? const SizedBox.shrink() : dayCell(day);
              })),
          ],
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
    final currentPeriod = _period.text.trim();
    final periodRecords = records.where((record) => record['periodMonth']?.toString() == currentPeriod).toList(growable: false);
    int totalFor(String kind) => periodRecords
        .where((record) => record['kind']?.toString() == kind)
        .fold(0, (sum, record) => sum + (int.tryParse('${record['amountPaise'] ?? 0}') ?? 0));
    final salaryPaise = totalFor('SALARY');
    final advancePaise = totalFor('ADVANCE');
    final otherPaise = periodRecords
        .where((record) => !['SALARY', 'ADVANCE'].contains(record['kind']?.toString()))
        .fold(0, (sum, record) => sum + (int.tryParse('${record['amountPaise'] ?? 0}') ?? 0));
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
              onChanged: (_) => setState(() {}),
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
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Period summary · $currentPeriod', style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    Chip(label: Text('Salary ₹${(salaryPaise / 100).toStringAsFixed(2)}')),
                    Chip(label: Text('Advance ₹${(advancePaise / 100).toStringAsFixed(2)}')),
                    Chip(label: Text('Other ₹${(otherPaise / 100).toStringAsFixed(2)}')),
                  ]),
                  const SizedBox(height: 6),
                  Text('These are resident-entered records only. They are not payroll liabilities or proof of bank/cash settlement.', style: Theme.of(context).textTheme.bodySmall),
                ]),
              ),
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
