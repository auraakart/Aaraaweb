import 'package:flutter/material.dart';
import 'auth/auth_repository.dart';
import 'auth/auth_screen.dart';
import 'auth/resident_auth_controller.dart';
import 'auth/session_store.dart';
import 'data/api_client.dart';
import 'data/demo_resident_repository.dart';
import 'data/resident_data_controller.dart';
import 'data/resident_repository.dart';
import 'screens/amenities_screen.dart';
import 'screens/billing_screen.dart';
import 'screens/gate_screen.dart';
import 'screens/helpdesk_screen.dart';
import 'screens/home_screen.dart';
import 'screens/independent_services_screen.dart';
import 'screens/notices_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/services_screen.dart';
import 'screens/workforce_screen.dart';
import 'theme/aaraagate_theme.dart';

const _demoFeatures = <String>{
  'VISITOR_MANAGEMENT',
  'DELIVERY_MANAGEMENT',
  'DOMESTIC_HELP',
  'NOTICES',
  'HELPDESK',
  'SOS',
  'HOUSEHOLD_SERVICES',
  'MAINTENANCE_BILLING',
  'PAYMENTS',
  'AMENITIES',
};

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const apiBaseUrl = String.fromEnvironment('AARAGATE_API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');
  const demoMode = bool.fromEnvironment('AARAGATE_DEMO_MODE', defaultValue: false);
  final authController = ResidentAuthController(repository: AuthRepository(baseUrl: apiBaseUrl), sessionStore: SessionStore(), demoEnabled: demoMode);
  runApp(AaraagateResidentApp(apiBaseUrl: apiBaseUrl, authController: authController));
  authController.bootstrap();
}

class AaraagateResidentApp extends StatelessWidget {
  const AaraagateResidentApp({super.key, required this.apiBaseUrl, required this.authController});
  final String apiBaseUrl;
  final ResidentAuthController authController;
  @override
  Widget build(BuildContext context) => MaterialApp(title: 'Aaraagate', debugShowCheckedModeBanner: false, theme: AaraagateTheme.light(), home: _ResidentSessionGate(apiBaseUrl: apiBaseUrl, authController: authController));
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
    final demo = widget.authController.isDemoSession;
    final ResidentRepository repository = demo ? DemoResidentRepository() : ResidentRepository(ApiClient(baseUrl: widget.apiBaseUrl, accessToken: session.accessToken));
    _dataController = ResidentDataController(
      repository,
      activeUnitId: session.activeUnitId,
      initialEnabledFeatures: demo ? _demoFeatures : null,
      fetchEntitlements: !demo,
    );
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
          return IndependentServicesScreen(apiClient: consumerApiClient, onSignOut: _signOut);
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
  const ResidentHomeShell({super.key, required this.controller, required this.consumerApiClient, required this.onSignOut, required this.canManageFamilyMembers, required this.propertyContexts, required this.currentSocietyId, required this.currentUnitId, required this.onSwitchProperty});
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
  void _openExternalServices() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => IndependentServicesScreen(apiClient: widget.consumerApiClient, independentMode: false)));
  void _openAmenities() {
    final unitId = widget.controller.primaryUnitId;
    if (unitId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a property before booking amenities.')));
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => AmenitiesScreen(repository: widget.controller.repository, unitId: unitId)));
  }

  ProfileScreen _profile(ResidentDataController controller) => ProfileScreen(
        controller: controller,
        onSignOut: widget.onSignOut,
        canManageFamilyMembers: widget.canManageFamilyMembers,
        propertyContexts: widget.propertyContexts,
        currentSocietyId: widget.currentSocietyId,
        currentUnitId: widget.currentUnitId,
        onSwitchProperty: widget.onSwitchProperty,
      );

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        if (!controller.entitlementsLoaded && controller.loading) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (!controller.hasActiveProperty) {
          return _SocietyOnlyShell(controller: controller, profile: _profile(controller), societyName: _currentSocietyName());
        }

        int? gateIndex;
        final pages = <Widget>[];
        final destinations = <NavigationDestination>[];
        void add(Widget page, NavigationDestination destination) {
          pages.add(page);
          destinations.add(destination);
        }

        final showGate = controller.hasFeature('VISITOR_MANAGEMENT') || controller.hasFeature('DELIVERY_MANAGEMENT') || controller.hasFeature('DOMESTIC_HELP') || controller.hasFeature('HOUSEHOLD_SERVICES');
        final showStaff = controller.hasFeature('DOMESTIC_HELP');
        final showServices = controller.hasFeature('HOUSEHOLD_SERVICES');
        final showNotices = controller.hasFeature('NOTICES');
        final showHelpdesk = controller.hasFeature('HELPDESK');
        final showBilling = controller.hasFeature('MAINTENANCE_BILLING');
        final showAmenities = controller.hasFeature('AMENITIES');
        final showSos = controller.hasFeature('SOS');

        add(
          HomeScreen(
            controller: controller,
            showGate: showGate,
            showServices: showServices,
            showHelpdesk: showHelpdesk,
            showNotices: showNotices,
            showBilling: showBilling,
            showAmenities: showAmenities,
            showSos: showSos,
            onOpenGate: () { if (gateIndex != null) _open(gateIndex!); },
            onOpenServices: _openExternalServices,
            onOpenHelpdesk: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => HelpdeskScreen(controller: controller))),
            onOpenNotices: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => NoticesScreen(controller: controller))),
            onOpenBilling: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BillingScreen(repository: controller.repository, activeUnitId: controller.primaryUnitId))),
            onOpenAmenities: _openAmenities,
          ),
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
        );
        if (showGate) {
          gateIndex = pages.length;
          add(GateScreen(controller: controller), const NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield_rounded), label: 'Gate'));
        }
        if (showStaff) {
          add(WorkforceScreen(controller: controller), const NavigationDestination(icon: Icon(Icons.badge_outlined), selectedIcon: Icon(Icons.badge_rounded), label: 'Staff'));
        }
        if (showServices) {
          add(ServicesScreen(controller: controller), const NavigationDestination(icon: Icon(Icons.handyman_outlined), selectedIcon: Icon(Icons.handyman_rounded), label: 'Services'));
        }
        add(_profile(controller), const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person_rounded), label: 'Profile'));

        final selectedIndex = _index < pages.length ? _index : 0;
        final pending = controller.firstPendingAccess;
        final eventRequestId = controller.latestAccessEvent?['requestId']?.toString();
        final showRealtimeApproval = showGate && pending != null && eventRequestId == pending['id']?.toString();
        return Scaffold(
          body: Stack(children: [
            IndexedStack(index: selectedIndex, children: pages),
            if (showRealtimeApproval)
              SafeArea(child: Padding(padding: const EdgeInsets.all(12), child: Material(elevation: 8, borderRadius: BorderRadius.circular(20), child: Padding(padding: const EdgeInsets.all(16), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [const Icon(Icons.notifications_active_rounded), const SizedBox(width: 10), Expanded(child: Text('${pending['subjectName'] ?? 'Someone'} is at the gate', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)))]),
                const SizedBox(height: 6),
                Text('${pending['subjectType']?.toString().replaceAll('_', ' ') ?? 'VISITOR'} · Approval required'),
                const SizedBox(height: 14),
                Row(children: [Expanded(child: OutlinedButton(onPressed: () => controller.denyAccess(pending['id'].toString()), child: const Text('Deny'))), const SizedBox(width: 10), Expanded(child: FilledButton(onPressed: () => controller.approveAccess(pending['id'].toString()), child: const Text('Allow')))]),
              ]))))),
          ]),
          bottomNavigationBar: NavigationBar(selectedIndex: selectedIndex, onDestinationSelected: _open, destinations: destinations),
        );
      },
    );
  }

  String _currentSocietyName() {
    for (final membership in widget.propertyContexts) {
      if (membership.societyId == widget.currentSocietyId) return membership.name;
    }
    return 'Current society';
  }
}

class _SocietyOnlyShell extends StatefulWidget {
  const _SocietyOnlyShell({required this.controller, required this.profile, required this.societyName});
  final ResidentDataController controller;
  final ProfileScreen profile;
  final String societyName;
  @override
  State<_SocietyOnlyShell> createState() => _SocietyOnlyShellState();
}

class _SocietyOnlyShellState extends State<_SocietyOnlyShell> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final canReadNotices = controller.hasFeature('NOTICES');
    return Scaffold(
      body: IndexedStack(index: index, children: [
        SafeArea(
          child: RefreshIndicator(
            onRefresh: controller.load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
              children: [
                Text(widget.societyName, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                const Text('Society access'),
                const SizedBox(height: 20),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.apartment_rounded, size: 36),
                      const SizedBox(height: 12),
                      const Text('No residential property is linked', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      const Text('Unit-specific features such as Gate, Staff, Billing, Amenities and household actions stay hidden until a property is linked and selected.'),
                      if (controller.entitlementsError != null) ...[
                        const SizedBox(height: 12),
                        Text(controller.entitlementsError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ],
                    ]),
                  ),
                ),
                if (canReadNotices) ...[
                  const SizedBox(height: 18),
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.campaign_outlined),
                      title: const Text('Society notices', style: TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text(controller.notices.isEmpty ? 'No active notices.' : '${controller.notices.length} active notice${controller.notices.length == 1 ? '' : 's'}'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => NoticesScreen(controller: controller))),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        widget.profile,
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.apartment_outlined), selectedIcon: Icon(Icons.apartment_rounded), label: 'Society'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person_rounded), label: 'Profile'),
        ],
      ),
    );
  }
}
