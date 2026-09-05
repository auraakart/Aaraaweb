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

  String _unitLabel(Map<String, dynamic> unit) {
    final building = unit['building'] is Map ? Map<String, dynamic>.from(unit['building'] as Map) : const <String, dynamic>{};
    return '${building['name'] ?? building['code'] ?? 'Building'} · ${unit['number'] ?? 'Unit'}';
  }

  Future<void> _walkIn() async {
    final c = widget.controller;
    if (c.units.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No occupied units are available.')));
      return;
    }
    final name = TextEditingController();
    final phone = TextEditingController();
    final purpose = TextEditingController();
    String? unitId = c.units.first['id']?.toString();
    final submit = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Walk-in visitor'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  value: unitId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Destination'),
                  items: c.units.map((unit) => DropdownMenuItem(value: unit['id']?.toString(), child: Text(_unitLabel(unit), overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (value) => setDialogState(() => unitId = value),
                ),
                const SizedBox(height: 12),
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Visitor name')),
                const SizedBox(height: 12),
                TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
                const SizedBox(height: 12),
                TextField(controller: purpose, decoration: const InputDecoration(labelText: 'Purpose')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Send for approval')),
          ],
        ),
      ),
    );
    if (submit != true || unitId == null || name.text.trim().isEmpty) return;
    await c.createWalkIn(
      unitId: unitId!,
      name: name.text.trim(),
      phone: phone.text.trim().isEmpty ? null : phone.text.trim(),
      purpose: purpose.text.trim().isEmpty ? null : purpose.text.trim(),
    );
  }

  Future<void> _quickArrival(String type) async {
    final c = widget.controller;
    if (c.units.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No occupied units are available.')));
      return;
    }
    final isCab = type == 'CAB';
    final name = TextEditingController(text: isCab ? 'Cab driver' : 'Delivery partner');
    final provider = TextEditingController();
    final vehicle = TextEditingController();
    final phone = TextEditingController();
    String? unitId = c.units.first['id']?.toString();
    final submit = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(isCab ? 'Cab arrival' : 'Delivery'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  value: unitId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Destination'),
                  items: c.units.map((unit) => DropdownMenuItem(value: unit['id']?.toString(), child: Text(_unitLabel(unit), overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (value) => setDialogState(() => unitId = value),
                ),
                const SizedBox(height: 12),
                TextField(controller: provider, decoration: InputDecoration(labelText: isCab ? 'Cab app (Uber/Ola/Rapido)' : 'Provider (Swiggy/Zomato/Amazon)')),
                const SizedBox(height: 12),
                TextField(controller: name, decoration: InputDecoration(labelText: isCab ? 'Driver name' : 'Delivery person')),
                const SizedBox(height: 12),
                TextField(controller: vehicle, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: isCab ? 'Vehicle number' : 'Vehicle number (optional)')),
                const SizedBox(height: 12),
                TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone (optional)')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('ASK RESIDENT')),
          ],
        ),
      ),
    );
    if (submit != true || unitId == null || name.text.trim().isEmpty) return;
    await c.createGateArrival(
      unitId: unitId!,
      subjectType: type,
      name: name.text.trim(),
      provider: provider.text.trim().isEmpty ? null : provider.text.trim(),
      phone: phone.text.trim().isEmpty ? null : phone.text.trim(),
      vehicleNumber: vehicle.text.trim().isEmpty ? null : vehicle.text.trim(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final access = c.verifiedAccess;
    final status = access?['status']?.toString();
    final gateRequest = c.walkInAccess;
    final gateRequestStatus = gateRequest?['status']?.toString();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Gate Operations', style: TextStyle(fontWeight: FontWeight.w900)),
        actions: [IconButton(onPressed: c.busy ? null : c.signOut, tooltip: 'Sign out', icon: const Icon(Icons.logout_rounded))],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: c.loadGates,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
            children: [
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  leading: const CircleAvatar(radius: 25, child: Icon(Icons.security_rounded, size: 28)),
                  title: const Text('Security shift active', style: TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: Text(c.gateName ?? 'Select your gate'),
                  trailing: const Icon(Icons.circle, size: 12),
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: c.gateId,
                decoration: const InputDecoration(labelText: 'Active gate', prefixIcon: Icon(Icons.door_front_door_outlined)),
                items: c.gates.map((gate) => DropdownMenuItem(value: gate['id']?.toString(), child: Text((gate['name'] ?? gate['code'] ?? 'Gate').toString()))).toList(),
                onChanged: c.busy ? null : c.selectGate,
              ),
              const SizedBox(height: 18),
              Row(children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: c.busy || c.gateId == null ? null : () => _quickArrival('DELIVERY'),
                    icon: const Icon(Icons.delivery_dining_rounded),
                    label: const Text('DELIVERY', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(68)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.tonalIcon(
                    onPressed: c.busy || c.gateId == null ? null : () => _quickArrival('CAB'),
                    icon: const Icon(Icons.local_taxi_rounded),
                    label: const Text('CAB', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(68)),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: c.busy || c.gateId == null ? null : _walkIn,
                icon: const Icon(Icons.person_add_alt_1_rounded),
                label: const Text('WALK-IN VISITOR', style: TextStyle(fontWeight: FontWeight.w900)),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(58)),
              ),
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
              const SizedBox(height: 20),
              const Divider(),
              const SizedBox(height: 14),
              Text('Pre-approved pass', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: c.busy || c.gateId == null ? null : _scan,
                icon: const Icon(Icons.qr_code_scanner_rounded, size: 32),
                label: const Text('SCAN QR', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(72)),
              ),
              const SizedBox(height: 12),
              TextField(controller: credential, decoration: const InputDecoration(labelText: 'Manual credential', prefixIcon: Icon(Icons.keyboard_alt_outlined))),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: c.busy || c.gateId == null ? null : () => c.verifyCredential(credential.text),
                icon: const Icon(Icons.verified_user_outlined),
                label: const Text('VERIFY', style: TextStyle(fontWeight: FontWeight.w800)),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
              ),
              if (c.busy) ...[
                const SizedBox(height: 14),
                const GuardStateCard(icon: Icons.sync_rounded, message: 'Processing gate operation…', loading: true),
              ],
              if (c.error != null) ...[
                const SizedBox(height: 12),
                GuardStateCard(icon: Icons.error_outline_rounded, message: c.error!, error: true),
              ],
              if (access != null) ...[
                const SizedBox(height: 18),
                _AccessResultCard(access: access),
                const SizedBox(height: 14),
                Row(children: [
                  Expanded(child: FilledButton.icon(onPressed: c.busy || status == 'CHECKED_IN' || status == 'CHECKED_OUT' ? null : () => c.checkIn(credential.text), icon: const Icon(Icons.login_rounded), label: const Text('ENTER', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(68)))),
                  const SizedBox(width: 10),
                  Expanded(child: OutlinedButton.icon(onPressed: c.busy || status != 'CHECKED_IN' ? null : () => c.checkOut(credential.text), icon: const Icon(Icons.logout_rounded), label: const Text('EXIT', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(68)))),
                ]),
              ],
              const SizedBox(height: 22),
              Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [ListTile(contentPadding: EdgeInsets.zero, leading: Icon(c.queuedActions == 0 ? Icons.cloud_done_outlined : Icons.cloud_off_outlined), title: Text(c.queuedActions == 0 ? 'Online operations clear' : '${c.queuedActions} offline actions pending', style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text(c.offlineSyncMessage ?? (c.queuedActions == 0 ? 'No locally queued gate actions.' : 'Stored securely for supervisor review and safe sync.'))), if (c.queuedActions > 0) OutlinedButton.icon(onPressed: c.busy ? null : c.retryQueuedActions, icon: const Icon(Icons.sync_rounded), label: const Text('RETRY SAFE SYNC'))]))),
            ],
          ),
        ),
      ),
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
    final status = access['status']?.toString() ?? 'PENDING';
    final waiting = status == 'PENDING';
    final denied = status == 'DENIED' || status == 'CANCELLED';
    final title = access['subjectName']?.toString() ?? 'Gate arrival';
    final type = access['subjectType']?.toString().replaceAll('_', ' ') ?? 'VISITOR';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Icon(denied ? Icons.block_rounded : waiting ? Icons.hourglass_top_rounded : Icons.verified_rounded, size: 30), const SizedBox(width: 10), Expanded(child: Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)))]),
          const SizedBox(height: 6),
          Text(type, style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(waiting ? 'Waiting for resident approval' : status.replaceAll('_', ' '), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          if (waiting) OutlinedButton.icon(onPressed: busy ? null : onRefresh, icon: const Icon(Icons.refresh_rounded), label: const Text('CHECK APPROVAL')),
          if (onEnter != null) FilledButton.icon(onPressed: busy ? null : onEnter, icon: const Icon(Icons.login_rounded), label: const Text('APPROVED — ENTER')),
          if (onExit != null) OutlinedButton.icon(onPressed: busy ? null : onExit, icon: const Icon(Icons.logout_rounded), label: const Text('EXIT')),
          if (onDone != null) TextButton(onPressed: busy ? null : onDone, child: const Text('CLOSE')),
        ]),
      ),
    );
  }
}

class _AccessResultCard extends StatelessWidget {
  const _AccessResultCard({required this.access});
  final Map<String, dynamic> access;

  @override
  Widget build(BuildContext context) {
    final status = access['status']?.toString() ?? 'UNKNOWN';
    final positive = status == 'APPROVED' || status == 'CHECKED_IN';
    final subject = access['subjectName']?.toString() ?? 'Access holder';
    final type = access['subjectType']?.toString().replaceAll('_', ' ') ?? 'ACCESS';
    return Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [CircleAvatar(radius: 26, backgroundColor: positive ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.errorContainer, child: Icon(positive ? Icons.check_rounded : Icons.block_rounded, size: 30)), const SizedBox(width: 12), Expanded(child: Text(subject, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)))]),
      const SizedBox(height: 14), Text(type, style: const TextStyle(fontWeight: FontWeight.w800)), const SizedBox(height: 8), Text(status.replaceAll('_', ' '), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: positive ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.error)),
    ])));
  }
}
