import 'package:flutter/material.dart';
import 'data/guard_api.dart';
import 'data/guard_session_store.dart';
import 'data/offline_action_queue.dart';
import 'guard_controller.dart';
import 'screens/guard_login_screen.dart';
import 'screens/guard_operations_screen.dart';
import 'screens/guard_workforce_screen.dart';
import 'theme/aaraagate_guard_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const baseUrl = String.fromEnvironment('AARAGATE_API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
  final controller = GuardController(
    api: GuardApi(baseUrl: baseUrl),
    sessions: const GuardSessionStore(),
    offlineQueue: const OfflineActionQueue(),
  );
  runApp(AaraagateGuardApp(controller: controller));
  controller.bootstrap();
}

class AaraagateGuardApp extends StatelessWidget {
  const AaraagateGuardApp({super.key, required this.controller});
  final GuardController controller;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Aaraagate Guard',
      debugShowCheckedModeBanner: false,
      theme: AaraagateGuardTheme.light(),
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          if (controller.booting) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          if (!controller.signedIn) return GuardLoginScreen(controller: controller);
          return Stack(
            children: [
              GuardOperationsScreen(controller: controller),
              Positioned(
                right: 18,
                bottom: 24,
                child: FloatingActionButton.extended(
                  heroTag: 'workforce',
                  onPressed: controller.gateId == null
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => GuardWorkforceScreen(controller: controller)),
                          ),
                  icon: const Icon(Icons.badge_outlined),
                  label: const Text('STAFF', style: TextStyle(fontWeight: FontWeight.w900)),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
