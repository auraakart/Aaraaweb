import 'dart:async';

import 'package:flutter/material.dart';

import '../data/api_client.dart';

class ConsumerOperationalEtaPanel extends StatefulWidget {
  const ConsumerOperationalEtaPanel({
    super.key,
    required this.apiClient,
    required this.bookingId,
  });
  final ApiClient apiClient;
  final String bookingId;
  @override
  State<ConsumerOperationalEtaPanel> createState() =>
      _ConsumerOperationalEtaPanelState();
}

class _ConsumerOperationalEtaPanelState
    extends State<ConsumerOperationalEtaPanel> {
  int _generation = 0;
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _eta;
  Timer? _expiry;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ConsumerOperationalEtaPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiClient != widget.apiClient ||
        oldWidget.bookingId != widget.bookingId)
      _load();
  }

  @override
  void dispose() {
    _generation++;
    _expiry?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    _expiry?.cancel();
    setState(() {
      _loading = true;
      _error = null;
      _eta = null;
    });
    try {
      final raw = await widget.apiClient.get(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/operational-eta',
      );
      if (!mounted || generation != _generation) return;
      if (raw is! Map<String, dynamic> ||
          raw['bookingId'] != widget.bookingId ||
          raw['liveTracking'] != false ||
          raw['guaranteedArrival'] != false ||
          raw['reason'] is! String ||
          !['UNAVAILABLE', 'LOW'].contains(raw['confidence']))
        throw const FormatException('Invalid arrival estimate');
      final asOf = DateTime.tryParse(raw['asOf']?.toString() ?? '');
      final milestone = DateTime.tryParse(
        raw['lastMilestoneAt']?.toString() ?? '',
      );
      final minutes = raw['etaMinutes'];
      if (asOf == null ||
          asOf.isAfter(DateTime.now().add(const Duration(minutes: 1))))
        throw const FormatException('Invalid estimate time');
      if (minutes != null) {
        final arrival = DateTime.tryParse(
          raw['estimatedArrivalAt']?.toString() ?? '',
        );
        if (minutes is! int ||
            minutes < 5 ||
            minutes > 180 ||
            minutes % 5 != 0 ||
            raw['assignmentStatus'] != 'EN_ROUTE' ||
            raw['reason'] != 'HISTORICAL_ESTIMATE_ONLY' ||
            raw['confidence'] != 'LOW' ||
            raw['source'] != 'PROVIDER_HISTORICAL_EN_ROUTE_TO_ARRIVED' ||
            raw['sampleSize'] is! int ||
            (raw['sampleSize'] as int) < 5 ||
            raw['milestoneFresh'] != true ||
            milestone == null ||
            milestone.isAfter(asOf) ||
            arrival == null ||
            arrival.difference(asOf).inSeconds != minutes * 60)
          throw const FormatException('Unverified estimate');
        final deadline =
            milestone.add(const Duration(minutes: 15)).isBefore(arrival)
            ? milestone.add(const Duration(minutes: 15))
            : arrival;
        final remaining = deadline.difference(DateTime.now());
        if (remaining <= Duration.zero)
          throw const FormatException('Estimate expired');
        _expiry = Timer(remaining, () {
          if (mounted && generation == _generation)
            setState(() {
              _eta = null;
              _error = 'The arrival estimate is no longer fresh. Refresh for an update.';
            });
        });
      } else if (raw['confidence'] != 'UNAVAILABLE' ||
          raw['estimatedArrivalAt'] != null) {
        throw const FormatException('Contradictory estimate');
      }
      setState(() => _eta = raw);
    } catch (_) {
      if (mounted && generation == _generation)
        setState(
          () => _error = 'Arrival estimate unavailable. Refresh for an update.',
        );
    } finally {
      if (mounted && generation == _generation)
        setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eta = _eta;
    final message =
        _error ??
        (eta?['etaMinutes'] != null
            ? 'About ${eta!['etaMinutes']} minutes from the last update. Low-confidence historical estimate.'
            : switch (eta?['reason']) {
                'ARRIVAL_CONFIRMED' => 'The technician has recorded arrival.',
                'EN_ROUTE_MILESTONE_STALE' => 'The last en-route update is too old for an arrival estimate.',
                'INSUFFICIENT_PROVIDER_HISTORY' =>
                  'Not enough provider journey history to estimate arrival.',
                'HISTORICAL_WINDOW_ELAPSED' => 'The historical arrival window has elapsed. No fresh estimate is available.',
                'WAITING_FOR_EN_ROUTE_MILESTONE' =>
                  'Waiting for the technician’s en-route update.',
                _ => 'No active arrival estimate is available.',
              });
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Arrival update',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (_loading) const LinearProgressIndicator() else Text(message),
            const Text('No live GPS tracking. Arrival time is not guaranteed.'),
            TextButton(
              onPressed: _loading ? null : _load,
              child: const Text('Refresh arrival update'),
            ),
          ],
        ),
      ),
    );
  }
}
