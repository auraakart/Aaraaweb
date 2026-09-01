import 'package:flutter/material.dart';
import 'auth/auth_repository.dart';
import 'auth/auth_screen.dart';
import 'auth/resident_auth_controller.dart';
import 'auth/session_store.dart';
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
  WidgetsFlutterBinding.ensureInitialized();
  const apiBaseUrl = String.fromEnvironment('AARAGATE_API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
  final authController = ResidentAuthController(repository: AuthRepository(baseUrl: apiBaseUrl), sessionStore: SessionStore());
  runApp(AaraagateResidentApp(apiBaseUrl: apiBaseUrl, authController: authController));
  authController.bootstrap();
}

class AaraagateResidentApp extends StatelessWidget {
  const AaraagateResidentApp({super.key, required this.apiBaseUrl, required this.authController});
  final String apiBaseUrl;
  final ResidentAuthController authController;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AuraGate',
      debugShowCheckedModeBanner: false,
      theme: AaraagateTheme.light(),
      home: _ResidentSessionGate(apiBaseUrl: apiBaseUrl, authController: authController),
    );
  }
}

class _ResidentSessionGate extends StatefulWidget {
  const _ResidentSessionGate({required this.apiBaseUrl, required this.authController});
  final String apiBaseUrl;
  final ResidentAuthController authController;

  @override
  State<_ResidentSessionGate> createState() => _ResidentSessionGateState();
}

class _ResidentSessionGateState extends State<_ResidentSessionGate> {
  ResidentDataController? _dataController;
  String? _boundSessionId;

  void _ensureDataController() {
    final session = widget.authController.session;
    if (session == null || _boundSessionId == session.sessionId) return;
    _boundSessionId = session.sessionId;
    _dataController?.dispose();
    _dataController = ResidentDataController(ResidentRepository(ApiClient(baseUrl: widget.apiBaseUrl, accessToken: session.accessToken)));
  }

  Future<void> _signOut() async {
    await _dataController?.stopPushNotifications();
    await widget.authController.signOut();
  }

  @override
  void dispose() {
    _dataController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.authController,
      builder: (context, _) {
        if (widget.authController.step != ResidentAuthStep.signedIn) {
          _boundSessionId = null;
          _dataController?.dispose();
          _dataController = null;
          return AuthScreen(controller: widget.authController);
        }
        _ensureDataController();
        return ResidentHomeShell(controller: _dataController!, onSignOut: _signOut);
      },
    );
  }
}

class ResidentHomeShell extends StatefulWidget {
  const ResidentHomeShell({super.key, required this.controller, required this.onSignOut});
  final ResidentDataController controller;
  final Future<void> Function() onSignOut;

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
        final pages = <Widget>[
          HomeScreen(controller: controller, onOpenGate: () => _open(1), onOpenServices: () => _open(2)),
          GateScreen(controller: controller),
          ServicesScreen(controller: controller),
          const CommunityScreen(),
          ProfileScreen(controller: controller, onSignOut: widget.onSignOut),
        ];
        final pending = controller.firstPendingAccess;
        final eventRequestId = controller.latestAccessEvent?['requestId']?.toString();
        final showRealtimeApproval = pending != null && eventRequestId == pending['id']?.toString();

        return Scaffold(
          body: Stack(
            children: [
              IndexedStack(index: _index, children: pages),
              if (showRealtimeApproval)
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Material(
                      elevation: 8,
                      borderRadius: BorderRadius.circular(20),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.notifications_active_rounded),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    '${pending['subjectName'] ?? 'Someone'} is at the gate',
                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text('${pending['subjectType']?.toString().replaceAll('_', ' ') ?? 'VISITOR'} · Approval required'),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () => controller.denyAccess(pending['id'].toString()),
                                    child: const Text('DENY'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: FilledButton(
                                    onPressed: () => controller.approveAccess(pending['id'].toString()),
                                    child: const Text('ALLOW'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
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
