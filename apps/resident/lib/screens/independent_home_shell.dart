import 'package:flutter/material.dart';
import '../data/api_client.dart';
import 'consumer_booking_screen.dart';
import 'consumer_bookings_screen.dart';
import 'consumer_offers_screen.dart';
import 'independent_services_screen.dart';
import 'service_history_screen.dart';

class IndependentHomeShell extends StatefulWidget {
  const IndependentHomeShell({super.key, required this.apiClient, required this.onSignOut});

  final ApiClient apiClient;
  final Future<void> Function() onSignOut;

  @override
  State<IndependentHomeShell> createState() => _IndependentHomeShellState();
}

class _IndependentHomeShellState extends State<IndependentHomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      IndependentServicesScreen(apiClient: widget.apiClient, independentMode: true),
      ConsumerOffersScreen(apiClient: widget.apiClient),
      ConsumerBookingsScreen(apiClient: widget.apiClient),
      _IndependentHistoryTab(apiClient: widget.apiClient),
      _IndependentProfileTab(onSignOut: widget.onSignOut),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.handyman_outlined), selectedIcon: Icon(Icons.handyman_rounded), label: 'Services'),
          NavigationDestination(icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer_rounded), label: 'Offers'),
          NavigationDestination(icon: Icon(Icons.event_note_outlined), selectedIcon: Icon(Icons.event_note_rounded), label: 'Bookings'),
          NavigationDestination(icon: Icon(Icons.history_outlined), selectedIcon: Icon(Icons.history_rounded), label: 'History'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person_rounded), label: 'Profile'),
        ],
      ),
    );
  }
}

class _IndependentHistoryTab extends StatefulWidget {
  const _IndependentHistoryTab({required this.apiClient});

  final ApiClient apiClient;

  @override
  State<_IndependentHistoryTab> createState() => _IndependentHistoryTabState();
}

class _IndependentHistoryTabState extends State<_IndependentHistoryTab> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _location;
  Map<String, Map<String, dynamic>> _offeringsById = const {};

  @override
  void initState() {
    super.initState();
    _loadContext();
  }

  Future<void> _loadContext() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rawLocations = await widget.apiClient.get('/api/v1/consumer/services/locations');
      final locations = (rawLocations as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      Map<String, dynamic>? selected;
      for (final location in locations) {
        if (location['type'] == 'HOME' && location['serviceAddressConfigured'] != false) {
          selected = location;
          break;
        }
      }
      if (selected == null) {
        for (final location in locations) {
          if (location['serviceAddressConfigured'] != false) {
            selected = location;
            break;
          }
        }
      }

      Map<String, Map<String, dynamic>> offeringsById = const {};
      if (selected != null) {
        final params = Uri(queryParameters: {
          'locationType': selected['type'].toString(),
          'locationId': selected['id'].toString(),
        }).query;
        final rawOfferings = await widget.apiClient.get('/api/v1/consumer/services/offerings?$params');
        offeringsById = <String, Map<String, dynamic>>{
          for (final offering in (rawOfferings as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>())
            if (offering['id'] != null) offering['id'].toString(): offering,
        };
      }

      if (!mounted) return;
      setState(() {
        _location = selected;
        _offeringsById = offeringsById;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _rebook(Map<String, dynamic> offering) async {
    final location = _location;
    if (location == null || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ConsumerBookingScreen(apiClient: widget.apiClient, offering: offering, initialLocation: location),
    ));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(appBar: AppBar(title: Text('Service History')), body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Service History')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.cloud_off_rounded),
              const SizedBox(height: 10),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _loadContext, child: const Text('Retry')),
            ]),
          ),
        ),
      );
    }
    final location = _location;
    if (location == null) {
      return const Scaffold(
        appBar: AppBar(title: Text('Service History')),
        body: Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Add or configure a home service address to view history.'))),
      );
    }
    return ServiceHistoryScreen(
      apiClient: widget.apiClient,
      location: location,
      offeringsById: _offeringsById,
      onRebook: _rebook,
    );
  }
}

class _IndependentProfileTab extends StatelessWidget {
  const _IndependentProfileTab({required this.onSignOut});

  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          CircleAvatar(
            radius: 34,
            backgroundColor: theme.colorScheme.primaryContainer,
            foregroundColor: theme.colorScheme.onPrimaryContainer,
            child: const Icon(Icons.home_rounded, size: 34),
          ),
          const SizedBox(height: 16),
          Text('Independent home', textAlign: TextAlign.center, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text(
            'Your account is focused on trusted home services. Society-only features such as gate, maintenance billing, amenities and notices are not shown in this mode.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          Card(
            child: ListTile(
              leading: const Icon(Icons.privacy_tip_outlined),
              title: const Text('Independent-home privacy boundary', style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: const Text('Service requests use only homes and service locations authorized to this account.'),
            ),
          ),
          const SizedBox(height: 18),
          FilledButton.tonalIcon(onPressed: onSignOut, icon: const Icon(Icons.logout_rounded), label: const Text('Sign out')),
        ],
      ),
    );
  }
}
