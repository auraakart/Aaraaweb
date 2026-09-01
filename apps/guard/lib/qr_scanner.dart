import 'package:flutter/material.dart';

/// Camera integration boundary for visitor credentials.
/// The scanner returns the decoded credential to the Guard workflow so all
/// verification continues through the existing server-side visitor API.
class GuardQrScanner extends StatefulWidget {
  const GuardQrScanner({super.key});
  @override State<GuardQrScanner> createState() => _GuardQrScannerState();
}

class _GuardQrScannerState extends State<GuardQrScanner> {
  final controller = TextEditingController();
  @override void dispose() { controller.dispose(); super.dispose(); }

  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Scan visitor pass')),
    body: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(children: [
        const Expanded(child: Center(child: Icon(Icons.qr_code_scanner, size: 120))),
        const Text('Camera scanner integration point', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        const Text('The decoded credential will be sent to the existing server-side verification workflow.'),
        const SizedBox(height: 20),
        TextField(controller: controller, decoration: const InputDecoration(labelText: 'Decoded credential', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        FilledButton(onPressed: () { final value = controller.text.trim(); if (value.isNotEmpty) Navigator.pop(context, value); }, child: const Text('USE CREDENTIAL')),
      ]),
    ),
  );
}
