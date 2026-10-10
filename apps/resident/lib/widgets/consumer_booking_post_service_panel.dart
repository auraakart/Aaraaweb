import 'package:flutter/material.dart';
import '../data/api_client.dart';

class ConsumerBookingPostServicePanel extends StatefulWidget {
  const ConsumerBookingPostServicePanel({
    super.key,
    required this.apiClient,
    required this.bookingId,
  });

  final ApiClient apiClient;
  final String bookingId;

  @override
  State<ConsumerBookingPostServicePanel> createState() => _ConsumerBookingPostServicePanelState();
}

class _ConsumerBookingPostServicePanelState extends State<ConsumerBookingPostServicePanel> {
  bool _loading = true;
  bool _confirming = false;
  bool _submittingRating = false;
  bool _respondingProposal = false;
  bool _respondingQuote = false;
  bool _requestingExtraWorkBill = false;
  bool _openingDispute = false;
  bool _addingDisputeEvidence = false;
  final Map<String, Map<String, String>> _pendingDisputeEvidence = {};
  String? _error;
  Map<String, dynamic>? _completion;
  Map<String, dynamic>? _rating;
  List<Map<String, dynamic>> _proposals = const [];
  List<Map<String, dynamic>> _quotes = const [];
  List<Map<String, dynamic>> _extraWorkBillRequests = const [];
  List<Map<String, dynamic>> _evidence = const [];
  List<Map<String, dynamic>> _disputes = const [];
  Map<String, List<Map<String, dynamic>>> _disputeEvidence = {};
  int _stars = 0;
  final TextEditingController _comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<dynamic>([
        widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/completion'),
        widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/rating'),
      ]);
      dynamic proposalsRaw;
      dynamic quotesRaw;
      dynamic separateBillsRaw;
      dynamic evidenceRaw;
      dynamic disputesRaw;
      try {
        quotesRaw = await widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/extra-work-quotes');
      } catch (_) {
        quotesRaw = const <dynamic>[];
      }
      try {
        separateBillsRaw = await widget.apiClient.get(
          '/api/v1/consumer/services/bookings/${widget.bookingId}/extra-work-billing-requests');
      } catch (_) {
        separateBillsRaw = const <dynamic>[];
      }
      try {
        proposalsRaw = await widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/proposals');
      } catch (_) {
        proposalsRaw = const <dynamic>[];
      }
      try {
        evidenceRaw = await widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/completion-evidence');
      } catch (_) {
        evidenceRaw = const <dynamic>[];
      }
      try {
        disputesRaw = await widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/disputes');
      } catch (_) {
        disputesRaw = const <dynamic>[];
      }
      final threadRows = <String, List<Map<String, dynamic>>>{};
      for (final d in (disputesRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().take(5)) {
        final disputeId = d['id']?.toString() ?? '';
        if (disputeId.isEmpty) continue;
        try {
          final items = await widget.apiClient.get(
            '/api/v1/consumer/services/bookings/${widget.bookingId}/disputes/$disputeId/evidence');
          threadRows[disputeId] = (items as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>().toList();
        } catch (_) { threadRows[disputeId] = const []; }
      }
      if (!mounted) return;
      setState(() {
        _disputeEvidence = threadRows;
        _completion = results[0] is Map<String, dynamic> ? results[0] as Map<String, dynamic> : null;
        _rating = results[1] is Map<String, dynamic> ? results[1] as Map<String, dynamic> : null;
        _stars = (_rating?['stars'] as num?)?.toInt() ?? 0;
        _comment.text = _rating?['comment']?.toString() ?? '';
        _proposals = (proposalsRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _quotes = (quotesRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _extraWorkBillRequests = (separateBillsRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _evidence = (evidenceRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _disputes = (disputesRaw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _confirmCompletion() async {
    if (_confirming) return;
    setState(() => _confirming = true);
    try {
      await widget.apiClient.post('/api/v1/consumer/services/bookings/${widget.bookingId}/completion/confirm');
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Service completion confirmed. You can now rate the service.')),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  Future<String?> _proposalRejectionReason() async {
    final controller = TextEditingController();
    String? validationMessage;
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => AlertDialog(
          title: const Text('Decline suggested time?'),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLength: 500,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Why does this time not work?',
              errorText: validationMessage,
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Keep reviewing')),
            FilledButton(
              onPressed: () {
                final value = controller.text.trim();
                if (value.length < 3) {
                  setModalState(() => validationMessage = 'Add a short reason for the provider.');
                  return;
                }
                Navigator.of(context).pop(value);
              },
              child: const Text('Decline time'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return reason;
  }

  Future<void> _respondToProposal(Map<String, dynamic> proposal, String decision) async {
    if (_respondingProposal) return;
    String? rejectionReason;
    if (decision == 'REJECT') {
      rejectionReason = await _proposalRejectionReason();
      if (rejectionReason == null || !mounted) return;
    }
    setState(() => _respondingProposal = true);
    try {
      await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/proposals/${proposal['id']}/respond',
        {'decision': decision, if (rejectionReason != null) 'reason': rejectionReason},
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(decision == 'ACCEPT' ? 'New service time accepted.' : 'Suggested time declined. Reason saved to the timeline.')),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _respondingProposal = false);
    }
  }


  String _quoteRupees(String raw) {
    final amount = BigInt.tryParse(raw) ?? BigInt.zero;
    final rupees = amount ~/ BigInt.from(100);
    final cents = (amount % BigInt.from(100)).toString().padLeft(2, '0');
    return '₹$rupees.$cents';
  }

  Future<void> _respondToQuote(Map<String, dynamic> quote, bool approve) async {
    if (_respondingQuote) return;
    final id = quote['id']?.toString();
    if (id == null) return;
    final reasonController = TextEditingController();
    String? validation;
    final agreed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, update) => AlertDialog(
          title: Text(approve ? 'Approve extra work?' : 'Decline extra work?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(quote['scopeDescription']?.toString() ?? ''),
              const SizedBox(height: 8),
              Text('Additional quote: ${_quoteRupees(quote['amountPaise']?.toString() ?? '0')}'),
              const SizedBox(height: 8),
              const Text('This records consent only. No payment is taken and your original booking charge is unchanged.'),
              if (!approve) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: reasonController,
                  maxLength: 500,
                  maxLines: 2,
                  decoration: InputDecoration(labelText: 'Reason for declining', errorText: validation),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Keep reviewing')),
            FilledButton(
              onPressed: () {
                if (!approve && reasonController.text.trim().length < 3) {
                  update(() => validation = 'Please give a short reason.');
                  return;
                }
                Navigator.pop(dialogContext, true);
              },
              child: Text(approve ? 'Confirm approval' : 'Confirm decline'),
            ),
          ],
        ),
      ),
    );
    final reason = reasonController.text.trim();
    reasonController.dispose();
    if (agreed != true || !mounted) return;
    setState(() => _respondingQuote = true);
    try {
      await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/extra-work-quotes/$id/respond',
        {'decision': approve ? 'APPROVE' : 'DECLINE', if (!approve) 'reason': reason},
      );
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(approve ? 'Extra work approved. No payment was taken.' : 'Extra work declined.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) setState(() => _respondingQuote = false);
    }
  }


  Future<void> _requestSeparateExtraWorkBill(Map<String, dynamic> quote) async {
    if (_requestingExtraWorkBill || quote['status'] != 'APPROVED') return;
    final quoteId = quote['id']?.toString();
    if (quoteId == null || quoteId.isEmpty) return;
    final agreed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Request a separate extra-work bill?'),
        content: Text('Extra work: ${_quoteRupees(quote['amountPaise']?.toString() ?? '0')}\n'
          'This records a billing request only. It is not an invoice or payment; no charge or provider payout occurs.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Not now')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Request separate bill')),
        ],
      ),
    );
    if (agreed != true || !mounted) return;
    setState(() => _requestingExtraWorkBill = true);
    try {
      await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/extra-work-quotes/$quoteId/request-separate-bill',
        <String, dynamic>{},
      );
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Separate bill requested. No payment was collected.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Bill request not confirmed: $error. You can safely retry the same quote.')));
    } finally {
      if (mounted) setState(() => _requestingExtraWorkBill = false);
    }
  }

  Future<void> _openDispute({
    String reasonCode = 'SERVICE_NOT_COMPLETE',
    String title = 'Report a service issue',
    String detailHint = 'What went wrong?',
    String successMessage = 'Service issue submitted for review.',
  }) async {
    if (_openingDispute || _disputes.any((d) => d['status'] == 'OPEN' || d['status'] == 'UNDER_REVIEW')) return;
    final reason = TextEditingController(text: reasonCode);
    final detail = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: reason, maxLength: 80, decoration: const InputDecoration(labelText: 'Reason code')),
            TextField(controller: detail, maxLength: 2000, maxLines: 4, decoration: InputDecoration(labelText: detailHint)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Submit issue')),
        ],
      ),
    );
    if (submitted != true || detail.text.trim().length < 5 || !mounted) {
      reason.dispose();
      detail.dispose();
      return;
    }
    setState(() => _openingDispute = true);
    try {
      await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/disputes',
        {'reasonCode': reason.text.trim(), 'detail': detail.text.trim()},
      );
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      reason.dispose();
      detail.dispose();
      if (mounted) setState(() => _openingDispute = false);
    }
  }


  Future<void> _addDisputeEvidence(String disputeId) async {
    if (_addingDisputeEvidence) return;
    var pending = _pendingDisputeEvidence[disputeId];
    if (pending == null) {
      final controller = TextEditingController();
      final accepted = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Add evidence to service issue'),
          content: TextField(controller: controller, maxLength: 2000,
              maxLines: 4, decoration: const InputDecoration(
              labelText: 'Evidence note', hintText: 'Describe the work or communication')),
          actions: [
            TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('Add note')),
          ],
        ),
      );
      final text = controller.text.trim();
      controller.dispose();
      if (accepted != true || text.length < 5 || text.length > 2000 || !mounted) return;
      pending = {
        'note': text,
        'idempotencyKey': '${DateTime.now().microsecondsSinceEpoch}-$disputeId',
      };
      _pendingDisputeEvidence[disputeId] = pending;
    }
    setState(() => _addingDisputeEvidence = true);
    try {
      await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/disputes/$disputeId/evidence',
        pending,
      );
      _pendingDisputeEvidence.remove(disputeId);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Evidence note added to the review history.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Evidence not confirmed: $e. Retry the saved note.')));
    } finally {
      if (mounted) setState(() => _addingDisputeEvidence = false);
    }
  }

  Future<void> _submitRating() async {
    if (_submittingRating || _stars < 1) return;
    setState(() => _submittingRating = true);
    try {
      await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/rating',
        {
          'stars': _stars,
          if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim(),
        },
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Thanks for your feedback.')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _submittingRating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (_error != null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              const Icon(Icons.sync_problem_rounded),
              const SizedBox(width: 10),
              Expanded(child: Text('Could not load completion details. ${_error!}')),
              TextButton(onPressed: _load, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final bookingStatus = _completion?['bookingStatus']?.toString();
    final requestedAt = _completion?['requestedAt'];
    final confirmedAt = _completion?['confirmedAt'];
    final completionPending = bookingStatus == 'IN_PROGRESS' && requestedAt != null && confirmedAt == null;
    final completed = bookingStatus == 'COMPLETED' || confirmedAt != null;
    final warrantyDays = (_completion?['warrantyDays'] as num?)?.toInt();
    final revisitPolicy = _completion?['revisitPolicy']?.toString().trim();
    final warrantyUntil = DateTime.tryParse(_completion?['warrantyUntil']?.toString() ?? '')?.toLocal();
    final warrantyActive = warrantyUntil != null && DateTime.now().isBefore(warrantyUntil);
    final revisitEligible = completed && (warrantyActive || (revisitPolicy != null && revisitPolicy.isNotEmpty));
    Map<String, dynamic>? pendingProposal;
    for (final proposal in _proposals) {
      if (proposal['status']?.toString() == 'PENDING') { pendingProposal = proposal; break; }
    }

    final unresolvedDispute = _disputes.any((d) => d['status'] == 'OPEN' || d['status'] == 'UNDER_REVIEW');
    if (!completionPending && !completed && pendingProposal == null &&
        _evidence.isEmpty && _disputes.isEmpty && _quotes.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 18),
        Text('Complete & review', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        if (pendingProposal != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Provider suggested another time', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Text('${pendingProposal['proposedFrom']} → ${pendingProposal['proposedUntil']}'),
                  if ((pendingProposal['note']?.toString() ?? '').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(pendingProposal['note'].toString()),
                  ],
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(child: OutlinedButton(onPressed: _respondingProposal ? null : () => _respondToProposal(pendingProposal!, 'REJECT'), child: const Text('Decline time'))),
                      const SizedBox(width: 8),
                      Expanded(child: FilledButton(onPressed: _respondingProposal ? null : () => _respondToProposal(pendingProposal!, 'ACCEPT'), child: const Text('Accept time'))),
                    ],
                  ),
                ],
              ),
            ),
          ),

        if (_quotes.isNotEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Extra-work quotations', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  const Text('Approving a quote does not charge you or alter your original booking price.'),
                  const SizedBox(height: 10),
                  ..._quotes.take(5).map((quote) {
                    final pending = quote['status'] == 'PENDING';
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(quote['scopeDescription']?.toString() ?? ''),
                          Text('Extra work: ${_quoteRupees(quote['amountPaise']?.toString() ?? '0')}'),
                          Text('Quote status: ${quote['status'] ?? 'PENDING'}'),
                          if (_extraWorkBillRequests.any((r) => r['quoteId'] == quote['id']))
                            const Text('Separate bill requested — awaiting independent invoice and payment setup.'),
                          if (quote['status'] == 'APPROVED' &&
                              !_extraWorkBillRequests.any((r) => r['quoteId'] == quote['id'])) ...[
                            const SizedBox(height: 8),
                            OutlinedButton(
                              onPressed: _requestingExtraWorkBill ? null : () => _requestSeparateExtraWorkBill(quote),
                              child: const Text('Request separate bill'),
                            ),
                          ],
                          if ((quote['responseReason']?.toString() ?? '').isNotEmpty)
                            Text('Response: ${quote['responseReason']}'),
                          if (pending && bookingStatus == 'IN_PROGRESS') ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(child: OutlinedButton(
                                  onPressed: _respondingQuote ? null : () => _respondToQuote(quote, false),
                                  child: const Text('Decline extra work'))),
                                const SizedBox(width: 8),
                                Expanded(child: FilledButton(
                                  onPressed: _respondingQuote ? null : () => _respondToQuote(quote, true),
                                  child: const Text('Approve extra work'))),
                              ],
                            ),
                          ],
                        ],
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
        if (_disputes.isNotEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Service issue history', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  ..._disputes.take(5).map((dispute) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Status: ${dispute['status'] ?? 'OPEN'}',
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                        if ((dispute['detail']?.toString() ?? '').isNotEmpty)
                          Text(dispute['detail'].toString()),
                        if ((dispute['resolutionNote']?.toString() ?? '').isNotEmpty)
                          Text('Resolution: ${dispute['resolutionNote']}'),
                        ...(_disputeEvidence[dispute['id']?.toString() ?? ''] ?? const <Map<String, dynamic>>[])
                            .take(5).map((item) => Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text('${item['actorType'] == 'PROVIDER' ? 'Provider' : 'Resident'}: ${item['note'] ?? ''}'),
                            )),
                        if (dispute['status'] == 'OPEN' || dispute['status'] == 'UNDER_REVIEW')
                          TextButton(
                            onPressed: _addingDisputeEvidence ? null : () =>
                                _addDisputeEvidence(dispute['id'].toString()),
                            child: Text(_pendingDisputeEvidence.containsKey(dispute['id']?.toString())
                                ? 'Retry saved evidence note' : 'Add evidence note'),
                          ),
                        if (_pendingDisputeEvidence.containsKey(dispute['id']?.toString()))
                          TextButton(
                            onPressed: _addingDisputeEvidence ? null : () => setState(() =>
                                _pendingDisputeEvidence.remove(dispute['id']?.toString())),
                            child: const Text('Discard saved evidence note'),
                          ),
                      ],
                    ),
                  )),
                ],
              ),
            ),
          ),
        if (_evidence.isNotEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Provider completion evidence', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  ..._evidence.take(5).map((e) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text([e['note'], e['reference']].where((v) => (v?.toString() ?? '').isNotEmpty).join(' · ')),
                  )),
                ],
              ),
            ),
          ),
        if (completionPending)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.task_alt_rounded),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${_completion?['agentDisplayName'] ?? 'Your service professional'} says the work is complete.',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text('Confirm only after you have checked that the requested service is complete.'),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _confirming ? null : _confirmCompletion,
                      icon: _confirming
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.verified_rounded),
                      label: const Text('Confirm service completed'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _openingDispute || unresolvedDispute ? null : _openDispute,
                      icon: const Icon(Icons.report_problem_outlined),
                      label: const Text('Report an issue instead'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (completed && (warrantyDays != null || (revisitPolicy != null && revisitPolicy.isNotEmpty)))
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Icon(warrantyActive ? Icons.verified_user_rounded : Icons.verified_user_outlined),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        warrantyActive ? 'Service guarantee active' : 'Service guarantee',
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ]),
                  if (warrantyDays != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      warrantyUntil == null
                          ? '$warrantyDays-day warranty'
                          : '$warrantyDays-day warranty · ${warrantyActive ? 'valid until' : 'ended'} ${MaterialLocalizations.of(context).formatMediumDate(warrantyUntil)}',
                    ),
                  ],
                  if (revisitPolicy != null && revisitPolicy.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(revisitPolicy),
                  ],
                  if (revisitEligible) ...[
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: _openingDispute || unresolvedDispute
                          ? null
                          : () => _openDispute(
                                reasonCode: 'WARRANTY_REVISIT',
                                title: 'Request warranty revisit',
                                detailHint: 'What needs to be checked or corrected?',
                                successMessage: 'Warranty revisit request submitted for review.',
                              ),
                      icon: const Icon(Icons.replay_rounded),
                      label: const Text('Request warranty revisit'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        if (completed && _rating != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Your rating', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  _StarRow(value: _stars, onChanged: null),
                  if ((_rating?['comment']?.toString() ?? '').isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(_rating!['comment'].toString()),
                  ],
                ],
              ),
            ),
          ),
        if (completed && _rating == null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('How was the service?', style: TextStyle(fontWeight: FontWeight.w900)),
                  const SizedBox(height: 4),
                  const Text('Rate your completed service from 1 to 5 stars.'),
                  const SizedBox(height: 8),
                  _StarRow(value: _stars, onChanged: (value) => setState(() => _stars = value)),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _comment,
                    maxLength: 1000,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Comment (optional)',
                      hintText: 'Share useful feedback about the service',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _stars < 1 || _submittingRating ? null : _submitRating,
                      icon: _submittingRating
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.star_rounded),
                      label: const Text('Submit rating'),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _StarRow extends StatelessWidget {
  const _StarRow({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(5, (index) {
        final star = index + 1;
        return IconButton(
          tooltip: '$star star${star == 1 ? '' : 's'}',
          padding: EdgeInsets.zero,
          visualDensity: VisualDensity.compact,
          onPressed: onChanged == null ? null : () => onChanged!(star),
          icon: Icon(star <= value ? Icons.star_rounded : Icons.star_border_rounded),
        );
      }),
    );
  }
}
