import 'package:flutter/material.dart';
import '../data/demo_household_state.dart';
import '../data/emergency_contact_actions.dart';
import '../data/resident_data_controller.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

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
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (_) {
      if (mounted) setState(() => _error = 'This contact change could not be saved. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
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
        padding: const EdgeInsets.fromLTRB(
          AaraagateTokens.pageGutter,
          AaraagateTokens.space4,
          AaraagateTokens.pageGutter,
          96,
        ),
        children: [
          PremiumSectionHeader(
            title: 'Trusted contacts',
            supportingText: 'Keep household emergency contacts easy to reach. These contacts do not change society membership or occupancy.',
            trailing: AaraagateStatusPill(label: '${contacts.length}', tone: contacts.isEmpty ? AaraagateStatusTone.neutral : AaraagateStatusTone.info),
          ),
          const SizedBox(height: AaraagateTokens.space4),
          PremiumSurface(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline_rounded, color: scheme.primary),
                const SizedBox(width: AaraagateTokens.space3),
                Expanded(
                  child: Text(
                    'Contacts are household information only and are not treated as residents or society members.',
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AaraagateTokens.space3),
            AppStateCard(icon: Icons.error_outline_rounded, message: _error!),
          ],
          if (_busy) ...[
            const SizedBox(height: AaraagateTokens.space3),
            const LinearProgressIndicator(),
          ],
          const SizedBox(height: AaraagateTokens.space4),
          if (contacts.isEmpty)
            const AppStateCard(icon: Icons.contact_emergency_outlined, message: 'No emergency contacts added yet.')
          else
            for (final contact in contacts) ...[
              PremiumSurface(
                padding: const EdgeInsets.all(AaraagateTokens.space4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: AaraagateTokens.iconContainer,
                      height: AaraagateTokens.iconContainer,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                      child: Icon(Icons.contact_emergency_rounded, color: scheme.onPrimaryContainer),
                    ),
                    const SizedBox(width: AaraagateTokens.space3),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: Text(contact['name']?.toString() ?? 'Emergency contact', style: theme.textTheme.titleMedium)),
                            const SizedBox(width: AaraagateTokens.space2),
                            AaraagateStatusPill(
                              label: (contact['priority'] as int? ?? 1) == 1 ? 'Primary' : 'Priority ${contact['priority'] ?? 1}',
                              tone: (contact['priority'] as int? ?? 1) == 1 ? AaraagateStatusTone.info : AaraagateStatusTone.neutral,
                            ),
                          ],
                        ),
                        const SizedBox(height: AaraagateTokens.space1),
                        Text(contact['phone']?.toString() ?? '', style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                        if (contact['relation']?.toString().trim().isNotEmpty == true) ...[
                          const SizedBox(height: AaraagateTokens.space1),
                          Text(contact['relation'].toString(), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                        ],
                      ]),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded),
                      tooltip: 'Remove contact',
                      onPressed: _busy ? null : () => _remove(contact),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AaraagateTokens.space3),
            ],
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
          const SizedBox(height: AaraagateTokens.space3),
          TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Mobile number'), keyboardType: TextInputType.phone),
          const SizedBox(height: AaraagateTokens.space3),
          TextField(controller: _relation, decoration: const InputDecoration(labelText: 'Relationship (optional)')),
          const SizedBox(height: AaraagateTokens.space3),
          DropdownButtonFormField<int>(
            initialValue: _priority,
            decoration: const InputDecoration(labelText: 'Priority'),
            items: const [
              DropdownMenuItem(value: 1, child: Text('1 - Primary')),
              DropdownMenuItem(value: 2, child: Text('2')),
              DropdownMenuItem(value: 3, child: Text('3')),
            ],
            onChanged: (value) => value == null ? null : setState(() => _priority = value),
          ),
          if (_error != null) ...[
            const SizedBox(height: AaraagateTokens.space2),
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
