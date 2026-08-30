import 'package:flutter/material.dart';

void main() => runApp(const AaraagateResidentApp());

class AaraagateResidentApp extends StatelessWidget {
  const AaraagateResidentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'aaraagate',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF2457D6),
        scaffoldBackgroundColor: const Color(0xFFF7F8FA),
      ),
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
          _PrimaryActionCard(),
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

class _PrimaryActionCard extends StatelessWidget {
  const _PrimaryActionCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Gate access', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  SizedBox(height: 6),
                  Text('Approve visitors and manage passes in a few taps.'),
                ],
              ),
            ),
            FilledButton(onPressed: null, child: Text('Open')),
          ],
        ),
      ),
    );
  }
}
