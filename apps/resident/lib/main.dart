import 'package:flutter/material.dart';

void main() => runApp(const AaraagateResidentApp());

class AaraagateResidentApp extends StatelessWidget {
  const AaraagateResidentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'aaraagate',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF176B4D)),
      home: const ResidentHomeShell(),
    );
  }
}

class ResidentHomeShell extends StatelessWidget {
  const ResidentHomeShell({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('aaraagate')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          Text('Good morning', style: TextStyle(fontSize: 16)),
          SizedBox(height: 4),
          Text('Your community at a glance', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
          SizedBox(height: 24),
          Card(child: Padding(padding: EdgeInsets.all(20), child: Text('Approve visitors and manage passes in a few taps.'))),
        ],
      ),
      bottomNavigationBar: const NavigationBar(
        selectedIndex: 0,
        destinations: [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.shield_outlined), label: 'Gate'),
          NavigationDestination(icon: Icon(Icons.handyman_outlined), label: 'Services'),
          NavigationDestination(icon: Icon(Icons.forum_outlined), label: 'Community'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
        ],
      ),
    );
  }
}
