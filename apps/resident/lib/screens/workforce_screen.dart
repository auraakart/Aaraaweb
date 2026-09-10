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
                  onPressed: controller.households.isEmpty ? null : () => _openAddSheet(context),
                  tooltip: 'Add household staff',
                  icon: const Icon(Icons.person_add_alt_1_rounded),
                ),
                const SizedBox(width: 8),
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

  Future<void> _openAddSheet(BuildContext context) async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddWorkforceSheet(controller: controller),
    );
    if (submitted == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Staff assignment submitted for society review.')));
    }
  }
}

class _AddWorkforceSheet extends StatefulWidget {
  const _AddWorkforceSheet({required this.controller});
  final ResidentDataController controller;

  @override
  State<_AddWorkforceSheet> createState() => _AddWorkforceSheetState();
}

class _AddWorkforceSheetState extends State<_AddWorkforceSheet> {
  final _name = TextEditingController();
  final _phone = TextEditingController(text: '+91');
  late String _householdId;
  String _role = 'MAID';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _householdId = widget.controller.households.isEmpty
        ? ''
        : widget.controller.households.first['id']?.toString() ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    if (_householdId.isEmpty || _name.text.trim().isEmpty || _phone.text.trim().length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a household, name and valid mobile number.')));
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.controller.addWorkforce(
        householdId: _householdId,
        name: _name.text,
        phone: _phone.text,
        role: _role,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Add household staff', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _householdId,
            decoration: const InputDecoration(labelText: 'Household', border: OutlineInputBorder()),
            items: widget.controller.households.map((household) {
              final id = household['id']?.toString() ?? '';
              final unit = household['unit'] is Map
                  ? Map<String, dynamic>.from(household['unit'] as Map)
                  : const <String, dynamic>{};
              return DropdownMenuItem(value: id, child: Text(unit['number']?.toString() ?? 'Household'));
            }).where((item) => item.value?.isNotEmpty == true).toList(),
            onChanged: _busy ? null : (value) => setState(() => _householdId = value ?? ''),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _name,
            enabled: !_busy,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Full name', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _phone,
            enabled: !_busy,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Mobile number', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: _role,
            decoration: const InputDecoration(labelText: 'Role', border: OutlineInputBorder()),
            items: const ['MAID', 'COOK', 'DRIVER', 'NANNY', 'OTHER']
                .map((value) => DropdownMenuItem(value: value, child: Text(_StaffCard._friendly(value))))
                .toList(),
            onChanged: _busy ? null : (value) => setState(() => _role = value ?? 'OTHER'),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('SUBMIT FOR REVIEW'),
          ),
        ],
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
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: assignmentId.isEmpty ? null : () => _confirmDeactivate(context, assignmentId),
              icon: const Icon(Icons.person_remove_outlined),
              label: const Text('END ASSIGNMENT'),
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
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WorkforceLeaveSheet(controller: controller, assignmentId: assignmentId),
    );
    if (submitted == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave saved.')));
    }
  }

  Future<void> _openRatingSheet(BuildContext context, String assignmentId, Map<String, dynamic>? current) async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _WorkforceRatingSheet(controller: controller, assignmentId: assignmentId, current: current),
    );
    if (submitted == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rating saved.')));
    }
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

  Future<void> _confirmDeactivate(BuildContext context, String assignmentId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('End staff assignment?'),
        content: const Text('The staff member will no longer be eligible for this household. Existing history remains available.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('KEEP')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('END ASSIGNMENT')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await controller.deactivateWorkforce(assignmentId);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Staff assignment ended.')));
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

class _WorkforceLeaveSheet extends StatefulWidget {
  const _WorkforceLeaveSheet({required this.controller, required this.assignmentId});
  final ResidentDataController controller;
  final String assignmentId;

  @override
  State<_WorkforceLeaveSheet> createState() => _WorkforceLeaveSheetState();
}

class _WorkforceLeaveSheetState extends State<_WorkforceLeaveSheet> {
  final _reason = TextEditingController();
  DateTime _startsOn = DateTime.now();
  DateTime _endsOn = DateTime.now();
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.controller.createWorkforceLeave(
        assignmentId: widget.assignmentId,
        startsOn: _startsOn,
        endsOn: _endsOn,
        reason: _reason.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Add staff leave', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          _DateButton(
            label: 'Starts',
            value: _startsOn,
            onPressed: _busy
                ? null
                : () async {
                    final picked = await showDatePicker(
                      context: context,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                      initialDate: _startsOn,
                    );
                    if (picked != null && mounted) {
                      setState(() {
                        _startsOn = picked;
                        if (_endsOn.isBefore(_startsOn)) _endsOn = picked;
                      });
                    }
                  },
          ),
          const SizedBox(height: 10),
          _DateButton(
            label: 'Ends',
            value: _endsOn,
            onPressed: _busy
                ? null
                : () async {
                    final picked = await showDatePicker(
                      context: context,
                      firstDate: _startsOn,
                      lastDate: _startsOn.add(const Duration(days: 89)),
                      initialDate: _endsOn.isBefore(_startsOn) ? _startsOn : _endsOn,
                    );
                    if (picked != null && mounted) setState(() => _endsOn = picked);
                  },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            enabled: !_busy,
            maxLength: 300,
            decoration: const InputDecoration(labelText: 'Reason (optional)', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('SAVE LEAVE'),
          ),
        ],
      ),
    );
  }
}

class _WorkforceRatingSheet extends StatefulWidget {
  const _WorkforceRatingSheet({required this.controller, required this.assignmentId, required this.current});
  final ResidentDataController controller;
  final String assignmentId;
  final Map<String, dynamic>? current;

  @override
  State<_WorkforceRatingSheet> createState() => _WorkforceRatingSheetState();
}

class _WorkforceRatingSheetState extends State<_WorkforceRatingSheet> {
  late final TextEditingController _comment;
  late int _score;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _score = int.tryParse(widget.current?['score']?.toString() ?? '') ?? 5;
    _comment = TextEditingController(text: widget.current?['comment']?.toString() ?? '');
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.controller.rateWorkforce(widget.assignmentId, score: _score, comment: _comment.text);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
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
                onPressed: _busy ? null : () => setState(() => _score = value),
                iconSize: 34,
                icon: Icon(value <= _score ? Icons.star_rounded : Icons.star_border_rounded),
              );
            }),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _comment,
            enabled: !_busy,
            maxLength: 300,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Comment (optional)', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('SAVE RATING'),
          ),
        ],
      ),
    );
  }
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
  final VoidCallback? onPressed;

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
