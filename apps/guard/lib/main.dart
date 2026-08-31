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
      home: const GuardDashboard(),
    );
  }
}

class GuardDashboard extends StatefulWidget {
  const GuardDashboard({super.key});
  @override
  State<GuardDashboard> createState() => _GuardDashboardState();
}

class _GuardDashboardState extends State<GuardDashboard> {
  final credential = TextEditingController();
  String status = 'Ready to verify';
  bool busy = false;

  @override
  void dispose() { credential.dispose(); super.dispose(); }

  Future<void> verify() async {
    if (credential.text.trim().isEmpty) {
      setState(() => status = 'Enter or scan a visitor pass');
      return;
    }
    setState(() { busy = true; status = 'Verifying pass…'; });
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;
    setState(() { busy = false; status = 'Pass ready for server verification'; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gate Operations'), actions: [
        IconButton(onPressed: () {}, tooltip: 'Language', icon: const Icon(Icons.language)),
      ]),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
        Card(child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
          const Icon(Icons.shield_outlined, size: 34), const SizedBox(width: 14),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Gate 1', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)), Text('Security shift active')])) ,
          Chip(label: const Text('ONLINE')),
        ]))),
        const SizedBox(height: 18),
        const Text('Visitor verification', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        TextField(controller: credential, textInputAction: TextInputAction.done, onSubmitted: (_) => verify(), decoration: const InputDecoration(labelText: 'Pass code', hintText: 'Enter or scan credential', prefixIcon: Icon(Icons.qr_code_2), border: OutlineInputBorder())),
        const SizedBox(height: 12),
        FilledButton.icon(onPressed: busy ? null : verify, icon: const Icon(Icons.verified_user), label: Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Text(busy ? 'VERIFYING…' : 'VERIFY PASS')),
        const SizedBox(height: 12),
        Card(child: ListTile(leading: Icon(status.startsWith('Pass') ? Icons.check_circle : Icons.info_outline), title: Text(status), subtitle: const Text('Use the server result before allowing entry.'))),
        const SizedBox(height: 18),
        Row(children: [
          Expanded(child: FilledButton.tonalIcon(onPressed: busy ? null : () => setState(() => status = 'Check-in requested'), icon: const Icon(Icons.login), label: const Text('CHECK IN'))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton.icon(onPressed: busy ? null : () => setState(() => status = 'Check-out requested'), icon: const Icon(Icons.logout), label: const Text('CHECK OUT'))),
        ]),
        const SizedBox(height: 24),
        const Text('Recent activity', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const ListTile(leading: CircleAvatar(child: Icon(Icons.login)), title: Text('Visitor check-in'), subtitle: Text('Awaiting live audit data')),
        const ListTile(leading: CircleAvatar(child: Icon(Icons.logout)), title: Text('Visitor check-out'), subtitle: Text('Awaiting live audit data')),
      ])),
    );
  }
}
