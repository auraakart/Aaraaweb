import 'package:flutter/material.dart';

import '../data/api_client.dart';

/// Services 4.4.2: read-only UI for owner-scoped historical service activity.
/// No loyalty balance, protection claim, membership, or purchase is inferred.
class ConsumerBenefitsReadinessPanel extends StatefulWidget {
  const ConsumerBenefitsReadinessPanel({
    super.key,
    required this.apiClient,
  });

  final ApiClient apiClient;

  @override
  State<ConsumerBenefitsReadinessPanel> createState() => _ConsumerBenefitsReadinessPanelState();
}

class _ConsumerBenefitsReadinessPanelState extends State<ConsumerBenefitsReadinessPanel> {
  int _generation = 0;
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ConsumerBenefitsReadinessPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.apiClient, widget.apiClient)) _load();
  }

  @override
  void dispose() {
    _generation++;
    super.dispose();
  }

  static bool _safeContract(Object? value) {
    if (value is! Map<String, dynamic>) return false;
    final bookings = value['completedBookings'];
    final providers = value['completedProviders'];
    if (value['readOnly'] != true ||
        value['activitySource'] != 'AUTHENTICATED_COMPLETED_BOOKINGS' ||
        value['historicalActivityOnly'] != true ||
        bookings is! int || bookings < 0 ||
        providers is! int || providers < 0 || providers > bookings ||
        value['eligibilityDetermined'] != false ||
        value['bookingCreated'] != false ||
        value['chargeAuthorized'] != false) return false;

    final membership = value['membership'];
    final loyalty = value['loyalty'];
    final protection = value['optionalProtection'];
    if (membership is! Map<String, dynamic> ||
        membership['status'] != 'NOT_LAUNCHED' ||
        membership['enrollmentAvailable'] != false ||
        membership['activeEntitlement'] != null ||
        membership['pricePaise'] != null) return false;
    if (loyalty is! Map<String, dynamic> ||
        loyalty['status'] != 'NOT_LAUNCHED' ||
        loyalty['pointsBalance'] != null ||
        loyalty['redeemableAmountPaise'] != null ||
        loyalty['earnRate'] != null ||
        loyalty['redemptionEnabled'] != false) return false;
    if (protection is! Map<String, dynamic> ||
        protection['status'] != 'NOT_OFFERED' ||
        protection['coverageConfirmed'] != false ||
        protection['claimAvailable'] != false ||
        protection['terms'] != null) return false;
    return true;
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _data = null;
    });
    try {
      // Called only when a resident opens this sheet or taps refresh.
      final raw = await widget.apiClient.get('/api/v1/consumer/services/benefits-readiness');
      if (!mounted || generation != _generation) return;
      if (!_safeContract(raw)) throw const FormatException('Unsupported benefits response');
      setState(() => _data = raw as Map<String, dynamic>);
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() => _error = 'Service benefits information is unavailable. Please retry.');
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Text('Service benefits', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        const Text('Your service activity is shown for reference. Memberships, rewards and protection are not available yet.'),
        const SizedBox(height: 16),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_error != null) ...[
          Text(_error!),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry benefits information'),
            ),
          ),
        ] else if (_data != null) ...[
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh service activity'),
            ),
          ),
          const SizedBox(height: 8),
          Semantics(
            label: 'Completed services: ${_data!['completedBookings']}. Service providers used: ${_data!['completedProviders']}',
            child: Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.check_circle_outline),
                    title: Text('Completed services: ${_data!['completedBookings']}'),
                    subtitle: const Text('Historical bookings on your account'),
                  ),
                  ListTile(
                    leading: const Icon(Icons.handyman_outlined),
                    title: Text('Service providers used: ${_data!['completedProviders']}'),
                    subtitle: const Text('Distinct providers for completed services'),
                  ),
                ],
              ),
            ),
          ),
          if (_data!['completedBookings'] == 0)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('No completed services recorded yet.'),
            ),
          const SizedBox(height: 12),
          const ListTile(
            leading: Icon(Icons.card_membership_outlined),
            title: Text('Membership: Not launched'),
            subtitle: Text('No membership enrollment, pricing or active benefits are available.'),
          ),
          const ListTile(
            leading: Icon(Icons.stars_outlined),
            title: Text('Loyalty rewards: Not launched'),
            subtitle: Text('No points balance, redemption or cash value has been earned or determined.'),
          ),
          const ListTile(
            leading: Icon(Icons.verified_user_outlined),
            title: Text('Optional protection: Not offered'),
            subtitle: Text('No coverage, protection terms or claims are available.'),
          ),
          const SizedBox(height: 8),
          const Text(
            'Completed services do not automatically qualify you for membership, loyalty points, discounts, insurance or protection.',
          ),
        ],
      ],
    );
  }
}
