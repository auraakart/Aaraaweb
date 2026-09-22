import 'package:flutter/material.dart';
import '../guard_controller.dart';
import '../data/models/guard_boundary_models.dart';
import '../widgets/guard_state_card.dart';

class GuardParcelsScreen extends StatefulWidget {
  const GuardParcelsScreen({super.key, required this.controller});
  final GuardController controller;

  @override
  State<GuardParcelsScreen> createState() => _GuardParcelsScreenState();
}

class _GuardParcelsScreenState extends State<GuardParcelsScreen> {
  List<GuardParcel> _parcels = const [];
  List<GuardParcelRecipient> _recipients = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final values = await Future.wait([widget.controller.api.parcelDesk(), widget.controller.api.parcelRecipients()]);
      if (!mounted) return;
      setState(() {
        _parcels = values[0];
        _recipients = values[1];
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _intake() async {
    if (_recipients.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No current occupants are available for parcel intake.')));
      return;
    }
    final input = await showModalBottomSheet<_ParcelIntake>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ParcelIntakeSheet(recipients: _recipients),
    );
    if (input == null) return;
    await _run(() => widget.controller.api.intakeParcel(
      unitId: input.unitId,
      recipientUserId: input.userId,
      courierName: input.courier,
      trackingReference: input.tracking,
      notes: input.notes,
    ));
  }

  Future<void> _verify(GuardParcel parcel) async {
    final code = await _textDialog(title: 'Verify pickup code', label: '6-digit code', numeric: true);
    if (code == null) return;
    await _run(() => widget.controller.api.collectParcelWithCode(parcel.id, code));
  }

  Future<void> _remind(GuardParcel parcel) => _run(() => widget.controller.api.remindParcel(parcel.id));

  Future<void> _return(GuardParcel parcel) async {
    final reason = await _textDialog(title: 'Return parcel', label: 'Reason for return');
    if (reason == null || reason.trim().length < 3) return;
    await _run(() => widget.controller.api.returnParcel(parcel.id, reason));
  }

  Future<void> _run(Future<Object?> Function() action) async {
    setState(() { _loading = true; _error = null; });
    try {
      await action();
      await _load();
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<String?> _textDialog({required String title, required String label, bool numeric = false}) async {
    final input = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: input,
          autofocus: true,
          keyboardType: numeric ? TextInputType.number : TextInputType.text,
          maxLength: numeric ? 6 : 500,
          decoration: InputDecoration(labelText: label),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, input.text.trim()), child: const Text('Continue')),
        ],
      ),
    );
    input.dispose();
    return value;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Parcel desk')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _loading ? null : _intake,
        icon: const Icon(Icons.add_box_outlined),
        label: const Text('RECEIVE', style: TextStyle(fontWeight: FontWeight.w900)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 100),
          children: [
            Text('Uncollected parcels', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text('Verify resident pickup codes before handover. Overdue parcels can be reminded without exposing resident contact details.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 16),
            if (_loading && _parcels.isEmpty)
              const GuardStateCard(icon: Icons.sync_rounded, message: 'Loading parcel desk…', loading: true)
            else if (_error != null)
              GuardStateCard(icon: Icons.error_outline_rounded, message: _error!, error: true)
            else if (_parcels.isEmpty)
              const GuardStateCard(icon: Icons.inventory_2_outlined, message: 'No uncollected parcels at the desk.')
            else
              for (final parcel in _parcels) ...[
                _ParcelDeskCard(
                  parcel: parcel,
                  busy: _loading,
                  onVerify: () => _verify(parcel),
                  onRemind: parcel.overdue ? () => _remind(parcel) : null,
                  onReturn: () => _return(parcel),
                ),
                const SizedBox(height: 12),
              ],
            if (_loading && _parcels.isNotEmpty) const LinearProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class _ParcelDeskCard extends StatelessWidget {
  const _ParcelDeskCard({required this.parcel, required this.busy, required this.onVerify, required this.onRemind, required this.onReturn});
  final GuardParcel parcel;
  final bool busy;
  final VoidCallback onVerify;
  final VoidCallback? onRemind;
  final VoidCallback onReturn;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final overdue = parcel.overdue;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(child: Icon(overdue ? Icons.warning_amber_rounded : Icons.inventory_2_outlined)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${parcel.unitNumber} · ${parcel.recipientName}', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              Text(parcel.courierName ?? 'Courier not specified'),
              if (parcel.trackingReference != null) Text(parcel.trackingReference!, style: theme.textTheme.bodySmall),
            ])),
            if (overdue) const Chip(label: Text('OVERDUE')),
          ]),
          const SizedBox(height: 14),
          SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: busy ? null : onVerify, icon: const Icon(Icons.pin_outlined), label: const Text('VERIFY PICKUP CODE'))),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: busy ? null : onRemind, icon: const Icon(Icons.notifications_active_outlined), label: const Text('Remind'))),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton.icon(onPressed: busy ? null : onReturn, icon: const Icon(Icons.keyboard_return_rounded), label: const Text('Return'))),
          ]),
        ]),
      ),
    );
  }
}

class _ParcelIntake {
  const _ParcelIntake({required this.unitId, required this.userId, this.courier, this.tracking, this.notes});
  final String unitId;
  final String userId;
  final String? courier;
  final String? tracking;
  final String? notes;
}

class _ParcelIntakeSheet extends StatefulWidget {
  const _ParcelIntakeSheet({required this.recipients});
  final List<GuardParcelRecipient> recipients;

  @override
  State<_ParcelIntakeSheet> createState() => _ParcelIntakeSheetState();
}

class _ParcelIntakeSheetState extends State<_ParcelIntakeSheet> {
  late String _key;
  final _courier = TextEditingController();
  final _tracking = TextEditingController();
  final _notes = TextEditingController();

  @override
  void initState() {
    super.initState();
    _key = _keyFor(widget.recipients.first);
  }

  @override
  void dispose() {
    _courier.dispose();
    _tracking.dispose();
    _notes.dispose();
    super.dispose();
  }

  String _keyFor(GuardParcelRecipient row) => row.selectionKey;

  void _submit() {
    final match = widget.recipients.firstWhere((row) => _keyFor(row) == _key);
    Navigator.pop(context, _ParcelIntake(
      unitId: match.unitId,
      userId: match.userId,
      courier: _optional(_courier.text),
      tracking: _optional(_tracking.text),
      notes: _optional(_notes.text),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Receive parcel', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          value: _key,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Resident & unit', prefixIcon: Icon(Icons.apartment_rounded)),
          items: widget.recipients.map((row) => DropdownMenuItem(
            value: _keyFor(row),
            child: Text('${row.buildingLabel} · ${row.unitNumber} · ${row.name}', overflow: TextOverflow.ellipsis),
          )).toList(),
          onChanged: (value) { if (value != null) setState(() => _key = value); },
        ),
        const SizedBox(height: 12),
        TextField(controller: _courier, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Courier / provider', prefixIcon: Icon(Icons.local_shipping_outlined))),
        const SizedBox(height: 12),
        TextField(controller: _tracking, decoration: const InputDecoration(labelText: 'Tracking reference', prefixIcon: Icon(Icons.tag_outlined))),
        const SizedBox(height: 12),
        TextField(controller: _notes, maxLines: 2, decoration: const InputDecoration(labelText: 'Notes', prefixIcon: Icon(Icons.notes_rounded))),
        const SizedBox(height: 20),
        SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: _submit, icon: const Icon(Icons.notifications_active_outlined), label: const Text('Receive & notify resident'))),
      ]),
    );
  }
}

String? _optional(String value) => value.trim().isEmpty ? null : value.trim();
