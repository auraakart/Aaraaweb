import 'package:flutter/material.dart';
import '../guard_controller.dart';
import '../localization/guard_strings.dart';
import '../theme/aaraagate_guard_theme.dart';
import '../qr_scanner.dart';
import '../widgets/guard_state_card.dart';
import '../widgets/guard_operation_ui.dart';

part 'guard_operations_components.dart';

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
    await widget.controller.announceAccessResult();
  }

  Future<void> _verifyManual() async {
    await widget.controller.verifyCredential(credential.text);
    await widget.controller.announceAccessResult();
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
    if (!await _screenArrival(name: input.name, phone: input.phone)) return;
    await c.createWalkIn(unitId: input.unitId, name: input.name, phone: input.phone, purpose: input.purpose);
  }

  Future<bool> _screenArrival({required String name, String? phone, String? vehicleNumber}) async {
    Map<String, dynamic> assessment;
    try {
      assessment = await widget.controller.assessArrival(name: name, phone: phone, vehicleNumber: vehicleNumber);
    } catch (_) {
      if (!mounted) return false;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Watchlist check unavailable'),
          content: const Text('Do not continue automatically. Retry the arrival or ask the security supervisor to review it.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('OK'))],
        ),
      );
      return false;
    }
    if (!mounted) return false;
    final decision = assessment['decision']?.toString() ?? 'CLEAR';
    if (decision == 'CLEAR') return true;
    final rawMatches = assessment['matches'];
    final matches = rawMatches is List ? rawMatches.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : const <Map<String, dynamic>>[];
    final reason = matches.isEmpty ? 'Active society watchlist match.' : (matches.first['reason']?.toString() ?? 'Active society watchlist match.');
    if (decision == 'DENY') {
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Watchlist deny match'),
          content: Text('$reason\n\nThis exact active match must be reviewed by the security supervisor. No resident approval request has been created.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('OK'))],
        ),
      );
      return false;
    }
    final proceed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Watchlist review'),
        content: Text('$reason\n\nThe match is advisory and has not changed access state. Continue to resident approval only after reviewing the details.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Continue to approval')),
        ],
      ),
    );
    return proceed == true;
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
    if (!await _screenArrival(name: input.name, phone: input.phone, vehicleNumber: input.vehicleNumber)) return;
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
    final strings = GuardStrings(c.languageCode);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final access = c.verifiedAccess;
    final status = access?['status']?.toString();
    final gateRequest = c.walkInAccess;
    final gateRequestStatus = gateRequest?['status']?.toString();
    final gateReady = c.gateId != null;

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.get('gateOperations')),
        actions: [IconButton(onPressed: c.busy ? null : c.signOut, tooltip: strings.get('signOut'), icon: const Icon(Icons.logout_rounded))],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: c.loadGates,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 104),
            children: [
              GuardOperationSurface(
                semanticLabel: gateReady ? 'Security shift active at ${c.gateName ?? 'selected gate'}' : 'No active gate selected',
                child: Row(children: [
                  Container(width: 52, height: 52, decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(16)), child: Icon(Icons.security_rounded, color: scheme.onPrimaryContainer, size: 28)),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(strings.get('securityShiftActive'), style: theme.textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(c.gateName ?? strings.get('selectGateBegin'), style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                  ])),
                  GuardStatusPill(label: gateReady ? 'READY' : 'SELECT GATE', tone: gateReady ? GuardStatusTone.ready : GuardStatusTone.waiting),
                ]),
              ),
              const SizedBox(height: AaraagateGuardTokens.space2),
              if (!gateReady)
                DropdownButtonFormField<String>(
                  initialValue: c.gateId,
                  decoration: InputDecoration(
                    labelText: strings.get('activeGate'),
                    prefixIcon: const Icon(Icons.door_front_door_outlined),
                  ),
                  items: c.gates
                      .map(
                        (gate) => DropdownMenuItem(
                          value: gate['id']?.toString(),
                          child: Text((gate['name'] ?? gate['code'] ?? 'Gate').toString()),
                        ),
                      )
                      .toList(),
                  onChanged: c.busy ? null : c.selectGate,
                )
              else
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(
                    bottom: AaraagateGuardTokens.space2,
                  ),
                  leading: const Icon(Icons.swap_horiz_rounded),
                  title: const Text(
                    'Change active gate',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(c.gateName ?? strings.get('activeGate')),
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: c.gateId,
                      decoration: InputDecoration(
                        labelText: strings.get('activeGate'),
                        prefixIcon: const Icon(Icons.door_front_door_outlined),
                      ),
                      items: c.gates
                          .map(
                            (gate) => DropdownMenuItem(
                              value: gate['id']?.toString(),
                              child: Text((gate['name'] ?? gate['code'] ?? 'Gate').toString()),
                            ),
                          )
                          .toList(),
                      onChanged: c.busy ? null : c.selectGate,
                    ),
                  ],
                ),
              const SizedBox(height: 24),
              Text(strings.get('scanPass'), style: theme.textTheme.titleLarge),
              const SizedBox(height: 5),
              Text(strings.get('scanHint'), style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: c.busy || !gateReady ? null : _scan,
                icon: const Icon(Icons.qr_code_scanner_rounded, size: 32),
                label: Text(strings.get('scanQr').toUpperCase(), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(76)),
              ),
              const SizedBox(height: 26),
              Text(strings.get('quickArrival'), style: theme.textTheme.titleLarge),
              const SizedBox(height: 5),
              Text('Create an approval request when there is no pre-approved pass.', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
              const SizedBox(height: AaraagateGuardTokens.space3),
              LayoutBuilder(
                builder: (context, constraints) {
                  final textScale = MediaQuery.textScalerOf(context).scale(1);
                  final columns = constraints.maxWidth >= 360 && textScale <= 1.2 ? 3 : 1;
                  final gap = AaraagateGuardTokens.space2;
                  final itemWidth =
                      (constraints.maxWidth - gap * (columns - 1)) / columns;
                  return Wrap(
                    spacing: gap,
                    runSpacing: gap,
                    children: [
                      SizedBox(
                        width: itemWidth,
                        child: GuardQuickAction(
                          icon: Icons.delivery_dining_rounded,
                          label: strings.get('delivery').toUpperCase(),
                          onTap: c.busy || !gateReady
                              ? null
                              : () => _quickArrival('DELIVERY'),
                        ),
                      ),
                      SizedBox(
                        width: itemWidth,
                        child: GuardQuickAction(
                          icon: Icons.local_taxi_rounded,
                          label: strings.get('cab').toUpperCase(),
                          tonal: true,
                          onTap: c.busy || !gateReady
                              ? null
                              : () => _quickArrival('CAB'),
                        ),
                      ),
                      SizedBox(
                        width: itemWidth,
                        child: GuardQuickAction(
                          icon: Icons.person_add_alt_1_rounded,
                          label: strings.get('walkInVisitor').toUpperCase(),
                          tonal: true,
                          onTap: c.busy || !gateReady ? null : _walkIn,
                        ),
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: AaraagateGuardTokens.space3),
              const SizedBox(height: 12),
              ExpansionTile(
                tilePadding: const EdgeInsets.symmetric(horizontal: 4),
                childrenPadding: const EdgeInsets.only(bottom: 8),
                leading: const Icon(Icons.keyboard_alt_outlined),
                title: Text(strings.get('enterCredential'), style: const TextStyle(fontWeight: FontWeight.w800)),
                children: [
                  TextField(controller: credential, decoration: InputDecoration(labelText: strings.get('manualCredential'), prefixIcon: const Icon(Icons.key_outlined))),
                  const SizedBox(height: 10),
                  SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: c.busy || !gateReady ? null : _verifyManual, icon: const Icon(Icons.verified_user_outlined), label: Text(strings.get('verify').toUpperCase()))),
                ],
              ),
              if (access != null) ...[
                const SizedBox(height: 14),
                _AccessResultCard(access: access, controller: c),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: FilledButton.icon(onPressed: c.busy || status == 'CHECKED_IN' || status == 'CHECKED_OUT' ? null : () => c.checkIn(credential.text), icon: const Icon(Icons.login_rounded), label: Text(strings.get('enter').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)))),
                  const SizedBox(width: 10),
                  Expanded(child: OutlinedButton.icon(onPressed: c.busy || status != 'CHECKED_IN' ? null : () => c.checkOut(credential.text), icon: const Icon(Icons.logout_rounded), label: Text(strings.get('exit').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)))),
                ]),
              ],
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
                GuardStateCard(icon: Icons.sync_rounded, message: strings.get('processing'), loading: true),
              ],
              if (c.error != null) ...[
                const SizedBox(height: 12),
                GuardStateCard(icon: Icons.error_outline_rounded, message: c.error!, error: true),
              ],
              const SizedBox(height: 26),
              _SyncHealthCard(controller: c, strings: strings),
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
