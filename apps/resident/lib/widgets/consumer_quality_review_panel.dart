import 'package:flutter/material.dart';

import '../data/api_client.dart';

/// Booking-time guidance and recorded evidence, never a new guarantee or charge.
class ConsumerQualityReviewPanel extends StatefulWidget {
  const ConsumerQualityReviewPanel({
    super.key,
    required this.apiClient,
    required this.bookingId,
    required this.completed,
  });
  final ApiClient apiClient;
  final String bookingId;
  final bool completed;
  @override
  State<ConsumerQualityReviewPanel> createState() =>
      _ConsumerQualityReviewPanelState();
}

class _ConsumerQualityReviewPanelState
    extends State<ConsumerQualityReviewPanel> {
  int _generation = 0;
  bool _loading = true,
      _sending = false,
      _refreshRequired = false,
      _openCase = false;
  String? _error, _message;
  Map<String, dynamic>? _snapshot, _terms;
  List<Map<String, dynamic>> _events = [];
  final _detail = TextEditingController();
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ConsumerQualityReviewPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiClient != widget.apiClient ||
        oldWidget.bookingId != widget.bookingId ||
        oldWidget.completed != widget.completed) {
      _detail.clear();
      _message = null;
      _sending = false;
      _load();
    }
  }

  @override
  void dispose() {
    _generation++;
    _detail.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation, id = widget.bookingId;
    setState(() {
      _loading = true;
      _snapshot = null;
      _terms = null;
      _events = [];
      _error = null;
      _openCase = false;
    });
    try {
      final results = await Future.wait<dynamic>([
        widget.apiClient.get(
          '/api/v1/consumer/services/bookings/$id/quality-checklist',
        ),
        widget.apiClient.get(
          '/api/v1/consumer/services/bookings/$id/quality-evidence',
        ),
        if (widget.completed)
          widget.apiClient.get(
            '/api/v1/consumer/services/bookings/$id/rework-terms',
          ),
        if (widget.completed)
          widget.apiClient.get(
            '/api/v1/consumer/services/bookings/$id/disputes',
          ),
      ]);
      final snapshot = results[0];
      if (snapshot is! Map<String, dynamic> ||
          snapshot['bookingId'] != id ||
          snapshot['captured'] is! bool ||
          snapshot['immutable'] != snapshot['captured'] ||
          snapshot['templateVersion'] is! int ||
          (snapshot['templateVersion'] as int) <
              (snapshot['captured'] == true ? 1 : 0) ||
          snapshot['items'] is! List) {
        throw const FormatException('Invalid checklist');
      }
      final items = snapshot['items'] as List;
      final keys = <String>{};
      for (final item in items) {
        if (item is! Map<String, dynamic> ||
            item['id'] is! String ||
            item['label'] is! String ||
            item['required'] is! bool ||
            !keys.add(item['id'] as String))
          throw const FormatException('Invalid step');
      }
      if (items.length > 20 ||
          snapshot['captured'] == false && items.isNotEmpty)
        throw const FormatException('Invalid snapshot');
      if (results[1] is! List) throw const FormatException('Invalid evidence');
      final events = <Map<String, dynamic>>[];
      for (final event in results[1] as List) {
        if (event is! Map<String, dynamic> ||
            event['bookingId'] != id ||
            event['passed'] is! bool ||
            event['assignmentId'] is! String ||
            !keys.contains(event['itemId']) ||
            event['note'] != null && event['note'] is! String)
          throw const FormatException('Invalid assessment');
        events.add(event);
      }
      Map<String, dynamic>? terms;
      var openCase = false;
      if (widget.completed) {
        final raw = results[2];
        if (raw is! Map<String, dynamic> ||
            raw['bookingId'] != id ||
            raw['reviewRequired'] != true ||
            raw['guaranteedRework'] != false ||
            raw['chargeAuthorized'] != false ||
            raw['refundAuthorized'] != false ||
            ![
              'NO_CAPTURED_TERMS',
              'PERIOD_EXPIRED',
              'WITHIN_CAPTURED_PERIOD',
              'TERMS_WITHOUT_EXPIRY',
            ].contains(raw['status']) ||
            results[3] is! List) {
          throw const FormatException('Invalid review terms');
        }
        terms = raw;
        for (final dispute in results[3] as List) {
          if (dispute is! Map<String, dynamic> ||
              dispute['bookingId'] != id ||
              dispute['status'] is! String)
            throw const FormatException('Invalid review history');
          if (['OPEN', 'UNDER_REVIEW'].contains(dispute['status']))
            openCase = true;
        }
      }
      if (!mounted || generation != _generation) return;
      setState(() {
        _snapshot = snapshot;
        _events = events;
        _terms = terms;
        _openCase = openCase;
        _refreshRequired = false;
      });
    } catch (_) {
      if (mounted && generation == _generation)
        setState(
          () => _error =
              'Service quality details are unavailable. Refresh to try again.',
        );
    } finally {
      if (mounted && generation == _generation)
        setState(() => _loading = false);
    }
  }

  Future<void> _requestReview() async {
    final detail = _detail.text.trim();
    if (_sending ||
        _refreshRequired ||
        _openCase ||
        _terms == null ||
        detail.length < 10 ||
        detail.length > 2000)
      return;
    final generation = _generation;
    setState(() {
      _sending = true;
      _error = null;
      _message = null;
    });
    try {
      final raw = await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/request-rework',
        {'detail': detail},
      );
      if (!mounted || generation != _generation) return;
      if (raw is! Map<String, dynamic> ||
          raw['bookingId'] != widget.bookingId ||
          raw['reworkReview'] is! Map ||
          raw['reworkReview']['reviewRequired'] != true ||
          raw['reworkReview']['guaranteedRework'] != false ||
          raw['reworkReview']['chargeAuthorized'] != false ||
          raw['reworkReview']['refundAuthorized'] != false)
        throw const FormatException('Invalid review response');
      setState(() {
        _openCase = true;
        _message = 'Your rework request was submitted for review. A revisit or refund is not yet approved.';
        _detail.clear();
      });
    } catch (_) {
      if (mounted && generation == _generation)
        setState(() {
          _refreshRequired = true;
          _error = 'The request could not be confirmed. Refresh the review status before submitting again; it may already have been received.';
        });
    } finally {
      if (mounted && generation == _generation)
        setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Service quality and rework',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const Text(
          'Checklist evidence records technician assessments. It does not certify quality, extend warranty or approve a charge.',
        ),
        if (_loading) const Center(child: CircularProgressIndicator()),
        if (_error != null) Text(_error!, key: const Key('quality-error')),
        if (_message != null) Text(_message!),
        if (_snapshot != null) ...[
          if (_snapshot!['captured'] == false)
            const Text(
              'No checklist was captured when this booking was created.',
            )
          else if ((_snapshot!['items'] as List).isEmpty)
            const Text('No checklist steps were required for this booking.')
          else
            ...(_snapshot!['items'] as List).map(
              (item) => ListTile(
                title: Text(item['label'] as String),
                subtitle: Text(
                  item['required'] == true
                      ? 'Required booking-time step'
                      : 'Optional booking-time step',
                ),
              ),
            ),
          const Text('Technician assessment history'),
          if (_events.isEmpty)
            const Text('No technician assessments recorded.'),
          ..._events.map((event) {
            final step = (_snapshot!['items'] as List).firstWhere(
              (item) => item['id'] == event['itemId'],
            );
            return ListTile(
              title: Text(
                '${step['label']}: ${event['passed'] == true ? 'Passed' : 'Needs attention'}',
              ),
              subtitle: Text(event['note'] as String? ?? 'No note recorded'),
            );
          }),
        ],
        if (_terms != null) ...[
          const Divider(),
          const Text('Request a rework review'),
          Text(switch (_terms!['status']) {
            'NO_CAPTURED_TERMS' => 'No warranty or revisit terms were captured. A review does not establish coverage.',
            'PERIOD_EXPIRED' => 'The captured warranty period has expired. Coverage is not assumed.',
            'WITHIN_CAPTURED_PERIOD' => 'The captured warranty period has not expired. Eligibility still requires review.',
            _ => 'Captured terms have no expiry date. Coverage still requires review.',
          }),
          const Text(
            'A review request does not guarantee a free revisit, charge or refund. Existing dispute review applies.',
          ),
          if (_openCase)
            const Text(
              'An open review already exists. Continue through the booking’s existing dispute conversation.',
            )
          else ...[
            TextField(
              controller: _detail,
              enabled: !_sending && !_refreshRequired,
              maxLength: 2000,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: 'What needs to be reworked?',
              ),
              onChanged: (_) => setState(() {}),
            ),
            FilledButton(
              onPressed:
                  _sending ||
                      _refreshRequired ||
                      _detail.text.trim().length < 10
                  ? null
                  : _requestReview,
              child: const Text('Submit for rework review'),
            ),
          ],
        ],
        TextButton(
          onPressed: _loading || _sending ? null : _load,
          child: const Text('Refresh quality and review status'),
        ),
      ],
    );
  }
}
