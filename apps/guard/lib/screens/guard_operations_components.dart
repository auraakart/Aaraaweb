part of 'guard_operations_screen.dart';

class _WalkInInput {
  const _WalkInInput({required this.unitId, required this.name, this.phone, this.purpose});
  final String unitId;
  final String name;
  final String? phone;
  final String? purpose;
}

class _WalkInSheet extends StatefulWidget {
  const _WalkInSheet({required this.units});
  final List<Map<String, dynamic>> units;

  @override
  State<_WalkInSheet> createState() => _WalkInSheetState();
}

class _WalkInSheetState extends State<_WalkInSheet> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _purpose = TextEditingController();
  late String? _unitId;

  @override
  void initState() {
    super.initState();
    _unitId = widget.units.first['id']?.toString();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _purpose.dispose();
    super.dispose();
  }

  void _submit() {
    final unitId = _unitId;
    final name = _name.text.trim();
    if (unitId == null || name.isEmpty) return;
    Navigator.pop(context, _WalkInInput(unitId: unitId, name: name, phone: _optional(_phone.text), purpose: _optional(_purpose.text)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Walk-in visitor', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text('Choose the destination and send the arrival to the resident for approval.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            initialValue: _unitId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Destination', prefixIcon: Icon(Icons.apartment_rounded)),
            items: widget.units.map((unit) => DropdownMenuItem(value: unit['id']?.toString(), child: Text(_unitLabel(unit), overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (value) => setState(() => _unitId = value),
          ),
          const SizedBox(height: 12),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Visitor name', prefixIcon: Icon(Icons.person_outline_rounded))),
          const SizedBox(height: 12),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone', prefixIcon: Icon(Icons.phone_outlined))),
          const SizedBox(height: 12),
          TextField(controller: _purpose, textCapitalization: TextCapitalization.sentences, onSubmitted: (_) => _submit(), decoration: const InputDecoration(labelText: 'Purpose', prefixIcon: Icon(Icons.notes_rounded))),
          const SizedBox(height: 20),
          SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: _submit, icon: const Icon(Icons.notifications_active_outlined), label: const Text('Send for approval'))),
        ],
      ),
    );
  }
}

class _QuickArrivalInput {
  const _QuickArrivalInput({required this.unitId, required this.name, this.provider, this.phone, this.vehicleNumber});
  final String unitId;
  final String name;
  final String? provider;
  final String? phone;
  final String? vehicleNumber;
}

class _QuickArrivalSheet extends StatefulWidget {
  const _QuickArrivalSheet({required this.units, required this.isCab});
  final List<Map<String, dynamic>> units;
  final bool isCab;

  @override
  State<_QuickArrivalSheet> createState() => _QuickArrivalSheetState();
}

class _QuickArrivalSheetState extends State<_QuickArrivalSheet> {
  late final TextEditingController _name;
  final _provider = TextEditingController();
  final _vehicle = TextEditingController();
  final _phone = TextEditingController();
  late String? _unitId;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.isCab ? 'Cab driver' : 'Delivery partner');
    _unitId = widget.units.first['id']?.toString();
  }

  @override
  void dispose() {
    _name.dispose();
    _provider.dispose();
    _vehicle.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _submit() {
    final unitId = _unitId;
    final name = _name.text.trim();
    if (unitId == null || name.isEmpty) return;
    Navigator.pop(
      context,
      _QuickArrivalInput(
        unitId: unitId,
        name: name,
        provider: _optional(_provider.text),
        phone: _optional(_phone.text),
        vehicleNumber: _optional(_vehicle.text),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.isCab ? 'Cab arrival' : 'Delivery arrival', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text('Capture only the details needed for a fast resident approval.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            initialValue: _unitId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Destination', prefixIcon: Icon(Icons.apartment_rounded)),
            items: widget.units.map((unit) => DropdownMenuItem(value: unit['id']?.toString(), child: Text(_unitLabel(unit), overflow: TextOverflow.ellipsis))).toList(),
            onChanged: (value) => setState(() => _unitId = value),
          ),
          const SizedBox(height: 12),
          TextField(controller: _provider, decoration: InputDecoration(labelText: widget.isCab ? 'Cab app (Uber/Ola/Rapido)' : 'Provider (Swiggy/Zomato/Amazon)', prefixIcon: Icon(widget.isCab ? Icons.local_taxi_outlined : Icons.storefront_outlined))),
          const SizedBox(height: 12),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: widget.isCab ? 'Driver name' : 'Delivery person', prefixIcon: const Icon(Icons.person_outline_rounded))),
          const SizedBox(height: 12),
          TextField(controller: _vehicle, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: widget.isCab ? 'Vehicle number' : 'Vehicle number (optional)', prefixIcon: const Icon(Icons.directions_car_outlined))),
          const SizedBox(height: 12),
          TextField(controller: _phone, keyboardType: TextInputType.phone, onSubmitted: (_) => _submit(), decoration: const InputDecoration(labelText: 'Phone (optional)', prefixIcon: Icon(Icons.phone_outlined))),
          const SizedBox(height: 20),
          SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: _submit, icon: const Icon(Icons.notifications_active_outlined), label: const Text('ASK RESIDENT'))),
        ],
      ),
    );
  }
}

String? _optional(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

class _SyncHealthCard extends StatelessWidget {
  const _SyncHealthCard({required this.controller, required this.strings});
  final GuardController controller;
  final GuardStrings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final pending = controller.queuedActions > 0;
    return GuardOperationSurface(
      semanticLabel: pending ? '${controller.queuedActions} ${strings.get('pendingActions')}' : strings.get('onlineClear'),
      color: pending ? scheme.errorContainer.withValues(alpha: .62) : scheme.surfaceContainerLow,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(width: 44, height: 44, decoration: BoxDecoration(color: pending ? scheme.errorContainer : scheme.primaryContainer, borderRadius: BorderRadius.circular(14)), child: Icon(pending ? Icons.cloud_off_outlined : Icons.cloud_done_outlined, color: pending ? scheme.onErrorContainer : scheme.onPrimaryContainer)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(pending ? '${controller.queuedActions} ${strings.get('pendingActions')}' : strings.get('onlineClear'), style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            Text(controller.offlineSyncMessage ?? (pending ? strings.get('reviewRequired') : strings.get('noQueuedActions')), style: theme.textTheme.bodySmall?.copyWith(color: pending ? scheme.onErrorContainer : scheme.onSurfaceVariant)),
          ])),
          GuardStatusPill(label: pending ? 'OFFLINE' : 'SYNCED', tone: pending ? GuardStatusTone.offline : GuardStatusTone.ready),
        ]),
        if (pending) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: controller.busy ? null : controller.retryQueuedActions, icon: const Icon(Icons.sync_rounded), label: const Text('RETRY SAFE SYNC')),
        ],
      ]),
    );
  }
}

class _GateApprovalCard extends StatelessWidget {
  const _GateApprovalCard({required this.access, required this.busy, required this.onRefresh, this.onEnter, this.onExit, this.onDone});
  final Map<String, dynamic> access;
  final bool busy;
  final VoidCallback onRefresh;
  final VoidCallback? onEnter;
  final VoidCallback? onExit;
  final VoidCallback? onDone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = access['status']?.toString() ?? 'PENDING';
    final waiting = status == 'PENDING';
    final denied = status == 'DENIED' || status == 'CANCELLED';
    final title = access['subjectName']?.toString() ?? 'Gate arrival';
    final type = access['subjectType']?.toString().replaceAll('_', ' ') ?? 'VISITOR';
    final background = waiting ? scheme.secondaryContainer.withValues(alpha: .55) : denied ? scheme.errorContainer : scheme.surfaceContainerLow;
    return GuardOperationSurface(
      color: background,
      prominent: waiting,
      semanticLabel: '$title, $type, ${waiting ? 'waiting for resident approval' : status}',
      padding: const EdgeInsets.all(18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(denied ? Icons.block_rounded : waiting ? Icons.hourglass_top_rounded : Icons.verified_rounded, size: 30),
          const SizedBox(width: 10),
          Expanded(child: Text(title, style: theme.textTheme.titleLarge)),
          GuardStatusPill(
            label: waiting ? 'WAITING' : status.replaceAll('_', ' '),
            tone: denied ? GuardStatusTone.blocked : waiting ? GuardStatusTone.waiting : GuardStatusTone.ready,
          ),
        ]),
        const SizedBox(height: 6),
        Text(type, style: theme.textTheme.labelLarge),
        const SizedBox(height: 8),
        Text(waiting ? 'Waiting for resident approval' : status.replaceAll('_', ' '), style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 14),
        if (waiting) OutlinedButton.icon(onPressed: busy ? null : onRefresh, icon: const Icon(Icons.refresh_rounded), label: const Text('CHECK APPROVAL')),
        if (onEnter != null) FilledButton.icon(onPressed: busy ? null : onEnter, icon: const Icon(Icons.login_rounded), label: const Text('APPROVED — ENTER')),
        if (onExit != null) OutlinedButton.icon(onPressed: busy ? null : onExit, icon: const Icon(Icons.logout_rounded), label: const Text('EXIT')),
        if (onDone != null) TextButton(onPressed: busy ? null : onDone, child: const Text('CLOSE')),
      ]),
    );
  }
}

class _AccessResultCard extends StatelessWidget {
  const _AccessResultCard({required this.access, required this.controller});
  final Map<String, dynamic> access;
  final GuardController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = access['status']?.toString() ?? 'UNKNOWN';
    final positive = status == 'APPROVED' || status == 'CHECKED_IN';
    final subject = access['subjectName']?.toString() ?? 'Access holder';
    final type = access['subjectType']?.toString().replaceAll('_', ' ') ?? 'ACCESS';
    return GuardOperationSurface(
      semanticLabel: '$subject, $type, ${status.replaceAll('_', ' ')}',
      color: positive ? scheme.primaryContainer.withValues(alpha: .5) : scheme.errorContainer,
      prominent: true,
      padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 52, height: 52, decoration: BoxDecoration(color: positive ? scheme.primaryContainer : scheme.errorContainer, borderRadius: BorderRadius.circular(16)), child: Icon(positive ? Icons.check_rounded : Icons.block_rounded, size: 30, color: positive ? scheme.onPrimaryContainer : scheme.onErrorContainer)),
            const SizedBox(width: 12),
            Expanded(child: Text(subject, style: theme.textTheme.titleLarge)),
            if (controller.voiceEnabled) IconButton(onPressed: controller.announceAccessResult, tooltip: 'Speak status', icon: const Icon(Icons.volume_up_rounded)),
            GuardStatusPill(label: status.replaceAll('_', ' '), tone: positive ? GuardStatusTone.ready : GuardStatusTone.blocked),
          ]),
          const SizedBox(height: 12),
          Text(type, style: theme.textTheme.labelLarge),
        ]),
    );
  }
}
