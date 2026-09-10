import 'package:flutter/material.dart';
import '../data/demo_household_profile_store.dart';
import '../data/household_profile_actions.dart';
import '../data/resident_data_controller.dart';

class EmergencyContactsScreen extends StatefulWidget {
  const EmergencyContactsScreen({super.key, required this.controller, required this.householdId});

  final ResidentDataController controller;
  final String householdId;

  @override
  State<EmergencyContactsScreen> createState() => _EmergencyContactsScreenState();
}

class _EmergencyContactsScreenState extends State<EmergencyContactsScreen> {
  bool _busy = false;
  String? _error;
  late final bool _demo = widget.householdId.startsWith('demo-');

  Map<String, dynamic>? get _household {
    for (final item in widget.controller.households) {
      if (item['id']?.toString() == widget.householdId) return item;
    }
    return null;
  }

  List<Map<String, dynamic>> get _contacts {
    if (_demo) return DemoHouseholdProfileStore.emergencyContacts(widget.householdId);
    final raw = _household?['emergencyContacts'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  Future<void> _add() async {
    final result = await showDialog<_EmergencyContactFormResult>(
      context: context,
      builder: (_) => const _EmergencyContactDialog(),
    );
    if (!mounted || result == null) return;
    await _run(() async {
      if (_demo) {
        DemoHouseholdProfileStore.addEmergencyContact(
          householdId: widget.householdId,
          name: result.name,
          phone: result.phone,
          relation: result.relation,
          priority: result.priority,
        );
      } else {
        await widget.controller.repository.addEmergencyContact(
          householdId: widget.householdId,
          name: result.name,
          phone: result.phone,
          relation: result.relation,
          priority: result.priority,
        );
        await widget.controller.load();
      }
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Emergency contact saved.')));
    });
  }

  Future<void> _remove(Map<String, dynamic> contact) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove emergency contact?'),
        content: Text('${contact['name'] ?? 'This contact'} will be removed from this household.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Remove')),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    await _run(() async {
      final id = contact['id']?.toString() ?? '';
      if (_demo) {
        DemoHouseholdProfileStore.removeEmergencyContact(widget.householdId, id);
      } else {
        await widget.controller.repository.deactivateEmergencyContact(householdId: widget.householdId, contactId: id);
        await widget.controller.load();
      }
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Emergency contact removed.')));
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (!mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contacts = [..._contacts]..sort((a, b) => (a['priority'] as num? ?? 1).compareTo(b['priority'] as num? ?? 1));
    return Scaffold(
      appBar: AppBar(title: const Text('Emergency contacts', style: TextStyle(fontWeight: FontWeight.w900))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _add,
        icon: const Icon(Icons.person_add_alt_1_rounded),
        label: const Text('Add contact'),
      ),
      body: RefreshIndicator(
        onRefresh: widget.controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('Keep trusted people here for household emergencies. These contacts are profile information and do not require society admin approval.'),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 14),
            if (_busy) const LinearProgressIndicator(),
            if (contacts.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(22), child: Text('No emergency contacts saved yet.')))
            else
              for (final contact in contacts)
                Card(
                  child: ListTile(
                    leading: CircleAvatar(child: Text('${contact['priority'] ?? 1}')),
                    title: Text(contact['name']?.toString() ?? 'Emergency contact', style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text([
                      contact['phone']?.toString() ?? '',
                      if (contact['relation']?.toString().trim().isNotEmpty == true) contact['relation'].toString(),
                    ].where((value) => value.isNotEmpty).join(' · ')),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline_rounded),
                      tooltip: 'Remove contact',
                      onPressed: _busy ? null : () => _remove(contact),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _EmergencyContactDialog extends StatefulWidget {
  const _EmergencyContactDialog();

  @override
  State<_EmergencyContactDialog> createState() => _EmergencyContactDialogState();
}

class _EmergencyContactDialogState extends State<_EmergencyContactDialog> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _relation;
  int _priority = 1;
  String? _error;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController();
    _phone = TextEditingController(text: '+91');
    _relation = TextEditingController();
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _relation.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    final phone = _phone.text.trim();
    if (name.isEmpty || phone.length < 8) {
      setState(() => _error = 'Enter a name and valid mobile number.');
      return;
    }
    Navigator.of(context).pop(_EmergencyContactFormResult(
      name: name,
      phone: phone,
      relation: _relation.text.trim(),
      priority: _priority,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add emergency contact'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 12),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile number')),
          const SizedBox(height: 12),
          TextField(controller: _relation, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Relationship (optional)', hintText: 'Brother, friend, doctor')),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            value: _priority,
            decoration: const InputDecoration(labelText: 'Priority'),
            items: const [
              DropdownMenuItem(value: 1, child: Text('1 · Call first')),
              DropdownMenuItem(value: 2, child: Text('2 · Second contact')),
              DropdownMenuItem(value: 3, child: Text('3 · Third contact')),
            ],
            onChanged: (value) => value == null ? null : setState(() => _priority = value),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: _submit, child: const Text('Save contact')),
      ],
    );
  }
}

class _EmergencyContactFormResult {
  const _EmergencyContactFormResult({required this.name, required this.phone, required this.relation, required this.priority});
  final String name;
  final String phone;
  final String relation;
  final int priority;
}
