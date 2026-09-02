import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';

class WorkforceScreen extends StatelessWidget {
  const WorkforceScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    final assignments = controller.workforceAssignments;
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.refreshWorkforce,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 120),
          children: [
            Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Household staff', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                      SizedBox(height: 4),
                      Text('Attendance, leave and ratings in one place.'),
                    ],
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: controller.refreshWorkforce,
                  tooltip: 'Refresh staff',
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
            const SizedBox(height: 18),
            if (controller.workforceError != null)
              _MessageCard(
                icon: Icons.error_outline_rounded,
                title: 'Staff information is unavailable',
                message: controller.workforceError!,
              )
            else if (controller.loading && assignments.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 48),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (assignments.isEmpty)
              const _MessageCard(
                icon: Icons.badge_outlined,
                title: 'No household staff yet',
                message: 'Staff added to your household will appear here after society review.',
              )
            else
              ...assignments.map((assignment) => Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: _StaffCard(controller: controller, assignment: assignment),
                  )),
          ],
        ),
      ),
    );
  }
}

class _StaffCard extends StatelessWidget {
  const _StaffCard({required this.controller, required this.assignment});
  final ResidentDataController controller;
  final Map<String, dynamic> assignment;

  @override
  Widget build(BuildContext context) {
    final worker = assignment['worker'] is Map ? Map<String, dynamic>.from(assignment['worker'] as Map) : const <String, dynamic>{};
    final household = assignment['household'] is Map ? Map<String, dynamic>.from(assignment['household'] as Map) : const <String, dynamic>{};
    final unit = household['unit'] is Map ? Map<String, dynamic>.from(household['unit'] as Map) : const <String, dynamic>{};
    final building = unit['building'] is Map ? Map<String, dynamic>.from(unit['building'] as Map) : const <String, dynamic>{};
    final assignmentId = assignment['id']?.toString() ?? '';
    final status = assignment['status']?.toString() ?? 'PENDING';
    final verification = worker['verification']?.toString() ?? 'PENDING';
    final present = controller.isWorkforcePresent(assignmentId);
    final rating = controller.ratingFor(assignmentId);
    final leaves = controller.leavesFor(assignmentId);
    final canRate = status == 'APPROVED' || status == 'SUSPENDED';

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 24,
                  child: Text(_initials(worker['name']?.toString() ?? 'Staff'), style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(worker['name']?.toString() ?? 'Household staff', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 3),
                      Text(_friendly(worker['role']?.toString() ?? 'OTHER')),
                      if (building['name'] != null || unit['number'] != null) ...[
                        const SizedBox(height: 3),
                        Text('${building['name'] ?? 'Building'} · ${unit['number'] ?? 'Unit'}', style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ],
                  ),
                ),
                _PresencePill(present: present),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _StatusChip(label: _friendly(status), icon: Icons.assignment_turned_in_outlined),
                _StatusChip(label: _friendly(verification), icon: Icons.verified_user_outlined),
                if (rating != null)
                  _StatusChip(label: '${rating['score'] ?? '-'} / 5', icon: Icons.star_rounded),
              ],
            ),
            if (leaves.isNotEmpty) ...[
              const SizedBox(height: 14),
              ...leaves.take(2).map((leave) => _LeaveRow(
                    leave: leave,
                    onCancel: () => _confirmCancelLeave(context, leave['id']?.toString() ?? ''),
                  )),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: assignmentId.isEmpty ? null : () => _openLeaveSheet(context, assignmentId),
                    icon: const Icon(Icons.event_busy_outlined),
                    label: const Text('ADD LEAVE'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.tonalIcon(
                    onPressed: !canRate || assignmentId.isEmpty ? null : () => _openRatingSheet(context, assignmentId, rating),
                    icon: const Icon(Icons.star_outline_rounded),
                    label: Text(rating == null ? 'RATE' : 'UPDATE RATING'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openLeaveSheet(BuildContext context, String assignmentId) async {
    var startsOn = DateTime.now();
    var endsOn = DateTime.now();
    final reason = TextEditingController();
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Add staff leave', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 16),
              _DateButton(
                label: 'Starts',
                value: startsOn,
                onPressed: () async {
                  final picked = await showDatePicker(context: context, firstDate: DateTime.now(), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: startsOn);
                  if (picked != null) setState(() { startsOn = picked; if (endsOn.isBefore(startsOn)) endsOn = picked; });
                },
              ),
              const SizedBox(height: 10),
              _DateButton(
                label: 'Ends',
                value: endsOn,
                onPressed: () async {
                  final picked = await showDatePicker(context: context, firstDate: startsOn, lastDate: startsOn.add(const Duration(days: 89)), initialDate: endsOn.isBefore(startsOn) ? startsOn : endsOn);
                  if (picked != null) setState(() => endsOn = picked);
                },
              ),
              const SizedBox(height: 12),
              TextField(controller: reason, maxLength: 300, decoration: const InputDecoration(labelText: 'Reason (optional)', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () async {
                  try {
                    await controller.createWorkforceLeave(assignmentId: assignmentId, startsOn: startsOn, endsOn: endsOn, reason: reason.text);
                    if (sheetContext.mounted) Navigator.pop(sheetContext, true);
                  } catch (error) {
                    if (sheetContext.mounted) ScaffoldMessenger.of(sheetContext).showSnackBar(SnackBar(content: Text(error.toString())));
                  }
                },
                child: const Text('SAVE LEAVE'),
              ),
            ],
          ),
        ),
      ),
    );
    reason.dispose();
    if (submitted == true && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave saved.')));
  }

  Future<void> _openRatingSheet(BuildContext context, String assignmentId, Map<String, dynamic>? current) async {
    var score = int.tryParse(current?['score']?.toString() ?? '') ?? 5;
    final comment = TextEditingController(text: current?['comment']?.toString() ?? '');
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setState) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Rate household staff', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (index) {
                  final value = index + 1;
                  return IconButton(
                    onPressed: () => setState(() => score = value),
                    iconSize: 34,
                    icon: Icon(value <= score ? Icons.star_rounded : Icons.star_border_rounded),
                  );
                }),
              ),
              const SizedBox(height: 8),
              TextField(controller: comment, maxLength: 300, maxLines: 3, decoration: const InputDecoration(labelText: 'Comment (optional)', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () async {
                  try {
                    await controller.rateWorkforce(assignmentId, score: score, comment: comment.text);
                    if (sheetContext.mounted) Navigator.pop(sheetContext, true);
                  } catch (error) {
                    if (sheetContext.mounted) ScaffoldMessenger.of(sheetContext).showSnackBar(SnackBar(content: Text(error.toString())));
                  }
                },
                child: const Text('SAVE RATING'),
              ),
            ],
          ),
        ),
      ),
    );
    comment.dispose();
    if (submitted == true && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rating saved.')));
  }

  Future<void> _confirmCancelLeave(BuildContext context, String leaveId) async {
    if (leaveId.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel leave?'),
        content: const Text('This will make the staff member eligible for gate entry again for those dates.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('KEEP')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('CANCEL LEAVE')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await controller.cancelWorkforceLeave(leaveId);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave cancelled.')));
    } catch (error) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();
    if (parts.isEmpty) return 'S';
    return parts.take(2).map((part) => part[0].toUpperCase()).join();
  }

  static String _friendly(String value) => value
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0]}${part.substring(1).toLowerCase()}')
      .join(' ');
}

class _PresencePill extends StatelessWidget {
  const _PresencePill({required this.present});
  final bool present;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: present ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(present ? 'INSIDE' : 'OUTSIDE', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Chip(avatar: Icon(icon, size: 16), label: Text(label));
}

class _LeaveRow extends StatelessWidget {
  const _LeaveRow({required this.leave, required this.onCancel});
  final Map<String, dynamic> leave;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(Icons.event_busy_outlined, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text('${_compactDate(leave['startsOn'])} → ${_compactDate(leave['endsOn'])}${leave['reason'] == null ? '' : ' · ${leave['reason']}'}'),
          ),
          IconButton(onPressed: onCancel, tooltip: 'Cancel leave', icon: const Icon(Icons.close_rounded)),
        ],
      ),
    );
  }

  static String _compactDate(dynamic raw) {
    final parsed = DateTime.tryParse(raw?.toString() ?? '');
    if (parsed == null) return raw?.toString() ?? '-';
    return '${parsed.day}/${parsed.month}/${parsed.year}';
  }
}

class _DateButton extends StatelessWidget {
  const _DateButton({required this.label, required this.value, required this.onPressed});
  final String label;
  final DateTime value;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.calendar_today_outlined),
        label: Align(alignment: Alignment.centerLeft, child: Text('$label · ${value.day}/${value.month}/${value.year}')),
      );
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.icon, required this.title, required this.message});
  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Icon(icon, size: 36),
              const SizedBox(height: 12),
              Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Text(message, textAlign: TextAlign.center),
            ],
          ),
        ),
      );
}
