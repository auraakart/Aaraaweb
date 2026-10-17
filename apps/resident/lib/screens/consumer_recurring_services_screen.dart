import 'package:flutter/material.dart';

import '../data/api_client.dart';
import 'consumer_booking_screen.dart';

class ConsumerRecurringServicesScreen extends StatelessWidget {
  const ConsumerRecurringServicesScreen({super.key, required this.apiClient});
  final ApiClient apiClient;
  @override
  Widget build(BuildContext context) => _RecurringPreferences(
    key: ObjectKey(apiClient), apiClient: apiClient,
  );
}

// A replacement authenticated client owns a fresh state and fresh routes.
class _RecurringPreferences extends StatefulWidget {
  const _RecurringPreferences({super.key, required this.apiClient});
  final ApiClient apiClient;
  @override
  State<_RecurringPreferences> createState() => _ConsumerRecurringServicesScreenState();
}

class _ConsumerRecurringServicesScreenState
    extends State<_RecurringPreferences> {
  List<Map<String, dynamic>> _plans = [];
  String? _error;
  bool _loading = true, _busy = false;
  bool _refreshRequired = false;
  final Set<Route<dynamic>> _ownedRoutes = {};
  int _generation = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _generation++;
    for (final route in _ownedRoutes.toList()) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final navigator = route.navigator;
        if (navigator != null && route.isActive) navigator.removeRoute(route);
      });
    }
    _ownedRoutes.clear();
    super.dispose();
  }

  Future<T?> _pushOwned<T>(Route<T> route, {bool rootNavigator = false}) {
    _ownedRoutes.add(route);
    return Navigator.of(context, rootNavigator: rootNavigator).push(route)
        .whenComplete(() => _ownedRoutes.remove(route));
  }

  Future<void> _load({bool allowBusy = false}) async {
    if (!mounted || _busy && !allowBusy) return;
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _plans = [];
      _error = null;
    });
    try {
      final raw = await widget.apiClient.get(
        '/api/v1/consumer/services/recurring-plans',
      );
      if (raw is! List ||
          raw.any(
            (p) =>
                p is! Map<String, dynamic> ||
                p['id'] is! String ||
                p['offeringId'] is! String ||
                p['locationId'] is! String ||
                !['HOME', 'SOCIETY_UNIT'].contains(p['locationType']) ||
                !['ACTIVE', 'PAUSED', 'CANCELLED'].contains(p['status']),
          ))
        throw const FormatException('Invalid recurring plans');
      if (mounted && generation == _generation)
        setState(() {
          _plans = raw.cast<Map<String, dynamic>>();
          _refreshRequired = false;
        });
    } catch (_) {
      if (mounted && generation == _generation)
        setState(
          () => _error = 'Recurring preferences are unavailable. Try again.',
        );
    } finally {
      if (mounted && generation == _generation)
        setState(() => _loading = false);
    }
  }

  Future<void> _book(Map<String, dynamic> plan) async {
    if (!mounted || _loading || _busy || _refreshRequired || plan['status'] != 'ACTIVE') return;
    final api = widget.apiClient;
    final generation = _generation;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final query = Uri(
        queryParameters: {
          'locationType': plan['locationType'] as String,
          'locationId': plan['locationId'] as String,
        },
      ).query;
      final raw = await api.get(
        '/api/v1/consumer/services/offerings?$query',
      );
      if (raw is! List) throw const FormatException('Invalid offering list');
      final offering = raw
          .whereType<Map<String, dynamic>>()
          .where((o) => o['id'] == plan['offeringId'])
          .firstOrNull;
      if (offering == null ||
          offering['pricePaise'] is! int ||
          (offering['pricePaise'] as int) < 0)
        throw const FormatException('Offering no longer available');
      if (!mounted || generation != _generation) return;
      await _pushOwned<void>(
        MaterialPageRoute<void>(
          builder: (_) => ConsumerBookingScreen(
            apiClient: api,
            offering: offering,
            recurringPlanId: plan['id'] as String,
            initialLocation: {
              'type': plan['locationType'],
              'id': plan['locationId'],
            },
          ),
        ),
      );
      if (mounted && generation == _generation) await _load(allowBusy: true);
    } catch (_) {
      if (mounted && generation == _generation)
        setState(
          () => _error = 'This service is not currently available for the saved location. Refresh before trying again.',
        );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _status(Map<String, dynamic> plan, String status) async {
    if (!mounted || _loading || _busy || _refreshRequired || plan['status'] == 'CANCELLED') return;
    final generation = _generation, api = widget.apiClient;
    setState(() { _busy = true; _error = null; });
    try {
      final navigator = Navigator.of(context, rootNavigator: true);
      final confirm = await _pushOwned<bool>(DialogRoute<bool>(
        context: context,
        themes: InheritedTheme.capture(from: context, to: navigator.context),
        builder: (context) => AlertDialog(
          title: Text(
            '${status == 'ACTIVE'
                ? 'Resume'
                : status == 'PAUSED'
                ? 'Pause'
                : 'Cancel'} this recurring preference?',
          ),
          content: const Text(
            'This changes only the saved preference. Existing bookings stay unchanged; no visit or charge is created.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep preference'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm preference change'),
            ),
          ],
        ),
      ), rootNavigator: true);
      if (confirm != true || !mounted || generation != _generation) return;
      await api.patch(
        '/api/v1/consumer/services/recurring-plans/${plan['id']}/status',
        {'status': status},
      );
      if (mounted && generation == _generation) await _load(allowBusy: true);
    } catch (_) {
      if (mounted && generation == _generation)
        setState(
          () {
            _refreshRequired = true;
            _error = 'Preference update could not be confirmed. Refresh to check its latest state before changing it or planning a visit.';
          },
        );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _visits(Map<String, dynamic> plan) async {
    if (!mounted || _loading || _busy) return;
    final api = widget.apiClient;
    final navigator = Navigator.of(context);
    await _pushOwned<void>(ModalBottomSheetRoute<void>(
      capturedThemes: InheritedTheme.capture(from: context, to: navigator.context),
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.75,
          child: _RecurringVisitHistory(
            apiClient: api,
            planId: plan['id'] as String,
          ),
        ),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Recurring service preferences')),
    body: RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Plan your next visit'),
          const Text(
            'Saved preferences never automatically reserve a visit or charge you. Request each visit explicitly using current price and availability.',
          ),
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (_error != null) Text(_error!),
          if (!_loading && _plans.isEmpty && _error == null)
            const Text(
              'No recurring preferences yet. Open a service request and use its recurring preference option when offered by the provider.',
            ),
          ..._plans.map(
            (plan) => Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan['offeringName']?.toString() ?? 'Saved service',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      '${plan['locationLabel'] ?? 'Saved location'} · ${plan['cadence'] ?? 'Recurring preference'} · ${plan['status']}',
                    ),
                    if (plan['preferredTime'] != null)
                      Text(
                        'Preferred time: ${plan['preferredTime']} — not a reservation',
                      ),
                    Wrap(
                      spacing: 8,
                      children: [
                        if (plan['status'] == 'ACTIVE')
                          FilledButton(
                            onPressed: _busy || _loading || _refreshRequired ? null : () => _book(plan),
                            child: const Text('Plan one visit'),
                          ),
                        TextButton(
                          onPressed: _busy ? null : () => _visits(plan),
                          child: const Text('Matching visits and technicians'),
                        ),
                        if (plan['status'] != 'CANCELLED') ...[
                          TextButton(
                            onPressed: _busy || _loading || _refreshRequired
                                ? null
                                : () => _status(
                                    plan,
                                    plan['status'] == 'ACTIVE'
                                        ? 'PAUSED'
                                        : 'ACTIVE',
                                  ),
                            child: Text(
                              plan['status'] == 'ACTIVE'
                                  ? 'Pause preference'
                                  : 'Resume preference',
                            ),
                          ),
                          TextButton(
                            onPressed: _busy || _loading || _refreshRequired
                                ? null
                                : () => _status(plan, 'CANCELLED'),
                            child: const Text('Cancel preference'),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          TextButton(
            onPressed: _loading || _busy ? null : _load,
            child: const Text('Refresh recurring preferences'),
          ),
        ],
      ),
    ),
  );
}

class _RecurringVisitHistory extends StatefulWidget {
  const _RecurringVisitHistory({required this.apiClient, required this.planId});
  final ApiClient apiClient;
  final String planId;
  @override
  State<_RecurringVisitHistory> createState() => _RecurringVisitHistoryState();
}

class _RecurringVisitHistoryState extends State<_RecurringVisitHistory> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _visits = [], _technicians = [];
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _visits = [];
      _technicians = [];
    });
    try {
      final raw = await Future.wait<dynamic>([
        widget.apiClient.get(
          '/api/v1/consumer/services/recurring-plans/${widget.planId}/visits',
        ),
        widget.apiClient.get(
          '/api/v1/consumer/services/recurring-plans/${widget.planId}/technician-continuity',
        ),
      ]);
      final history = raw[0], continuity = raw[1];
      if (history is! Map<String, dynamic> ||
          history['planId'] != widget.planId ||
          history['planOriginVerified'] != false ||
          history['automaticallyScheduled'] != false ||
          history['visits'] is! List ||
          continuity is! Map<String, dynamic> ||
          continuity['planId'] != widget.planId ||
          continuity['historicalEvidenceOnly'] != true ||
          continuity['technicianAvailabilityConfirmed'] != false ||
          continuity['technicianAssignmentGuaranteed'] != false ||
          continuity['bookingCreated'] != false ||
          continuity['automaticDispatch'] != false ||
          continuity['candidates'] is! List)
        throw const FormatException('Invalid visit history');
      final visits = (history['visits'] as List).cast<Map<String, dynamic>>();
      if (visits.length > 25 ||
          visits.any(
            (v) =>
                DateTime.tryParse(v['scheduledFrom']?.toString() ?? '') == null,
          ))
        throw const FormatException('Invalid scheduled visit');
      if (mounted)
        setState(() {
          _visits = visits;
          _technicians = (continuity['candidates'] as List)
              .cast<Map<String, dynamic>>();
        });
    } catch (_) {
      if (mounted)
        setState(
          () => _error = 'Matching visits or technician history are unavailable. Current location access is required.',
        );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      Text(
        'Matching visits and technicians',
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const Text(
        'Up to 25 bookings for your same service and location. Matching does not prove a booking originated from this preference. No automatic schedule is created.',
      ),
      if (_loading) const Center(child: CircularProgressIndicator()),
      if (_error != null) Text(_error!),
      if (!_loading && _error == null && _visits.isEmpty)
        const Text('No matching visits recorded.'),
      ..._visits.map(
        (visit) => ListTile(
          title: Text('${visit['status']}'),
          subtitle: Text(
            DateTime.parse(visit['scheduledFrom'].toString())
                .toLocal()
                .toString(),
          ),
        ),
      ),
      if (_error == null) ...[
        const Text('Previously arrived technicians'),
        const Text(
          'Historical service evidence only. A previous technician is not reserved or confirmed available.',
        ),
        if (!_loading && _technicians.isEmpty)
          const Text(
            'No eligible technician history for this service and location.',
          ),
        ..._technicians.map(
          (agent) => ListTile(
            title: Text(
              agent['displayName']?.toString() ?? 'Previous technician',
            ),
          ),
        ),
      ],
      TextButton(
        onPressed: _loading ? null : _load,
        child: const Text('Refresh matching visits'),
      ),
    ],
  );
}
