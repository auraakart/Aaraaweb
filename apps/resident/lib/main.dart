import 'package:flutter/material.dart';
import 'auth/auth_repository.dart';
import 'auth/auth_screen.dart';
import 'auth/resident_auth_controller.dart';
import 'auth/session_store.dart';
import 'data/api_client.dart';
import 'data/demo_resident_repository.dart';
import 'data/resident_data_controller.dart';
import 'data/resident_repository.dart';
import 'screens/gate_screen.dart';
import 'screens/billing_screen.dart';
import 'screens/helpdesk_screen.dart';
import 'screens/home_screen.dart';
import 'screens/independent_services_screen.dart';
import 'screens/notices_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/services_screen.dart';
import 'screens/workforce_screen.dart';
import 'theme/aaraagate_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const apiBaseUrl = String.fromEnvironment('AARAGATE_API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
  const demoMode = bool.fromEnvironment('AARAGATE_DEMO_MODE', defaultValue: false);
  final authController = ResidentAuthController(
    repository: AuthRepository(baseUrl: apiBaseUrl),
    sessionStore: SessionStore(),
    demoEnabled: demoMode,
  );
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
      title: 'Aaraagate',
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
  String? _boundContextKey;

  void _ensureDataController() {
    final session = widget.authController.session;
    if (session == null || session.isIndependentHome) return;
    final contextKey = '${session.sessionId}:${session.societyId ?? ''}:${session.activeUnitId ?? ''}';
    if (_boundContextKey == contextKey) return;

    _boundContextKey = contextKey;
    _dataController?.dispose();
    final ResidentRepository repository = widget.authController.isDemoSession
        ? DemoResidentRepository()
        : ResidentRepository(ApiClient(baseUrl: widget.apiBaseUrl, accessToken: session.accessToken));
    _dataController = ResidentDataController(repository, activeUnitId: session.activeUnitId);
  }

  Future<void> _signOut() async {
    await _dataController?.stopPushNotifications();
    await widget.authController.signOut();
  }

  Future<void> _switchProperty(SocietyMembershipOption membership, PropertySummary? property) async {
    await _dataController?.stopPushNotifications();
    await widget.authController.switchProperty(membership, property);
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
          _boundContextKey = null;
          _dataController?.dispose();
          _dataController = null;
          return AuthScreen(controller: widget.authController);
        }

        final session = widget.authController.session!;
        final consumerApiClient = ApiClient(baseUrl: widget.apiBaseUrl, accessToken: session.accessToken);
        if (session.isIndependentHome) {
          _boundContextKey = null;
          _dataController?.dispose();
          _dataController = null;
          return IndependentServicesScreen(
            apiClient: consumerApiClient,
            onSignOut: _signOut,
          );
        }

        _ensureDataController();
        return ResidentHomeShell(
          key: ValueKey('${session.sessionId}:${session.activeUnitId ?? ''}'),
          controller: _dataController!,
          consumerApiClient: consumerApiClient,
          onSignOut: _signOut,
          canManageFamilyMembers: session.role == 'OWNER',
          propertyContexts: widget.authController.memberships,
          currentSocietyId: session.societyId,
          currentUnitId: session.activeUnitId,
          onSwitchProperty: _switchProperty,
        );
      },
    );
  }
}

class ResidentHomeShell extends StatefulWidget {
  const ResidentHomeShell({
    super.key,
    required this.controller,
    required this.consumerApiClient,
    required this.onSignOut,
    required this.canManageFamilyMembers,
    required this.propertyContexts,
    required this.currentSocietyId,
    required this.currentUnitId,
    required this.onSwitchProperty,
  });
  final ResidentDataController controller;
  final ApiClient consumerApiClient;
  final Future<void> Function() onSignOut;
  final bool canManageFamilyMembers;
  final List<SocietyMembershipOption> propertyContexts;
  final String? currentSocietyId;
  final String? currentUnitId;
  final Future<void> Function(SocietyMembershipOption membership, PropertySummary? property) onSwitchProperty;

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

  void _openExternalServices() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => IndependentServicesScreen(
          apiClient: widget.consumerApiClient,
          independentMode: false,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final pages = <Widget>[
          HomeScreen(
            controller: controller,
            onOpenGate: () => _open(1),
            onOpenServices: _openExternalServices,
            onOpenHelpdesk: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => HelpdeskScreen(controller: controller)),
            ),
            onOpenNotices: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => NoticesScreen(controller: controller)),
            ),
            onOpenBilling: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => BillingScreen(repository: controller.repository)),
            ),
          ),
          GateScreen(controller: controller),
          WorkforceScreen(controller: controller),
          ServicesScreen(controller: controller),
          ProfileScreen(
            controller: controller,
            onSignOut: widget.onSignOut,
            canManageFamilyMembers: widget.canManageFamilyMembers,
            propertyContexts: widget.propertyContexts,
            currentSocietyId: widget.currentSocietyId,
            currentUnitId: widget.currentUnitId,
            onSwitchProperty: widget.onSwitchProperty,
          ),
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
                                    child: const Text('Deny'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: FilledButton(
                                    onPressed: () => controller.approveAccess(pending['id'].toString()),
                                    child: const Text('Allow'),
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
              NavigationDestination(icon: Icon(Icons.badge_outlined), selectedIcon: Icon(Icons.badge_rounded), label: 'Staff'),
              NavigationDestination(icon: Icon(Icons.handyman_outlined), selectedIcon: Icon(Icons.handyman_rounded), label: 'Services'),
              NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person_rounded), label: 'Profile'),
            ],
          ),
        );
      },
    );
  }
}
