import 'package:flutter/material.dart';
import '../data/demo_household_profile_store.dart';
import '../data/household_profile_actions.dart';
import '../data/resident_data_controller.dart';

class FamilyMembersScreen extends StatefulWidget {
  const FamilyMembersScreen({
    super.key,
    required this.controller,
    required this.householdId,
    required this.canManage,
  });

  final ResidentDataController controller;
  final String householdId;
  final bool canManage;

  @override
  State<FamilyMembersScreen> createState() => _FamilyMembersScreenState();
}

class _FamilyMembersScreenState extends State<FamilyMembersScreen> {
  bool _busy = false;
  String? _error;
  List<Map<String, dynamic>> _pendingRequests = const [];
  late final bool _demo = widget.householdId.startsWith('demo-');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refreshPending());
  }

  Map<String, dynamic>? get _household {
    for (final item in widget.controller.households) {
      if (item['id']?.toString() == widget.householdId) return item;
    }
    return null;
  }

  List<Map<String, dynamic>> get _members {
    if (_demo) return DemoHouseholdProfileStore.familyMembers(widget.householdId);
    final unit = _household?['unit'];
    if (unit is! Map || unit['occupancies'] is! List) return const [];
    return (unit['occupancies'] as List)
        .whereType<Map>()
        .where((item) => item['relation']?.toString() == 'FAMILY_MEMBER')
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  List<Map<String, dynamic>> get _familyPending => _pendingRequests
      .where((item) => item['householdId']?.toString() == widget.householdId &&
          {'FAMILY_MEMBER_ADD', 'FAMILY_MEMBER_REMOVE'}.contains(item['type']?.toString()) &&
          item['status']?.toString() == 'PENDING')
      .toList(growable: false);

  bool _removalPending(String memberId) => _familyPending.any((request) =>
      request['type'] == 'FAMILY_MEMBER_REMOVE' && request['targetId']?.toString() == memberId);

  Future<void> _refreshPending() async {
    if (!mounted) return;
    if (_demo) {
      setState(() => _pendingRequests = List<Map<String, dynamic>>.from(
            DemoHouseholdProfileStore.pendingRequests(widget.householdId),
          ));
      return;
    }
    try {
      final rows = await widget.controller.repository.householdChangeRequests();
      if (mounted) setState(() => _pendingRequests = rows);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _addMember() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _AddFamilyMemberDialog(),
    );
    if (!mounted || result == null) return;

    await _run(() async {
      if (_demo) {
        DemoHouseholdProfileStore.requestFamilyAdd(
          householdId: widget.householdId,
          name: result['name'].toString(),
          phone: result['phone'].toString(),
          gateApprovalEnabled: result['gateApprovalEnabled'] == true,
          gateNotificationEnabled: result['gateNotificationEnabled'] == true,
          primaryGateContact: result['primaryGateContact'] == true,
        );
      } else {
        await widget.controller.repository.addFamilyMember(
          householdId: widget.householdId,
          name: result['name'].toString(),
          phone: result['phone'].toString(),
          gateApprovalEnabled: result['gateApprovalEnabled'] == true,
          gateNotificationEnabled: result['gateNotificationEnabled'] == true,
          primaryGateContact: result['primaryGateContact'] == true,
        );
        await widget.controller.load();
      }
      await _refreshPending();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Family member request sent for society admin approval.')),
        );
      }
    });
  }

  Future<void> _editMember(Map<String, dynamic> member) async {
    bool notifications = member['gateNotificationEnabled'] == true;
    bool approvals = member['gateApprovalEnabled'] == true;
    bool primary = member['primaryGateContact'] == true;
    final result = await showDialog<Map<String, bool>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(member['user'] is Map ? ((member['user'] as Map)['name']?.toString() ?? 'Family member') : 'Family member'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Gate notifications'), value: notifications, onChanged: (v) => setDialogState(() => notifications = v)),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Can approve visitors'), value: approvals, onChanged: (v) => setDialogState(() => approvals = v)),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Primary gate contact'), value: primary, onChanged: (v) => setDialogState(() { primary = v; if (v) notifications = true; })),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, {'notifications': notifications, 'approvals': approvals, 'primary': primary}), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (!mounted || result == null) return;
    await _run(() async {
      if (_demo) {
        final members = DemoHouseholdProfileStore.familyMembers(widget.householdId);
        if (result['primary'] == true) {
          for (final item in members) {
            item['primaryGateContact'] = false;
          }
        }
        member['gateNotificationEnabled'] = result['notifications'];
        member['gateApprovalEnabled'] = result['approvals'];
        member['primaryGateContact'] = result['primary'];
        return;
      }
      await widget.controller.repository.updateFamilyMember(
        householdId: widget.householdId,
        occupancyId: member['id'].toString(),
        gateNotificationEnabled: result['notifications'],
        gateApprovalEnabled: result['approvals'],
        primaryGateContact: result['primary'],
      );
      await widget.controller.load();
    });
  }

  Future<void> _removeMember(Map<String, dynamic> member) async {
    if (_removalPending(member['id'].toString())) return;
    final user = member['user'] is Map ? member['user'] as Map : const {};
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request family member removal?'),
        content: Text('${user['name'] ?? 'This member'} will keep current access until society administration approves the removal.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send request')),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    await _run(() async {
      if (_demo) {
        DemoHouseholdProfileStore.requestFamilyRemove(householdId: widget.householdId, member: member);
      } else {
        await widget.controller.repository.deactivateFamilyMember(householdId: widget.householdId, occupancyId: member['id'].toString());
        await widget.controller.load();
      }
      await _refreshPending();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Removal request sent for society admin approval.')),
        );
      }
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (!mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await action();
    } catch (e) {
      if (mounted) _error = e.toString();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final members = _members;
    final pending = _familyPending;
    return Scaffold(
      appBar: AppBar(title: const Text('Family members')),
      floatingActionButton: widget.canManage
          ? FloatingActionButton.extended(onPressed: _busy ? null : _addMember, icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('Add member'))
          : null,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 96),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.verified_user_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                const Expanded(child: Text('Adding or removing a family member requires society admin approval. Existing gate-notification and visitor-approval settings can still be managed by the verified owner.')),
              ]),
            ),
          ),
          if (!widget.canManage) ...[
            const SizedBox(height: 10),
            const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Only a verified current owner can request family-member changes.'))),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.error)),
          ],
          if (pending.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Pending society approval', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            for (final request in pending) _PendingFamilyRequestCard(request: request),
          ],
          const SizedBox(height: 16),
          if (_busy) const LinearProgressIndicator(),
          if (members.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No active family members are linked yet.'))))
          else
            for (final member in members) _MemberCard(
              member: member,
              canManage: widget.canManage,
              removalPending: _removalPending(member['id'].toString()),
              onEdit: () => _editMember(member),
              onRemove: () => _removeMember(member),
            ),
        ],
      ),
    );
  }
}

class _PendingFamilyRequestCard extends StatelessWidget {
  const _PendingFamilyRequestCard({required this.request});
  final Map<String, dynamic> request;

  @override
  Widget build(BuildContext context) {
    final payload = request['payload'] is Map ? request['payload'] as Map : const {};
    final adding = request['type']?.toString() == 'FAMILY_MEMBER_ADD';
    return Card(
      child: ListTile(
        leading: const Icon(Icons.schedule_rounded),
        title: Text(adding ? (payload['name']?.toString() ?? 'New family member') : (payload['name']?.toString() ?? 'Family member removal')),
        subtitle: Text(adding ? 'Addition pending admin approval' : 'Removal pending admin approval'),
        trailing: const Chip(label: Text('Pending')),
      ),
    );
  }
}

class _AddFamilyMemberDialog extends StatefulWidget {
  const _AddFamilyMemberDialog();

  @override
  State<_AddFamilyMemberDialog> createState() => _AddFamilyMemberDialogState();
}

class _AddFamilyMemberDialogState extends State<_AddFamilyMemberDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  bool _notifications = true;
  bool _approvals = false;
  bool _primary = false;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _phoneController = TextEditingController(text: '+91');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    if (name.isEmpty || phone.length < 8) {
      setState(() => _validationError = 'Enter a name and a valid mobile number.');
      return;
    }
    Navigator.of(context).pop({
      'name': name,
      'phone': phone,
      'gateNotificationEnabled': _notifications,
      'gateApprovalEnabled': _approvals,
      'primaryGateContact': _primary,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add family member'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _nameController, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 12),
          TextField(controller: _phoneController, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile number')),
          const SizedBox(height: 14),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Gate notifications'), value: _notifications, onChanged: (v) => setState(() => _notifications = v)),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Can approve visitors'), value: _approvals, onChanged: (v) => setState(() => _approvals = v)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Primary gate contact'),
            subtitle: const Text('Only one occupant should be primary.'),
            value: _primary,
            onChanged: (v) => setState(() {
              _primary = v;
              if (v) _notifications = true;
            }),
          ),
          if (_validationError != null) ...[
            const SizedBox(height: 8),
            Text(_validationError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 8),
          const Text('The member becomes active only after society admin approval, then verifies this mobile number with OTP when signing in.', style: TextStyle(fontSize: 12)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: _submit, child: const Text('Send for approval')),
      ],
    );
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.member, required this.canManage, required this.removalPending, required this.onEdit, required this.onRemove});
  final Map<String, dynamic> member;
  final bool canManage;
  final bool removalPending;
  final VoidCallback onEdit;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final user = member['user'] is Map ? member['user'] as Map : const {};
    final chips = <Widget>[
      if (member['primaryGateContact'] == true) const Chip(label: Text('Primary gate contact')),
      if (member['gateNotificationEnabled'] == true) const Chip(label: Text('Gate alerts')),
      if (member['gateApprovalEnabled'] == true) const Chip(label: Text('Can approve')),
      if (member['gateNotificationEnabled'] != true && member['gateApprovalEnabled'] != true) const Chip(label: Text('No gate access')),
      if (removalPending) const Chip(label: Text('Removal pending')),
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const CircleAvatar(child: Icon(Icons.person_rounded)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(user['name']?.toString() ?? 'Family member', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(user['phone']?.toString() ?? 'Mobile verification on sign-in'),
            ])),
            if (canManage) PopupMenuButton<String>(
              onSelected: (value) => value == 'edit' ? onEdit() : onRemove(),
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'edit', child: Text('Gate permissions')),
                PopupMenuItem(value: 'remove', enabled: !removalPending, child: Text(removalPending ? 'Removal pending approval' : 'Request removal')),
              ],
            ),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 6, children: chips),
        ]),
      ),
    );
  }
}
