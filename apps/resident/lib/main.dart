import 'package:flutter/material.dart';
import 'data/api_client.dart';
import 'data/resident_data_controller.dart';
import 'data/resident_repository.dart';
import 'screens/community_screen.dart';
import 'screens/gate_screen.dart';
import 'screens/home_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/services_screen.dart';
import 'theme/aaraagate_theme.dart';

void main() {
  const apiBaseUrl = String.fromEnvironment('AARAGATE_API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
  const accessToken = String.fromEnvironment('AARAGATE_ACCESS_TOKEN');
  final controller = ResidentDataController(ResidentRepository(ApiClient(baseUrl: apiBaseUrl, accessToken: accessToken)));
  runApp(AaraagateResidentApp(controller: controller));
}

class AaraagateResidentApp extends StatelessWidget {
  const AaraagateResidentApp({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AuraGate',
      debugShowCheckedModeBanner: false,
      theme: AaraagateTheme.light(),
      home: ResidentHomeShell(controller: controller),
    );
  }
}

class ResidentHomeShell extends StatefulWidget {
  const ResidentHomeShell({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  State<ResidentHomeShell> createState() => _ResidentHomeShellState();
}

class _ResidentHomeShellState extends State<ResidentHomeShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    widget.controller.load();
  }

  void _open(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        if (controller.authError != null) {
          return Scaffold(
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.lock_outline_rounded, size: 48),
                      const SizedBox(height: 16),
                      Text('Sign in required', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      const Text('The resident app is connected to the live API. Start it with an authenticated access token until the OTP sign-in flow is wired into this shell.', textAlign: TextAlign.center),
                      const SizedBox(height: 18),
                      FilledButton.icon(onPressed: controller.load, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
                    ],
                  ),
                ),
              ),
            ),
          );
        }

        final pages = <Widget>[
          HomeScreen(onOpenGate: () => _open(1), onOpenServices: () => _open(2)),
          GateScreen(controller: controller),
          ServicesScreen(controller: controller),
          const CommunityScreen(),
          ProfileScreen(controller: controller),
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
      },
    );
  }
}
