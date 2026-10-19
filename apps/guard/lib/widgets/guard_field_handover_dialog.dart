import 'package:flutter/material.dart';

/// Operator-side shift handover capture. The existing screen retains the
/// authenticated createShiftHandover operation, gateId and refresh behavior.
class GuardFieldHandoverDialog extends StatefulWidget {
  const GuardFieldHandoverDialog({super.key});

  @override
  State<GuardFieldHandoverDialog> createState() =>
      _GuardFieldHandoverDialogState();
}

class _GuardFieldHandoverDialogState
    extends State<GuardFieldHandoverDialog> {
  final summary = TextEditingController();
  final items = TextEditingController();

  bool get canHandover => summary.text.trim().length >= 3;

  void _updateSummary(String _) => setState(() {});

  void _submit() {
    if (!canHandover) return;
    Navigator.pop(context, <String, dynamic>{
      'summary': summary.text.trim(),
      'openItems': items.text
          .split('\n')
          .map((entry) => entry.trim())
          .where((entry) => entry.isNotEmpty)
          .toList(),
    });
  }

  @override
  void dispose() {
    summary.dispose();
    items.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Shift handover'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: summary,
              onChanged: _updateSummary,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Shift summary',
                hintText: 'What should the incoming guard know?',
                helperText: 'Required · at least 3 characters',
              ),
            ),
            TextField(
              controller: items,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Open items',
                hintText: 'One pending item per line',
              ),
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
          onPressed: canHandover ? _submit : null,
          child: const Text('HAND OVER'),
        ),
      ],
    );
  }
}
