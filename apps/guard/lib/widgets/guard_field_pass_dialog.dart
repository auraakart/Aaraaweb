import 'package:flutter/material.dart';

/// Material and move pass capture; submitting still delegates to the existing
/// guard operations API through the caller's unchanged route callback.
class GuardFieldPassDialog extends StatefulWidget {
  const GuardFieldPassDialog({super.key});

  @override
  State<GuardFieldPassDialog> createState() => _GuardFieldPassDialogState();
}

class _GuardFieldPassDialogState extends State<GuardFieldPassDialog> {
  String movement = 'MATERIAL_OUT';
  final reference = TextEditingController();
  final subject = TextEditingController();
  final items = TextEditingController();
  final vehicle = TextEditingController();

  bool get canCreate =>
      reference.text.trim().isNotEmpty &&
      subject.text.trim().isNotEmpty &&
      items.text.trim().isNotEmpty;

  void _update(String _) => setState(() {});

  void _create() {
    if (!canCreate) return;
    Navigator.pop(context, {
      'movementType': movement,
      'referenceCode': reference.text.trim(),
      'subjectName': subject.text.trim(),
      'itemDescription': items.text.trim(),
      'vehicleNumber': vehicle.text.trim(),
    });
  }

  @override
  void dispose() {
    reference.dispose();
    subject.dispose();
    items.dispose();
    vehicle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Create gate pass'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              initialValue: movement,
              isExpanded: true,
              items: const [
                'MATERIAL_IN',
                'MATERIAL_OUT',
                'MOVE_IN',
                'MOVE_OUT',
              ].map(
                (value) => DropdownMenuItem(
                  value: value,
                  child: Text(
                    value.replaceAll('_', ' '),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ).toList(),
              onChanged: (value) =>
                  setState(() => movement = value ?? 'MATERIAL_OUT'),
              decoration: const InputDecoration(labelText: 'Movement'),
            ),
            TextField(
              controller: reference,
              onChanged: _update,
              decoration: const InputDecoration(labelText: 'Reference'),
            ),
            TextField(
              controller: subject,
              onChanged: _update,
              decoration: const InputDecoration(labelText: 'Person / vendor'),
            ),
            TextField(
              controller: items,
              onChanged: _update,
              decoration: const InputDecoration(labelText: 'Items / move details'),
            ),
            TextField(
              controller: vehicle,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Vehicle number'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('CANCEL'),
        ),
        FilledButton(
          onPressed: canCreate ? _create : null,
          child: const Text('CREATE'),
        ),
      ],
    );
  }
}
