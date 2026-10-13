import 'package:flutter/material.dart';
import 'package:aaraagate_branding_runtime/society_logo_fetcher.dart';
import 'data/guard_api.dart';
import 'data/guard_session_store.dart';
import 'data/guard_preferences.dart';
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
import 'theme/guard_branding_controller.dart';
import 'voice/guard_voice.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const baseUrl = String.fromEnvironment('AARAGATE_API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
  final controller = GuardController(
    api: GuardApi(baseUrl: baseUrl),
    sessions: const GuardSessionStore(),
    offlineQueue: const OfflineActionQueue(),
    preferences: const SecureGuardPreferences(),
    voice: DeviceGuardVoice(),
  );
  runApp(AaraagateGuardApp(controller: controller));
  controller.bootstrap();
}

class AaraagateGuardApp extends StatefulWidget {
  const AaraagateGuardApp({super.key, required this.controller});
  final GuardController controller;

  @override
  State<AaraagateGuardApp> createState() => _AaraagateGuardAppState();
}

class _AaraagateGuardAppState extends State<AaraagateGuardApp> with WidgetsBindingObserver {
  late final GuardBrandingController _branding;

  @override
  void initState() {
    super.initState();
    _branding = GuardBrandingController(
      sessionChanges: widget.controller,
      currentSession: () => widget.controller.session,
      fetchLogo: (session) => fetchPublishedSocietyLogo(
        baseUrl: widget.controller.api.baseUrl, accessToken: session.accessToken),
      fetchContext: (session) => widget.controller.api.brandingContext(
        sessionAccessToken: session.accessToken,
      ),
    );
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _branding.refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _branding.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _branding,
      builder: (context, _) {
        final societyBrand = _branding.current;
        return MaterialApp(
      title: societyBrand == null ? 'Aaraagate Guard' : '${societyBrand.displayName} Guard',
      debugShowCheckedModeBanner: false,
      theme: AaraagateGuardTheme.light(societyBrand: societyBrand),
      darkTheme: AaraagateGuardTheme.dark(societyBrand: societyBrand),
      themeMode: ThemeMode.system,
      home: AnimatedBuilder(
        animation: widget.controller,
        builder: (context, _) {
          final strings = GuardStrings(widget.controller.languageCode);
          if (widget.controller.booting) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          if (!widget.controller.signedIn) return GuardLoginScreen(controller: widget.controller);
          return Stack(
            children: [
              GuardOperationsScreen(controller: widget.controller, societyLogoBytes: _branding.logoBytes),
              Positioned(
                right: 18,
                bottom: 24,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    FloatingActionButton.extended(
                      heroTag: 'quick-arrival',
                      onPressed: widget.controller.gateId == null ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardQuickArrivalScreen(controller: widget.controller))),
                      icon: const Icon(Icons.flash_on_rounded),
                      label: Text(strings.get('quick').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)),
                    ),
                    const SizedBox(height: 10),
                    FloatingActionButton.extended(
                      heroTag: 'tools',
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardToolsScreen(controller: widget.controller))),
                      icon: const Icon(Icons.manage_search_rounded),
                      label: Text(strings.get('tools').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)),
                    ),
                    const SizedBox(height: 10),
                    FloatingActionButton.extended(
                      heroTag: 'parcels',
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardParcelsScreen(controller: widget.controller))),
                      icon: const Icon(Icons.inventory_2_outlined),
                      label: Text(strings.get('parcels').toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900)),
                    ),
                    const SizedBox(height: 10),
                    FloatingActionButton.extended(
                      heroTag: 'workforce',
                      onPressed: widget.controller.gateId == null ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardWorkforceScreen(controller: widget.controller))),
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
      },
    );
  }
}
