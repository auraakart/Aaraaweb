import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

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
    final tenantPhone = await _textDialog('Tenant mobile number', 'Enter the tenant mobile number used for Aaraagate sign-in.');
    if (tenantPhone == null || tenantPhone.trim().isEmpty) return;
    final effectiveAt = await _pickEffectiveAt('Move-in date');
    if (effectiveAt == null) return;
    final reason = await _reasonDialog('Move-in note (optional)');
    if (reason == null) return;
    setState(() { submitting = true; error = null; });
    try {
      await widget.api.post('/api/v1/occupancy-lifecycle/self/tenant-move-ins', {
        'unitId': unitId,
        'tenantPhone': tenantPhone.trim(),
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
    final scheme = theme.colorScheme;
    final unitId = widget.activeUnitId;
    final myOccupancies = unitId == null ? occupancies : occupancies.where((o) => o['unitId']?.toString() == unitId).toList();
    final canInitiateTenantMoveIn = unitId != null && ownedUnitIds.contains(unitId);
    return Scaffold(
      appBar: AppBar(title: const Text('Move-in & move-out')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space4,
            AaraagateTokens.pageGutter,
            AaraagateTokens.space8,
          ),
          children: [
            Text('Occupancy lifecycle', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: AaraagateTokens.space1),
            Text(
              'Submit bounded move requests and track society readiness. Legal ownership is not changed by these requests.',
              style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
            ),
            if (error != null) ...[
              const SizedBox(height: AaraagateTokens.space4),
              AppStateCard(icon: Icons.error_outline_rounded, message: error!, actionLabel: 'Retry', onAction: _load),
            ],
            const SizedBox(height: AaraagateTokens.space5),
            if (loading)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading move requests…', loading: true)
            else ...[
              PremiumSectionHeader(
                title: 'Actions',
                supportingText: 'Available actions are based on the selected property and your current relationship.',
                trailing: submitting ? const AaraagateStatusPill(label: 'Submitting', tone: AaraagateStatusTone.info) : null,
              ),
              const SizedBox(height: AaraagateTokens.space3),
              PremiumSurface(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  for (var i = 0; i < myOccupancies.length; i++) ...[
                    if (i > 0) Divider(height: 1, color: scheme.outlineVariant),
                    ListTile(
                      minTileHeight: AaraagateTokens.minTouchTarget,
                      contentPadding: const EdgeInsets.symmetric(horizontal: AaraagateTokens.space4, vertical: AaraagateTokens.space2),
                      leading: const Icon(Icons.logout_rounded),
                      title: const Text('Request move-out'),
                      subtitle: Text('${myOccupancies[i]['relation']?.toString().replaceAll('_', ' ') ?? 'Resident'} · occupancy ${myOccupancies[i]['id']}'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      enabled: !submitting,
                      onTap: () => _requestMoveOut(myOccupancies[i]),
                    ),
                  ],
                  if (canInitiateTenantMoveIn) ...[
                    if (myOccupancies.isNotEmpty) Divider(height: 1, color: scheme.outlineVariant),
                    ListTile(
                      minTileHeight: AaraagateTokens.minTouchTarget,
                      contentPadding: const EdgeInsets.symmetric(horizontal: AaraagateTokens.space4, vertical: AaraagateTokens.space2),
                      leading: const Icon(Icons.person_add_alt_1_rounded),
                      title: const Text('Request tenant move-in'),
                      subtitle: const Text('Use the tenant mobile number registered with Aaraagate'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      enabled: !submitting,
                      onTap: () => _requestTenantMoveIn(unitId),
                    ),
                  ],
                  if (myOccupancies.isEmpty && !canInitiateTenantMoveIn)
                    const Padding(
                      padding: EdgeInsets.all(AaraagateTokens.space4),
                      child: Text('No eligible move action is available for the selected property.'),
                    ),
                ]),
              ),
              const SizedBox(height: AaraagateTokens.space6),
              PremiumSectionHeader(
                title: 'My requests',
                supportingText: 'Track move dates and society readiness.',
                trailing: AaraagateStatusPill(label: '${requests.length}', tone: requests.isEmpty ? AaraagateStatusTone.neutral : AaraagateStatusTone.info),
              ),
              const SizedBox(height: AaraagateTokens.space3),
              if (requests.isEmpty)
                const AppStateCard(icon: Icons.move_up_outlined, message: 'No move requests yet.')
              else
                for (final request in requests) ...[
                  _MoveRequestCard(request: request, onTap: () => _openRequest(request['id'].toString())),
                  const SizedBox(height: AaraagateTokens.space3),
                ],
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

class _MoveRequestCard extends StatelessWidget {
  const _MoveRequestCard({required this.request, required this.onTap});
  final Map<String, dynamic> request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = request['status']?.toString() ?? '';
    final kind = request['kind']?.toString() ?? '';
    return PremiumSurface(
      onTap: onTap,
      semanticLabel: '${kind.replaceAll('_', ' ')} request. Status $status. Effective ${_formatValue(request['effectiveAt'])}',
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: AaraagateTokens.iconContainer,
          height: AaraagateTokens.iconContainer,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
          child: Icon(kind == 'MOVE_OUT' ? Icons.logout_rounded : Icons.login_rounded, color: scheme.primary),
        ),
        const SizedBox(width: AaraagateTokens.space3),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(kind.replaceAll('_', ' ').isEmpty ? 'Move' : kind.replaceAll('_', ' '), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: AaraagateTokens.space1),
          Text('Effective ${_formatValue(request['effectiveAt'])}', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(height: AaraagateTokens.space3),
          AaraagateStatusPill(label: status.isEmpty ? 'Pending' : status.replaceAll('_', ' '), tone: _statusTone(status)),
        ])),
        const Icon(Icons.chevron_right_rounded),
      ]),
    );
  }

  String _formatValue(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '');
    if (date == null) return value?.toString() ?? '';
    return '${date.day}/${date.month}/${date.year}';
  }

  AaraagateStatusTone _statusTone(String status) => switch (status.toUpperCase()) {
        'APPROVED' || 'COMPLETED' || 'READY' => AaraagateStatusTone.success,
        'REJECTED' || 'CANCELLED' => AaraagateStatusTone.danger,
        'IN_REVIEW' || 'PROCESSING' || 'IN_PROGRESS' => AaraagateStatusTone.info,
        _ => AaraagateStatusTone.warning,
      };
}

class _RequestDetail extends StatelessWidget {
  const _RequestDetail({required this.detail});
  final Map<String, dynamic> detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final checklist = (detail['checklist'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final documents = (detail['documents'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final complete = checklist.where((item) => item['completedAt'] != null).length;
    final status = detail['status']?.toString() ?? '';
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AaraagateTokens.pageGutter,
          0,
          AaraagateTokens.pageGutter,
          AaraagateTokens.space5 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text('${detail['kind']?.toString().replaceAll('_', ' ') ?? 'Move'} · $status', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900))),
              const SizedBox(width: AaraagateTokens.space2),
              AaraagateStatusPill(label: status.isEmpty ? 'Pending' : status.replaceAll('_', ' '), tone: _detailTone(status)),
            ]),
            const SizedBox(height: AaraagateTokens.space3),
            PremiumSurface(
              child: Row(children: [
                Icon(Icons.fact_check_outlined, color: scheme.primary),
                const SizedBox(width: AaraagateTokens.space3),
                Expanded(child: Text('Readiness: $complete of ${checklist.length} items complete')),
              ]),
            ),
            const SizedBox(height: AaraagateTokens.space4),
            if (checklist.isNotEmpty) ...[
              const PremiumSectionHeader(title: 'Readiness checklist'),
              const SizedBox(height: AaraagateTokens.space2),
              for (final item in checklist)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(item['completedAt'] == null ? Icons.radio_button_unchecked : Icons.check_circle_rounded),
                  title: Text(item['label']?.toString() ?? item['code']?.toString() ?? 'Checklist item'),
                  subtitle: item['note'] == null ? null : Text(item['note'].toString()),
                ),
            ],
            if (documents.isNotEmpty) ...[
              const SizedBox(height: AaraagateTokens.space4),
              const PremiumSectionHeader(title: 'Documents'),
              const SizedBox(height: AaraagateTokens.space2),
              for (final doc in documents)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(doc['verifiedAt'] == null ? Icons.description_outlined : Icons.verified_rounded),
                  title: Text(doc['kind']?.toString() ?? 'Document'),
                  subtitle: Text(doc['verifiedAt'] == null ? 'Awaiting verification' : 'Verified'),
                ),
            ],
          ]),
        ),
      ),
    );
  }

  AaraagateStatusTone _detailTone(String status) => switch (status.toUpperCase()) {
        'APPROVED' || 'COMPLETED' || 'READY' => AaraagateStatusTone.success,
        'REJECTED' || 'CANCELLED' => AaraagateStatusTone.danger,
        'IN_REVIEW' || 'PROCESSING' || 'IN_PROGRESS' => AaraagateStatusTone.info,
        _ => AaraagateStatusTone.warning,
      };
}
