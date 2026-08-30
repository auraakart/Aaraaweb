import 'package:flutter/material.dart';

void main() => runApp(const AaraagateGuardApp());

class AaraagateGuardApp extends StatelessWidget {
  const AaraagateGuardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'aaraagate Guard',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF176B4D)),
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
        children: const [
          Card(child: Padding(padding: EdgeInsets.all(18), child: Text('Ready at Gate 1', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)))),
          SizedBox(height: 12),
          FilledButton(onPressed: null, child: Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('NEW VISITOR'))),
          SizedBox(height: 12),
          OutlinedButton(onPressed: null, child: Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('SCAN PASS'))),
          ListTile(leading: Icon(Icons.cloud_done), title: Text('Connection status'), subtitle: Text('Online — server verification available')),
          ListTile(leading: Icon(Icons.pending_actions), title: Text('Pending approvals'), subtitle: Text('No live data yet')),
        ],
      ),
    );
  }
}
