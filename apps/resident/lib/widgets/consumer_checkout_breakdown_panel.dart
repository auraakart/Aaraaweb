import 'service_commercial_terms.dart';
import 'package:flutter/material.dart';
import '../data/api_client.dart';

/// Services 4.3.2: intentionally nonpayable, owner-scoped source-of-truth view.
/// A quote consent is not a charge, invoice, tax calculation or payment promise.
class ConsumerCheckoutBreakdownPanel extends StatefulWidget {
  const ConsumerCheckoutBreakdownPanel({
    super.key,
    required this.apiClient,
    required this.bookingId,
  });

  final ApiClient apiClient;
  final String bookingId;

  @override
  State<ConsumerCheckoutBreakdownPanel> createState() => _ConsumerCheckoutBreakdownPanelState();
}

class _ConsumerCheckoutBreakdownPanelState extends State<ConsumerCheckoutBreakdownPanel> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _data;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ConsumerCheckoutBreakdownPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiClient != widget.apiClient || oldWidget.bookingId != widget.bookingId) {
      _load();
    }
  }

  @override
  void dispose() {
    _generation++;
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _data = null;
    });
    try {
      final response = await widget.apiClient.get(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/checkout-breakdown',
      );
      if (!mounted || _generation != generation) return;
      if (response is! Map<String, dynamic> ||
          response['readOnly'] != true ||
          response['checkoutReady'] != false ||
          response['amountPayablePaise'] != null ||
          response['taxBreakdown'] != null ||
          response['currency'] != 'INR' ||
          !_hasSafeReadiness(response['readiness']) ||
          response['baseService'] is! Map<String, dynamic>) {
        throw const FormatException('Unexpected checkout preview');
      }
      final base = response['baseService'] as Map<String, dynamic>;
      if (_formatPaise(base['amountPaise']) == null) {
        throw const FormatException('Invalid booking amount');
      }
      setState(() => _data = response);
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() => _error = 'Price breakdown is unavailable. Please refresh.');
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  static const _allowedReadinessCodes = <String>{
    'SELLER_OF_RECORD_UNVERIFIED',
    'GST_TREATMENT_UNDETERMINED',
    'PARTS_LINE_ITEMS_UNAVAILABLE',
    'EXTRA_WORK_NOT_BILLABLE',
    'SETTLEMENT_REFUND_RULES_UNVERIFIED',
  };

  static bool _hasSafeReadiness(Object? raw) {
    if (raw is! Map<String, dynamic> ||
        raw['evaluationScope'] != 'THIS_BOOKING_PREVIEW_ONLY' ||
        raw['status'] != 'NOT_READY' ||
        raw['chargeAuthorized'] != false ||
        raw['blockers'] is! List<dynamic>) return false;
    final blockers = raw['blockers'] as List<dynamic>;
    if (blockers.length != _allowedReadinessCodes.length) return false;
    final codes = <String>{};
    for (final blocker in blockers) {
      if (blocker is! Map<String, dynamic>) return false;
      final code = blocker['code'];
      final label = blocker['label'];
      if (code is! String || !_allowedReadinessCodes.contains(code) ||
          !codes.add(code) || label is! String ||
          label.trim().isEmpty || label.length > 180) return false;
    }
    return codes.length == _allowedReadinessCodes.length;
  }

  static String? _formatPaise(Object? raw) {
    final value = BigInt.tryParse(raw?.toString() ?? '');
    if (value == null || value.isNegative) return null;
    final rupees = value ~/ BigInt.from(100);
    final paise = (value % BigInt.from(100)).toString().padLeft(2, '0');
    return '₹$rupees.$paise';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        Text('Price and quote breakdown',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        const Text('For your reference only. This is not an invoice, payment request or final checkout total.'),
        const SizedBox(height: 12),
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
              label: const Text('Retry price breakdown'),
            ),
          ),
        ] else if (_data != null) ...[
          // Keep refresh as its own early ListView child. A long blocker list
          // must not push it outside Flutter's lazy-build viewport.
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh breakdown'),
            ),
          ),
          const SizedBox(height: 12),
          _content(_data!, theme),
        ],
      ],
    );
  }

  Widget _content(Map<String, dynamic> info, ThemeData theme) {
    final base = info['baseService'] as Map<String, dynamic>;
    final quotes = (info['extraWorkQuotes'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>().toList();
    final payments = (info['baseBookingPayments'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>().toList();
    final baseAmount = _formatPaise(base['amountPaise'])!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Card(
          child: ListTile(
            leading: const Icon(Icons.home_repair_service_outlined),
            title: Text(base['description']?.toString() ?? 'Booked service'),
            subtitle: const Text('Original saved booking price'),
            trailing: Text(baseAmount, style: theme.textTheme.titleMedium),
          ),
        ),
        const SizedBox(height: 12),
        ServiceCommercialTerms(terms: ((info['commercialTerms'] as Map?)?['snapshot'] as Map?)?['terms'], recorded: true),
        Text('Extra-work quotes (separate)', style: theme.textTheme.titleMedium),
        const Text('Even an approved quote is not included in the original booking payment.'),
        if (quotes.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Text('No extra-work quotes recorded.'),
          )
        else
          ...quotes.map((q) {
            final amount = _formatPaise(q['quotedAmountPaise']);
            return ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(q['description']?.toString() ?? 'Extra work'),
              subtitle: Text('Quote status: ${q['status'] ?? 'UNKNOWN'} · Not part of base payment'),
              trailing: Text(amount ?? 'Unavailable'),
            );
          }),
        const SizedBox(height: 12),
        Text('Original booking payment status', style: theme.textTheme.titleMedium),
        if (payments.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Text('No original booking payment recorded.'),
          )
        else
          ...payments.map((p) => ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('Payment status: ${p['status'] ?? 'UNKNOWN'}'),
            trailing: Text(_formatPaise(p['grossAmountPaise']) ?? 'Unavailable'),
          )),
        const SizedBox(height: 14),
        Text('Why consolidated checkout is not available', style: theme.textTheme.titleMedium),
        const Text('These are missing verification requirements for this booking preview, not an invoice or final tax assessment.'),
        ...((info['readiness'] as Map<String, dynamic>)['blockers'] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .map((blocker) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline, size: 18),
                  const SizedBox(width: 8),
                  Expanded(child: Text(blocker['label'] as String)),
                ],
              ),
            )),
        const SizedBox(height: 8),
        const Text('GST and any final consolidated total have not been determined. '
            'No new payment, invoice or refund can be made from this view.'),
      ],
    );
  }
}
