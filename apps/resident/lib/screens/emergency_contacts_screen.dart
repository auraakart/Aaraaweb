import 'package:flutter/material.dart';
import '../data/demo_household_state.dart';
import '../data/emergency_contact_actions.dart';
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
  bool get _demo => widget.householdId.startsWith('demo-');

  Map<String, dynamic>? get _household {
    for (final item in widget.controller.households) {
      if (item['id']?.toString() == widget.householdId) return item;
    }
    return null;
  }

  List<Map<String, dynamic>> get _contacts {
    if (_demo) return DemoHouseholdState.contactsFor(widget.householdId);
    final raw = _household?['emergencyContacts'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  Future<void> _add() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _EmergencyContactDialog(),
    );
    if (!mounted || result == null) return;
    await _run(() async {
      if (_demo) {
        final contacts = DemoHouseholdState.contactsFor(widget.householdId);
        contacts.add({
          'id': 'demo-contact-${DateTime.now().microsecondsSinceEpoch}',
          'name': result['name'],
          'phone': result['phone'],
          'relation': result['relation'],
          'priority': result['priority'],
        });
        return;
      }
      await widget.controller.repository.addEmergencyContact(
        householdId: widget.householdId,
        name: result['name'].toString(),
        phone: result['phone'].toString(),
        relation: result['relation']?.toString(),
        priority: result['priority'] as int? ?? 1,
      );
      await widget.controller.load();
    });
  }

  Future<void> _remove(Map<String, dynamic> contact) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove emergency contact?'),
        content: Text('${contact['name'] ?? 'This contact'} will be removed from this household.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove')),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    await _run(() async {
      if (_demo) {
        DemoHouseholdState.contactsFor(widget.householdId).removeWhere((item) => item['id'] == contact['id']);
        return;
      }
      await widget.controller.repository.deactivateEmergencyContact(
        householdId: widget.householdId,
        contactId: contact['id'].toString(),
      );
      await widget.controller.load();
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
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
    final contacts = [..._contacts]
      ..sort((a, b) => (a['priority'] as int? ?? 999).compareTo(b['priority'] as int? ?? 999));
    return Scaffold(
      appBar: AppBar(title: const Text('Emergency contacts')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _add,
        icon: const Icon(Icons.add_ic_call_rounded),
        label: const Text('Add contact'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 96),
        children: [
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Keep trusted contacts here for emergencies. These contacts are household information and do not change society membership.'),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error), textAlign: TextAlign.center),
          ],
          const SizedBox(height: 14),
          if (_busy) const LinearProgressIndicator(),
          if (contacts.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('No emergency contacts added yet.'))))
          else
            for (final contact in contacts)
              Card(
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.contact_emergency_rounded)),
                  title: Text(contact['name']?.toString() ?? 'Emergency contact', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text([
                    contact['phone']?.toString() ?? '',
                    if (contact['relation']?.toString().trim().isNotEmpty == true) contact['relation'].toString(),
                    'Priority ${contact['priority'] ?? 1}',
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
      setState(() => _error = 'Enter a name and a valid mobile number.');
      return;
    }
    Navigator.pop(context, {
      'name': name,
      'phone': phone,
      'relation': _relation.text.trim(),
      'priority': _priority,
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add emergency contact'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name'), textCapitalization: TextCapitalization.words),
          const SizedBox(height: 12),
          TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Mobile number'), keyboardType: TextInputType.phone),
          const SizedBox(height: 12),
          TextField(controller: _relation, decoration: const InputDecoration(labelText: 'Relationship (optional)')),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            value: _priority,
            decoration: const InputDecoration(labelText: 'Priority'),
            items: const [
              DropdownMenuItem(value: 1, child: Text('1 - Primary')),
              DropdownMenuItem(value: 2, child: Text('2')),
              DropdownMenuItem(value: 3, child: Text('3')),
            ],
            onChanged: (value) => value == null ? null : setState(() => _priority = value),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
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
