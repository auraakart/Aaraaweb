import 'package:flutter/material.dart';
import 'data/guard_api.dart';
import 'data/guard_session_store.dart';
import 'data/offline_action_queue.dart';
import 'guard_controller.dart';
import 'localization/guard_strings.dart';
import 'screens/guard_login_screen.dart';
import 'screens/guard_operations_screen.dart';
import 'screens/guard_parcels_screen.dart';
import 'screens/guard_quick_arrival_screen.dart';
import 'screens/guard_tools_screen.dart';
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
      darkTheme: AaraagateGuardTheme.dark(),
      themeMode: ThemeMode.system,
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final strings = GuardStrings(controller.languageCode);
          if (controller.booting) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          if (!controller.signedIn) return GuardLoginScreen(controller: controller);
          return Stack(
            children: [
              GuardOperationsScreen(controller: controller),
              Positioned(
                right: 18,
                bottom: 24,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    FloatingActionButton.extended(
                      heroTag: 'quick-arrival',
                      onPressed: controller.gateId == null ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardQuickArrivalScreen(controller: controller))),
                      icon: const Icon(Icons.flash_on_rounded),
                      label: Text(strings.get('quick').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)),
                    ),
                    const SizedBox(height: 10),
                    FloatingActionButton.extended(
                      heroTag: 'tools',
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardToolsScreen(controller: controller))),
                      icon: const Icon(Icons.manage_search_rounded),
                      label: Text(strings.get('tools').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)),
                    ),
                    const SizedBox(height: 10),
                    FloatingActionButton.extended(
                      heroTag: 'parcels',
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardParcelsScreen(controller: controller))),
                      icon: const Icon(Icons.inventory_2_outlined),
                      label: Text(strings.get('parcels').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)),
                    ),
                    const SizedBox(height: 10),
                    FloatingActionButton.extended(
                      heroTag: 'workforce',
                      onPressed: controller.gateId == null ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardWorkforceScreen(controller: controller))),
                      icon: const Icon(Icons.badge_outlined),
                      label: Text(strings.get('staff').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
