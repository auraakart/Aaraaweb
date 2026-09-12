import 'package:flutter/material.dart';
import '../data/api_client.dart';

class OccupancyLifecycleScreen extends StatefulWidget {
  const OccupancyLifecycleScreen({super.key, required this.api, required this.activeUnitId});
  final ApiClient api;
  final String? activeUnitId;

  @override
  State<OccupancyLifecycleScreen> createState() => _OccupancyLifecycleScreenState();
}

class _OccupancyLifecycleScreenState extends State<OccupancyLifecycleScreen> {
  bool loading = true;
  bool submitting = false;
  String? error;
  List<Map<String, dynamic>> requests = const [];
  List<Map<String, dynamic>> occupancies = const [];
  Set<String> ownedUnitIds = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final values = await Future.wait([
        widget.api.get('/api/v1/occupancy-lifecycle/self'),
        widget.api.get('/api/v1/occupancy-lifecycle/self/context'),
      ]);
      final rawRequests = values[0] as List? ?? const [];
      final context = Map<String, dynamic>.from(values[1] as Map);
      final rawOccupancies = context['occupancies'] as List? ?? const [];
      final rawOwned = context['ownedUnitIds'] as List? ?? const [];
      if (!mounted) return;
      setState(() {
        requests = rawRequests.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        occupancies = rawOccupancies.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        ownedUnitIds = rawOwned.map((e) => e.toString()).toSet();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } catch (_) {
      if (mounted) setState(() => error = 'Could not load move requests.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _requestMoveOut(Map<String, dynamic> occupancy) async {
    final effectiveAt = await _pickEffectiveAt('Move-out date');
    if (effectiveAt == null) return;
    final reason = await _reasonDialog('Move-out reason (optional)');
    if (reason == null) return;
    setState(() { submitting = true; error = null; });
    try {
      await widget.api.post('/api/v1/occupancy-lifecycle/self/move-outs', {
        'occupancyId': occupancy['id'].toString(),
        'effectiveAt': effectiveAt.toUtc().toIso8601String(),
        if (reason.trim().isNotEmpty) 'reason': reason.trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Move-out request submitted for society review.')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  Future<void> _requestTenantMoveIn(String unitId) async {
    final targetUserId = await _textDialog('Tenant account ID', 'Enter the tenant Aaraagate user ID supplied during onboarding.');
    if (targetUserId == null || targetUserId.trim().isEmpty) return;
    final effectiveAt = await _pickEffectiveAt('Move-in date');
    if (effectiveAt == null) return;
    final reason = await _reasonDialog('Move-in note (optional)');
    if (reason == null) return;
    setState(() { submitting = true; error = null; });
    try {
      await widget.api.post('/api/v1/occupancy-lifecycle/self/owner-move-ins', {
        'unitId': unitId,
        'userId': targetUserId.trim(),
        'effectiveAt': effectiveAt.toUtc().toIso8601String(),
        if (reason.trim().isNotEmpty) 'reason': reason.trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Move-in request submitted for society review.')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  Future<void> _openRequest(String id) async {
    try {
      final raw = await widget.api.get('/api/v1/occupancy-lifecycle/self/$id');
      if (!mounted) return;
      final detail = Map<String, dynamic>.from(raw as Map);
      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => _RequestDetail(detail: detail),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unitId = widget.activeUnitId;
    final myOccupancies = unitId == null ? occupancies : occupancies.where((o) => o['unitId']?.toString() == unitId).toList();
    final canInitiateTenantMoveIn = unitId != null && ownedUnitIds.contains(unitId);
    return Scaffold(
      appBar: AppBar(title: const Text('Move-in & move-out')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Text('Occupancy lifecycle', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Submit bounded move requests and track society readiness. Legal ownership is not changed by these requests.'),
            if (error != null) ...[
              const SizedBox(height: 14),
              Card(color: theme.colorScheme.errorContainer, child: Padding(padding: const EdgeInsets.all(14), child: Text(error!))),
            ],
            const SizedBox(height: 18),
            if (loading)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else ...[
              Text('Actions', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              Card(child: Column(children: [
                for (final occupancy in myOccupancies)
                  ListTile(
                    leading: const Icon(Icons.logout_rounded),
                    title: const Text('Request move-out'),
                    subtitle: Text('${occupancy['relation']?.toString().replaceAll('_', ' ') ?? 'Resident'} · occupancy ${occupancy['id']}'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    enabled: !submitting,
                    onTap: () => _requestMoveOut(occupancy),
                  ),
                if (canInitiateTenantMoveIn) ...[
                  if (myOccupancies.isNotEmpty) const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.person_add_alt_1_rounded),
                    title: const Text('Request tenant move-in'),
                    subtitle: const Text('For a verified property you own'),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    enabled: !submitting,
                    onTap: () => _requestTenantMoveIn(unitId),
                  ),
                ],
                if (myOccupancies.isEmpty && !canInitiateTenantMoveIn)
                  const Padding(padding: EdgeInsets.all(16), child: Text('No eligible move action is available for the selected property.')),
              ])),
              const SizedBox(height: 22),
              Text('My requests', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              if (requests.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No move requests yet.')))
              else
                Card(child: Column(children: [
                  for (var i = 0; i < requests.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    ListTile(
                      leading: Icon(requests[i]['kind'] == 'MOVE_OUT' ? Icons.logout_rounded : Icons.login_rounded),
                      title: Text('${requests[i]['kind']?.toString().replaceAll('_', ' ') ?? 'Move'} · ${requests[i]['status'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('Effective ${_format(requests[i]['effectiveAt'])}'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => _openRequest(requests[i]['id'].toString()),
                    ),
                  ],
                ])),
            ],
          ],
        ),
      ),
    );
  }

  Future<DateTime?> _pickEffectiveAt(String title) async {
    final now = DateTime.now();
    final date = await showDatePicker(context: context, firstDate: DateTime(now.year, now.month, now.day), lastDate: DateTime(now.year + 2), initialDate: now.add(const Duration(days: 1)), helpText: title);
    if (date == null || !mounted) return null;
    return DateTime(date.year, date.month, date.day, 9);
  }

  Future<String?> _reasonDialog(String title) => _textDialog(title, 'Add context for the society team.', allowEmpty: true);

  Future<String?> _textDialog(String title, String hint, {bool allowEmpty = false}) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(context: context, builder: (context) => AlertDialog(
      title: Text(title),
      content: TextField(controller: controller, decoration: InputDecoration(hintText: hint), maxLines: allowEmpty ? 3 : 1),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () { if (allowEmpty || controller.text.trim().isNotEmpty) Navigator.pop(context, controller.text); }, child: const Text('Continue')),
      ],
    ));
    controller.dispose();
    return value;
  }

  String _format(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '');
    if (date == null) return value?.toString() ?? '';
    return '${date.day}/${date.month}/${date.year}';
  }
}

class _RequestDetail extends StatelessWidget {
  const _RequestDetail({required this.detail});
  final Map<String, dynamic> detail;

  @override
  Widget build(BuildContext context) {
    final checklist = (detail['checklist'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final documents = (detail['documents'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final complete = checklist.where((item) => item['completedAt'] != null).length;
    return SafeArea(child: Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${detail['kind']?.toString().replaceAll('_', ' ') ?? 'Move'} · ${detail['status'] ?? ''}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        Text('Readiness: $complete of ${checklist.length} items complete'),
        const SizedBox(height: 14),
        for (final item in checklist)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(item['completedAt'] == null ? Icons.radio_button_unchecked : Icons.check_circle_rounded),
            title: Text(item['label']?.toString() ?? item['code']?.toString() ?? 'Checklist item'),
            subtitle: item['note'] == null ? null : Text(item['note'].toString()),
          ),
        if (documents.isNotEmpty) ...[
          const Divider(),
          const Text('Documents', style: TextStyle(fontWeight: FontWeight.w800)),
          for (final doc in documents)
            ListTile(contentPadding: EdgeInsets.zero, leading: Icon(doc['verifiedAt'] == null ? Icons.description_outlined : Icons.verified_rounded), title: Text(doc['kind']?.toString() ?? 'Document'), subtitle: Text(doc['verifiedAt'] == null ? 'Awaiting verification' : 'Verified')),
        ],
      ])),
    ));
  }
}
