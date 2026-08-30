import 'package:flutter/material.dart';

void main() => runApp(const AaraagateGuardApp());

class AaraagateGuardApp extends StatelessWidget {
  const AaraagateGuardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'aaraagate Guard',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF2457D6)),
      home: const GuardGateShell(),
    );
  }
}

class GuardGateShell extends StatelessWidget {
  const GuardGateShell({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gate Operations')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Ready at Gate 1', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  const Text('Fast entry workflow. Server verification status will be explicit.'),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: null,
                    icon: const Icon(Icons.person_add_alt_1),
                    label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('NEW VISITOR')),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: null,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('SCAN PASS')),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          const ListTile(leading: Icon(Icons.cloud_done), title: Text('Connection status'), subtitle: Text('Online — server verification available')),
          const ListTile(leading: Icon(Icons.pending_actions), title: Text('Pending approvals'), subtitle: Text('No live data yet')),
        ],
      ),
    );
  }
}
