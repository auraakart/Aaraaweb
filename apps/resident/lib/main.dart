import 'package:flutter/material.dart';
import 'screens/community_screen.dart';
import 'screens/gate_screen.dart';
import 'screens/home_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/services_screen.dart';
import 'theme/aaraagate_theme.dart';

void main() => runApp(const AaraagateResidentApp());

class AaraagateResidentApp extends StatelessWidget {
  const AaraagateResidentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AuraGate',
      debugShowCheckedModeBanner: false,
      theme: AaraagateTheme.light(),
      home: const ResidentHomeShell(),
    );
  }
}

class ResidentHomeShell extends StatefulWidget {
  const ResidentHomeShell({super.key});

  @override
  State<ResidentHomeShell> createState() => _ResidentHomeShellState();
}

class _ResidentHomeShellState extends State<ResidentHomeShell> {
  int _index = 0;

  void _open(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      HomeScreen(onOpenGate: () => _open(1), onOpenServices: () => _open(2)),
      const GateScreen(),
      const ServicesScreen(),
      const CommunityScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _open,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield_rounded), label: 'Gate'),
          NavigationDestination(icon: Icon(Icons.handyman_outlined), selectedIcon: Icon(Icons.handyman_rounded), label: 'Services'),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum_rounded), label: 'Community'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person_rounded), label: 'Profile'),
        ],
      ),
    );
  }
}
