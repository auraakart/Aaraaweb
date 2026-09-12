import 'package:flutter/material.dart';
import '../guard_controller.dart';
import '../qr_scanner.dart';
import '../widgets/guard_state_card.dart';

class GuardOperationsScreen extends StatefulWidget {
  const GuardOperationsScreen({super.key, required this.controller});
  final GuardController controller;

  @override
  State<GuardOperationsScreen> createState() => _GuardOperationsScreenState();
}

class _GuardOperationsScreenState extends State<GuardOperationsScreen> {
  final credential = TextEditingController();

  @override
  void dispose() {
    credential.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    final value = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const GuardQrScanner()));
    if (!mounted || value == null || value.trim().isEmpty) return;
    credential.text = value.trim();
    await widget.controller.verifyCredential(credential.text);
  }

  Future<void> _walkIn() async {
    final c = widget.controller;
    if (c.units.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No occupied units are available.')));
      return;
    }
    final input = await showModalBottomSheet<_WalkInInput>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _WalkInSheet(units: c.units),
    );
    if (input == null || !mounted) return;
    await c.createWalkIn(unitId: input.unitId, name: input.name, phone: input.phone, purpose: input.purpose);
  }

  Future<void> _quickArrival(String type) async {
    final c = widget.controller;
    if (c.units.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No occupied units are available.')));
      return;
    }
    final input = await showModalBottomSheet<_QuickArrivalInput>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _QuickArrivalSheet(units: c.units, isCab: type == 'CAB'),
    );
    if (input == null || !mounted) return;
    await c.createGateArrival(
      unitId: input.unitId,
      subjectType: type,
      name: input.name,
      provider: input.provider,
      phone: input.phone,
      vehicleNumber: input.vehicleNumber,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final access = c.verifiedAccess;
    final status = access?['status']?.toString();
    final gateRequest = c.walkInAccess;
    final gateRequestStatus = gateRequest?['status']?.toString();
    final gateReady = c.gateId != null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gate operations'),
        actions: [IconButton(onPressed: c.busy ? null : c.signOut, tooltip: 'Sign out', icon: const Icon(Icons.logout_rounded))],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: c.loadGates,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 104),
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: scheme.surfaceContainerLow, borderRadius: BorderRadius.circular(20)),
                child: Row(children: [
                  Container(width: 52, height: 52, decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(16)), child: Icon(Icons.security_rounded, color: scheme.onPrimaryContainer, size: 28)),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Security shift active', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(c.gateName ?? 'Select a gate to begin operations', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                  ])),
                  Icon(Icons.circle, size: 12, color: gateReady ? scheme.primary : scheme.outline),
                ]),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: c.gateId,
                decoration: const InputDecoration(labelText: 'Active gate', prefixIcon: Icon(Icons.door_front_door_outlined)),
                items: c.gates.map((gate) => DropdownMenuItem(value: gate['id']?.toString(), child: Text((gate['name'] ?? gate['code'] ?? 'Gate').toString()))).toList(),
                onChanged: c.busy ? null : c.selectGate,
              ),
              const SizedBox(height: 24),
              Text('Scan a pass', style: theme.textTheme.titleLarge),
              const SizedBox(height: 5),
              Text('Use QR first for the fastest verified entry.', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: c.busy || !gateReady ? null : _scan,
                icon: const Icon(Icons.qr_code_scanner_rounded, size: 32),
                label: const Text('SCAN QR', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(76)),
              ),
              const SizedBox(height: 12),
              ExpansionTile(
                tilePadding: const EdgeInsets.symmetric(horizontal: 4),
                childrenPadding: const EdgeInsets.only(bottom: 8),
                leading: const Icon(Icons.keyboard_alt_outlined),
                title: const Text('Enter credential manually', style: TextStyle(fontWeight: FontWeight.w800)),
                children: [
                  TextField(controller: credential, decoration: const InputDecoration(labelText: 'Manual credential', prefixIcon: Icon(Icons.key_outlined))),
                  const SizedBox(height: 10),
                  SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: c.busy || !gateReady ? null : () => c.verifyCredential(credential.text), icon: const Icon(Icons.verified_user_outlined), label: const Text('VERIFY'))),
                ],
              ),
              if (access != null) ...[
                const SizedBox(height: 14),
                _AccessResultCard(access: access),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: FilledButton.icon(onPressed: c.busy || status == 'CHECKED_IN' || status == 'CHECKED_OUT' ? null : () => c.checkIn(credential.text), icon: const Icon(Icons.login_rounded), label: const Text('ENTER', style: TextStyle(fontWeight: FontWeight.w900)))),
                  const SizedBox(width: 10),
                  Expanded(child: OutlinedButton.icon(onPressed: c.busy || status != 'CHECKED_IN' ? null : () => c.checkOut(credential.text), icon: const Icon(Icons.logout_rounded), label: const Text('EXIT', style: TextStyle(fontWeight: FontWeight.w900)))),
                ]),
              ],
              const SizedBox(height: 26),
              Text('Quick arrival', style: theme.textTheme.titleLarge),
              const SizedBox(height: 5),
              Text('Create an approval request when there is no pre-approved pass.', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: _QuickAction(icon: Icons.delivery_dining_rounded, label: 'DELIVERY', onPressed: c.busy || !gateReady ? null : () => _quickArrival('DELIVERY'))),
                const SizedBox(width: 10),
                Expanded(child: _QuickAction(icon: Icons.local_taxi_rounded, label: 'CAB', tonal: true, onPressed: c.busy || !gateReady ? null : () => _quickArrival('CAB'))),
              ]),
              const SizedBox(height: 10),
              SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: c.busy || !gateReady ? null : _walkIn, icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('WALK-IN VISITOR'))),
              if (gateRequest != null) ...[
                const SizedBox(height: 14),
                _GateApprovalCard(
                  access: gateRequest,
                  busy: c.busy,
                  onRefresh: c.refreshWalkIn,
                  onEnter: gateRequestStatus == 'APPROVED' ? c.checkInWalkIn : null,
                  onExit: gateRequestStatus == 'CHECKED_IN' ? c.checkOutWalkIn : null,
                  onDone: gateRequestStatus == 'DENIED' || gateRequestStatus == 'CHECKED_OUT' || gateRequestStatus == 'CANCELLED' ? c.clearWalkIn : null,
                ),
              ],
              if (c.busy) ...[
                const SizedBox(height: 14),
                const GuardStateCard(icon: Icons.sync_rounded, message: 'Processing gate operation…', loading: true),
              ],
              if (c.error != null) ...[
                const SizedBox(height: 12),
                GuardStateCard(icon: Icons.error_outline_rounded, message: c.error!, error: true),
              ],
              const SizedBox(height: 26),
              _SyncHealthCard(controller: c),
            ],
          ),
        ),
      ),
    );
  }
}

String _unitLabel(Map<String, dynamic> unit) {
  final building = unit['building'] is Map ? Map<String, dynamic>.from(unit['building'] as Map) : const <String, dynamic>{};
  return '${building['name'] ?? building['code'] ?? 'Building'} · ${unit['number'] ?? 'Unit'}';
}

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
            value: _unitId,
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
            value: _unitId,
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

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onPressed, this.tonal = false});
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool tonal;

  @override
  Widget build(BuildContext context) {
    if (tonal) {
      return FilledButton.tonalIcon(
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(68)),
      );
    }
    return FilledButton.icon(
      onPressed: onPressed,
      icon: Icon(icon),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(68)),
    );
  }
}

class _SyncHealthCard extends StatelessWidget {
  const _SyncHealthCard({required this.controller});
  final GuardController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final pending = controller.queuedActions > 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: pending ? scheme.errorContainer : scheme.surfaceContainerLow, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(width: 44, height: 44, decoration: BoxDecoration(color: pending ? scheme.errorContainer : scheme.primaryContainer, borderRadius: BorderRadius.circular(14)), child: Icon(pending ? Icons.cloud_off_outlined : Icons.cloud_done_outlined, color: pending ? scheme.onErrorContainer : scheme.onPrimaryContainer)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(pending ? '${controller.queuedActions} offline actions pending' : 'Online operations clear', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 2),
            Text(controller.offlineSyncMessage ?? (pending ? 'Stored securely for supervisor review and safe sync.' : 'No locally queued gate actions.'), style: theme.textTheme.bodySmall?.copyWith(color: pending ? scheme.onErrorContainer : scheme.onSurfaceVariant)),
          ])),
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
    final background = waiting ? scheme.secondaryContainer.withOpacity(.55) : denied ? scheme.errorContainer : scheme.surfaceContainerLow;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(denied ? Icons.block_rounded : waiting ? Icons.hourglass_top_rounded : Icons.verified_rounded, size: 30),
          const SizedBox(width: 10),
          Expanded(child: Text(title, style: theme.textTheme.titleLarge)),
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
  const _AccessResultCard({required this.access});
  final Map<String, dynamic> access;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = access['status']?.toString() ?? 'UNKNOWN';
    final positive = status == 'APPROVED' || status == 'CHECKED_IN';
    final subject = access['subjectName']?.toString() ?? 'Access holder';
    final type = access['subjectType']?.toString().replaceAll('_', ' ') ?? 'ACCESS';
    return Semantics(
      container: true,
      label: '$subject, $type, ${status.replaceAll('_', ' ')}',
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: positive ? scheme.primaryContainer.withOpacity(.5) : scheme.errorContainer, borderRadius: BorderRadius.circular(20)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 52, height: 52, decoration: BoxDecoration(color: positive ? scheme.primaryContainer : scheme.errorContainer, borderRadius: BorderRadius.circular(16)), child: Icon(positive ? Icons.check_rounded : Icons.block_rounded, size: 30, color: positive ? scheme.onPrimaryContainer : scheme.onErrorContainer)),
            const SizedBox(width: 12),
            Expanded(child: Text(subject, style: theme.textTheme.titleLarge)),
          ]),
          const SizedBox(height: 12),
          Text(type, style: theme.textTheme.labelLarge),
          const SizedBox(height: 6),
          Text(status.replaceAll('_', ' '), style: theme.textTheme.titleMedium?.copyWith(color: positive ? scheme.primary : scheme.error, fontWeight: FontWeight.w900)),
        ]),
      ),
    );
  }
}
