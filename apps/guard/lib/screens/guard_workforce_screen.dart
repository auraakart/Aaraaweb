import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import '../data/guard_api.dart';
import '../data/workforce_offline_queue.dart';
import '../guard_controller.dart';
import '../widgets/guard_state_card.dart';

class GuardWorkforceScreen extends StatefulWidget {
  const GuardWorkforceScreen({super.key, required this.controller});
  final GuardController controller;

  @override
  State<GuardWorkforceScreen> createState() => _GuardWorkforceScreenState();
}

class _GuardWorkforceScreenState extends State<GuardWorkforceScreen> {
  final _search = TextEditingController();
  final _queue = const WorkforceOfflineQueue();
  List<Map<String, dynamic>> _workers = const [];
  int _queued = 0;
  bool _busy = false;
  String? _error;
  String? _syncMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (widget.controller.gateId == null) {
      setState(() => _error = 'Select an active gate first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _syncQueue();
      final results = await widget.controller.api.eligibleWorkforce(query: _search.text);
      if (!mounted) return;
      setState(() => _workers = results);
    } on GuardApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _syncQueue() async {
    final session = widget.controller.session;
    if (session == null) {
      if (mounted) {
        setState(() {
          _queued = 0;
          _syncMessage = null;
        });
      }
      return;
    }
    final all = await _queue.read();
    final pending = all.where((action) => action.belongsTo(societyId: session.societyId, guardUserId: session.userId)).toList(growable: false);
    final otherSessions = all.where((action) => !action.belongsTo(societyId: session.societyId, guardUserId: session.userId)).toList(growable: false);
    if (pending.isEmpty) {
      if (mounted) {
        setState(() {
          _queued = 0;
          _syncMessage = null;
        });
      }
      return;
    }
    final remaining = <QueuedWorkforceAction>[];
    var synced = 0;
    var rejected = 0;
    for (var index = 0; index < pending.length; index++) {
      final action = pending[index];
      try {
        if (action.type == 'CHECK_IN') {
          await widget.controller.api.workforceCheckIn(gateId: action.gateId, assignmentId: action.assignmentId, idempotencyKey: action.idempotencyKey);
        } else if (action.type == 'CHECK_OUT') {
          await widget.controller.api.workforceCheckOut(gateId: action.gateId, assignmentId: action.assignmentId, idempotencyKey: action.idempotencyKey);
        }
        synced++;
      } on GuardApiException catch (e) {
        if (e.transport) {
          remaining.addAll(pending.sublist(index));
          break;
        }
        remaining.add(action);
        rejected++;
      }
    }
    await _queue.replace([...otherSessions, ...remaining]);
    if (!mounted) return;
    setState(() {
      _queued = remaining.length;
      _syncMessage = remaining.isEmpty
          ? '$synced offline attendance ${synced == 1 ? 'action' : 'actions'} synced.'
          : rejected > 0
              ? '$synced synced; $rejected retained for supervisor review.'
              : 'Connectivity is still unavailable. ${remaining.length} attendance ${remaining.length == 1 ? 'action remains' : 'actions remain'} queued.';
    });
  }

  Future<void> _retrySync() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _syncQueue();
    } on GuardApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _idempotencyKey() {
    final random = Random.secure();
    final bytes = List<int>.generate(18, (_) => random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  Future<void> _mutate(Map<String, dynamic> assignment, String type) async {
    final gateId = widget.controller.gateId;
    final assignmentId = assignment['id']?.toString();
    if (gateId == null || assignmentId == null || assignmentId.isEmpty) return;
    final key = _idempotencyKey();
    final session = widget.controller.session;
    if (session == null) {
      setState(() => _error = 'Sign in is required to record workforce attendance.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (type == 'CHECK_IN') {
        await widget.controller.api.workforceCheckIn(gateId: gateId, assignmentId: assignmentId, idempotencyKey: key);
      } else {
        await widget.controller.api.workforceCheckOut(gateId: gateId, assignmentId: assignmentId, idempotencyKey: key);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(type == 'CHECK_IN' ? 'Worker checked in' : 'Worker checked out')));
      await _load();
    } on GuardApiException catch (e) {
      if (!e.transport) {
        if (mounted) setState(() => _error = e.message);
        return;
      }
      await _queue.enqueue(QueuedWorkforceAction(
        type: type,
        gateId: gateId,
        assignmentId: assignmentId,
        idempotencyKey: key,
        createdAt: DateTime.now(),
        societyId: session.societyId,
        guardUserId: session.userId,
      ));
      final count = (await _queue.read()).where((action) => action.belongsTo(societyId: session.societyId, guardUserId: session.userId)).length;
      if (!mounted) return;
      setState(() {
        _queued = count;
        _syncMessage = 'Attendance saved securely. Retry when connectivity returns.';
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Network unavailable. Attendance saved securely and will sync automatically.')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _unitLabel(Map<String, dynamic> assignment) {
    final household = assignment['household'] is Map ? Map<String, dynamic>.from(assignment['household'] as Map) : const <String, dynamic>{};
    final unit = household['unit'] is Map ? Map<String, dynamic>.from(household['unit'] as Map) : const <String, dynamic>{};
    final building = unit['building'] is Map ? Map<String, dynamic>.from(unit['building'] as Map) : const <String, dynamic>{};
    return '${building['name'] ?? building['code'] ?? 'Building'} · ${unit['number'] ?? 'Unit'}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Daily workforce', style: TextStyle(fontWeight: FontWeight.w900))),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              Material(
                color: scheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(22),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  leading: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(16)),
                    child: Icon(Icons.badge_outlined, color: scheme.onPrimaryContainer),
                  ),
                  title: const Text('Approved staff only', style: TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: Text('${widget.controller.gateName ?? 'Active gate'} · schedule-eligible workers'),
                  trailing: _queued == 0 ? const Icon(Icons.cloud_done_outlined) : Badge(label: Text('$_queued'), child: const Icon(Icons.cloud_off_outlined)),
                ),
              ),
              if (_queued > 0 || _syncMessage != null) ...[
                const SizedBox(height: 12),
                GuardStateCard(
                  icon: _queued == 0 ? Icons.cloud_done_outlined : Icons.cloud_off_outlined,
                  message: _syncMessage ?? '$_queued offline attendance ${_queued == 1 ? 'action' : 'actions'} pending securely.',
                  actionLabel: _queued > 0 ? 'Retry safe sync' : null,
                  onAction: _queued > 0 && !_busy ? _retrySync : null,
                ),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _load(),
                decoration: InputDecoration(
                  labelText: 'Search staff',
                  hintText: 'Name or phone',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: IconButton(tooltip: 'Search', onPressed: _busy ? null : _load, icon: const Icon(Icons.arrow_forward_rounded)),
                ),
              ),
              if (_busy) ...[
                const SizedBox(height: 12),
                const GuardStateCard(icon: Icons.sync_rounded, message: 'Updating workforce list…', loading: true),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                GuardStateCard(icon: Icons.error_outline_rounded, message: _error!, error: true, actionLabel: 'Retry', onAction: _busy ? null : _load),
              ],
              const SizedBox(height: 18),
              Text('Eligible now', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              if (!_busy && _workers.isEmpty)
                const GuardStateCard(icon: Icons.person_search_outlined, message: 'No eligible workers found for the current schedule.'),
              ..._workers.map((assignment) {
                final worker = assignment['worker'] is Map ? Map<String, dynamic>.from(assignment['worker'] as Map) : const <String, dynamic>{};
                final name = worker['name']?.toString() ?? 'Worker';
                final role = worker['role']?.toString().replaceAll('_', ' ') ?? 'STAFF';
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Material(
                    color: scheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(22),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(16)),
                              child: Icon(Icons.person_rounded, color: scheme.onPrimaryContainer),
                            ),
                            const SizedBox(width: 12),
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                              const SizedBox(height: 3),
                              Text('$role · ${_unitLabel(assignment)}', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
                            ])),
                            Icon(Icons.verified_rounded, color: scheme.primary),
                          ]),
                          const SizedBox(height: 14),
                          Row(children: [
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: _busy ? null : () => _mutate(assignment, 'CHECK_IN'),
                                icon: const Icon(Icons.login_rounded),
                                label: const Text('ENTER', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)),
                                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(64)),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _busy ? null : () => _mutate(assignment, 'CHECK_OUT'),
                                icon: const Icon(Icons.logout_rounded),
                                label: const Text('EXIT', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w900)),
                                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(64)),
                              ),
                            ),
                          ]),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}
