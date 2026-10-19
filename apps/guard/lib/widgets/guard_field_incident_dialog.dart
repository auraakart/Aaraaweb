import 'package:flutter/material.dart';

/// Reporting is validated locally before using the existing Guard Operations
/// createIncident API and authorization path in the calling screen.
class GuardFieldIncidentDialog extends StatefulWidget {
  const GuardFieldIncidentDialog({super.key});

  @override
  State<GuardFieldIncidentDialog> createState() =>
      _GuardFieldIncidentDialogState();
}

class _GuardFieldIncidentDialogState
    extends State<GuardFieldIncidentDialog> {
  String severity = 'MEDIUM';
  final category = TextEditingController();
  final title = TextEditingController();
  final description = TextEditingController();
  final mediaRefs = TextEditingController();

  bool get canReport =>
      category.text.trim().isNotEmpty && title.text.trim().isNotEmpty;

  void _updateRequiredField(String _) => setState(() {});

  void _report() {
    if (!canReport) return;
    Navigator.pop(context, <String, String>{
      'severity': severity,
      'category': category.text.trim(),
      'title': title.text.trim(),
      'description': description.text.trim(),
      'mediaRefs': mediaRefs.text.trim(),
    });
  }

  @override
  void dispose() {
    category.dispose();
    title.dispose();
    description.dispose();
    mediaRefs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Report incident'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            DropdownButtonFormField<String>(
              initialValue: severity,
              isExpanded: true,
              items: const ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
                  .map((value) => DropdownMenuItem(
                        value: value,
                        child: Text(value),
                      ))
                  .toList(),
              onChanged: (value) =>
                  setState(() => severity = value ?? 'MEDIUM'),
              decoration: const InputDecoration(labelText: 'Severity'),
            ),
            TextField(
              controller: category,
              onChanged: _updateRequiredField,
              decoration: const InputDecoration(
                labelText: 'Category',
                helperText: 'Required',
              ),
            ),
            TextField(
              controller: title,
              onChanged: _updateRequiredField,
              decoration: const InputDecoration(
                labelText: 'Title',
                helperText: 'Required',
              ),
            ),
            TextField(
              controller: description,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Details'),
            ),
            TextField(
              controller: mediaRefs,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Evidence references',
                hintText: 'One uploaded file/reference id per line',
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
          onPressed: canReport ? _report : null,
          child: const Text('REPORT'),
        ),
      ],
    );
  }
}
