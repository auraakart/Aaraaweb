import 'package:flutter/material.dart';
import 'data/guard_api.dart';
import 'data/guard_session_store.dart';
import 'data/offline_action_queue.dart';
import 'guard_controller.dart';
import 'screens/guard_login_screen.dart';
import 'screens/guard_operations_screen.dart';

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
      title: 'AuraGate Guard',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF176B4D),
        scaffoldBackgroundColor: const Color(0xFFF6F8F7),
      ),
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          if (controller.booting) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return controller.signedIn
              ? GuardOperationsScreen(controller: controller)
              : GuardLoginScreen(controller: controller);
        },
      ),
    );
  }
}
