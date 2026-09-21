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
  bool _openingDispute = false;
  String? _error;
  Map<String, dynamic>? _completion;
  Map<String, dynamic>? _rating;
  List<Map<String, dynamic>> _proposals = const [];
  List<Map<String, dynamic>> _evidence = const [];
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
        widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/proposals'),
        widget.apiClient.get('/api/v1/consumer/services/bookings/${widget.bookingId}/completion-evidence'),
      ]);
      if (!mounted) return;
      setState(() {
        _completion = results[0] is Map<String, dynamic> ? results[0] as Map<String, dynamic> : null;
        _rating = results[1] is Map<String, dynamic> ? results[1] as Map<String, dynamic> : null;
        _stars = (_rating?['stars'] as num?)?.toInt() ?? 0;
        _comment.text = _rating?['comment']?.toString() ?? '';
        _proposals = (results[2] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
        _evidence = (results[3] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
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

  Future<void> _respondToProposal(Map<String, dynamic> proposal, String decision) async {
    if (_respondingProposal) return;
    setState(() => _respondingProposal = true);
    try {
      await widget.apiClient.post(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/proposals/${proposal['id']}/respond',
        {'decision': decision},
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(decision == 'ACCEPT' ? 'New service time accepted.' : 'Suggested time declined.')),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _respondingProposal = false);
    }
  }

  Future<void> _openDispute() async {
    if (_openingDispute) return;
    final reason = TextEditingController(text: 'SERVICE_NOT_COMPLETE');
    final detail = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Report a service issue'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: reason, maxLength: 80, decoration: const InputDecoration(labelText: 'Reason code')),
            TextField(controller: detail, maxLength: 2000, maxLines: 4, decoration: const InputDecoration(labelText: 'What went wrong?')),
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Service issue submitted for review.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      reason.dispose();
      detail.dispose();
      if (mounted) setState(() => _openingDispute = false);
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
    Map<String, dynamic>? pendingProposal;
    for (final proposal in _proposals) {
      if (proposal['status']?.toString() == 'PENDING') { pendingProposal = proposal; break; }
    }

    if (!completionPending && !completed && pendingProposal == null && _evidence.isEmpty) return const SizedBox.shrink();

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
                      onPressed: _openingDispute ? null : _openDispute,
                      icon: const Icon(Icons.report_problem_outlined),
                      label: const Text('Report an issue instead'),
                    ),
                  ),
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
