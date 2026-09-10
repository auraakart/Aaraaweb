import 'package:flutter/material.dart';
import '../data/demo_household_state.dart';
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
  late final bool _demo = widget.householdId.startsWith('demo-');

  List<Map<String, dynamic>> get _demoMembers => DemoHouseholdState.familyFor(widget.householdId);

  Map<String, dynamic>? get _household {
    for (final item in widget.controller.households) {
      if (item['id']?.toString() == widget.householdId) return item;
    }
    return null;
  }

  List<Map<String, dynamic>> get _members {
    if (_demo) return _demoMembers;
    final unit = _household?['unit'];
    if (unit is! Map || unit['occupancies'] is! List) return const [];
    return (unit['occupancies'] as List)
        .whereType<Map>()
        .where((item) => item['relation']?.toString() == 'FAMILY_MEMBER')
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Future<void> _addMember() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _AddFamilyMemberDialog(),
    );
    if (!mounted || result == null) return;

    await _run(() async {
      if (_demo) {
        if (result['primaryGateContact'] == true) {
          for (final member in _demoMembers) {
            member['primaryGateContact'] = false;
          }
        }
        _demoMembers.add({
          'id': 'demo-family-${DateTime.now().microsecondsSinceEpoch}',
          'relation': 'FAMILY_MEMBER',
          'primaryGateContact': result['primaryGateContact'],
          'gateApprovalEnabled': result['gateApprovalEnabled'],
          'gateNotificationEnabled': result['gateNotificationEnabled'],
          'user': {'name': result['name'], 'phone': result['phone'], 'status': 'ACTIVE'},
        });
        return;
      }
      await widget.controller.repository.addFamilyMember(
        householdId: widget.householdId,
        name: result['name'].toString(),
        phone: result['phone'].toString(),
        gateApprovalEnabled: result['gateApprovalEnabled'] == true,
        gateNotificationEnabled: result['gateNotificationEnabled'] == true,
        primaryGateContact: result['primaryGateContact'] == true,
      );
      await widget.controller.load();
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
        if (result['primary'] == true) {
          for (final item in _demoMembers) {
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
    final user = member['user'] is Map ? member['user'] as Map : const {};
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove family member?'),
        content: Text('${user['name'] ?? 'This member'} will lose active household and gate access for this flat.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove')),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    await _run(() async {
      if (_demo) {
        _demoMembers.removeWhere((item) => item['id'] == member['id']);
        return;
      }
      await widget.controller.repository.deactivateFamilyMember(householdId: widget.householdId, occupancyId: member['id'].toString());
      await widget.controller.load();
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
                const Expanded(child: Text('Family members are linked to this flat. Gate notifications and visitor-approval rights can be controlled separately for each person.')),
              ]),
            ),
          ),
          if (!widget.canManage) ...[
            const SizedBox(height: 10),
            const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Only a verified current owner can add, change or remove family members.'))),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: theme.colorScheme.error)),
          ],
          const SizedBox(height: 16),
          if (_busy) const LinearProgressIndicator(),
          if (members.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No family members are linked yet.'))))
          else
            for (final member in members) _MemberCard(
              member: member,
              canManage: widget.canManage,
              onEdit: () => _editMember(member),
              onRemove: () => _removeMember(member),
            ),
        ],
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
          const Text('The member will verify this mobile number with OTP when signing in.', style: TextStyle(fontSize: 12)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: _submit, child: const Text('Add member')),
      ],
    );
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.member, required this.canManage, required this.onEdit, required this.onRemove});
  final Map<String, dynamic> member;
  final bool canManage;
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
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Gate permissions')),
                PopupMenuItem(value: 'remove', child: Text('Remove member')),
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
