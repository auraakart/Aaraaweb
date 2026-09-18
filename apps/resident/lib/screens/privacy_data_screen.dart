import 'package:flutter/material.dart';
import '../data/api_client.dart';

class PrivacyDataScreen extends StatefulWidget {
  const PrivacyDataScreen({super.key, this.apiClient});

  final ApiClient? apiClient;

  @override
  State<PrivacyDataScreen> createState() => _PrivacyDataScreenState();
}

class _PrivacyDataScreenState extends State<PrivacyDataScreen> {
  bool _loading = false;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _requests = const [];
  String? _pendingFingerprint;
  String? _pendingRequestKey;

  @override
  void initState() {
    super.initState();
    if (widget.apiClient != null) _loadRequests();
  }

  Future<void> _loadRequests() async {
    final api = widget.apiClient;
    if (api == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await api.get('/api/v1/privacy/self/requests');
      if (!mounted) return;
      setState(() {
        _requests = (raw as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList();
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<String?> _requestDetails({
    required String title,
    required String prompt,
    bool required = false,
  }) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(prompt),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                maxLength: 1000,
                maxLines: 4,
                onChanged: (_) => setDialogState(() {}),
                decoration: InputDecoration(
                  labelText: required ? 'Details (required)' : 'Additional details (optional)',
                  alignLabelWithHint: true,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: required && controller.text.trim().isEmpty
                  ? null
                  : () => Navigator.pop(dialogContext, controller.text.trim()),
              child: const Text('Submit request'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> _createRequest({
    required String type,
    required String title,
    required String prompt,
    required String baseSummary,
    bool detailsRequired = false,
  }) async {
    final api = widget.apiClient;
    if (api == null || _submitting) return;
    final details = await _requestDetails(title: title, prompt: prompt, required: detailsRequired);
    if (details == null || !mounted) return;

    final summary = details.isEmpty ? baseSummary : '$baseSummary Details: $details';
    final fingerprint = '$type|$summary';
    if (_pendingFingerprint != fingerprint || _pendingRequestKey == null) {
      _pendingFingerprint = fingerprint;
      _pendingRequestKey = 'privacy-${DateTime.now().microsecondsSinceEpoch}';
    }
    final requestKey = _pendingRequestKey!;

    setState(() => _submitting = true);
    try {
      await api.post('/api/v1/privacy/self/requests', {
        'requestType': type,
        'requestSummary': summary,
        'requestKey': requestKey,
      });
      _pendingFingerprint = null;
      _pendingRequestKey = null;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Privacy request submitted.')));
      await _loadRequests();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Request was not confirmed. Retrying the same request is safe. ${error.toString()}')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy & data use')),
      body: RefreshIndicator(
        onRefresh: widget.apiClient == null ? () async {} : _loadRequests,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Text(
              'How Aaraagate uses your information',
              style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            const Text(
              'Aaraagate uses account, property and activity information to provide society, gate, billing and household-service features. This screen explains the current product behaviour; it does not replace the formal privacy notice or society policy.',
            ),
            const SizedBox(height: 20),
            const _PrivacySection(
              icon: Icons.person_outline_rounded,
              title: 'Account & property context',
              body: 'Your verified mobile account and selected society/property context are used to show only the features and records available for that context.',
            ),
            const _PrivacySection(
              icon: Icons.shield_outlined,
              title: 'Gate & visitor activity',
              body: 'Visitor, delivery, cab and access records are used for entry approval, gate operations and related audit history. Share visitor pass codes only with the intended visitor.',
            ),
            const _PrivacySection(
              icon: Icons.notifications_none_rounded,
              title: 'Notifications',
              body: 'If notifications are enabled on this device, Aaraagate may register the device for society and property-related alerts. Device notification permission remains under your phone settings.',
            ),
            const _PrivacySection(
              icon: Icons.payments_outlined,
              title: 'Payments',
              body: 'Maintenance payment orders and their status are recorded so dues and receipts can be reconciled. A payment is not shown as successful until the configured payment gateway confirms it.',
            ),
            const _PrivacySection(
              icon: Icons.home_repair_service_outlined,
              title: 'Household services & staff',
              body: 'Bookings, provider assignments, domestic-help activity and ratings are used to operate the services you request for the selected property.',
            ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.manage_accounts_outlined),
                        SizedBox(width: 10),
                        Expanded(child: Text('Your data requests', style: TextStyle(fontWeight: FontWeight.w900))),
                      ],
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'You can request a copy of your data, ask for a correction, or request an erasure review. Erasure is not immediate: applicable retention, accounting, security, dispute and legal-hold requirements are reviewed before a case can be completed.',
                    ),
                    const SizedBox(height: 14),
                    if (widget.apiClient == null)
                      const Text('Sign in to submit and track privacy requests.')
                    else ...[
                      OutlinedButton.icon(
                        onPressed: _submitting
                            ? null
                            : () => _createRequest(
                                  type: 'ACCESS',
                                  title: 'Request a copy of your data',
                                  prompt: 'You can add context for the data-access request, or submit without additional details.',
                                  baseSummary: 'Provide a copy of my personal data associated with this account context.',
                                ),
                        icon: const Icon(Icons.download_outlined),
                        label: const Text('Request my data'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _submitting
                            ? null
                            : () => _createRequest(
                                  type: 'CORRECTION',
                                  title: 'Request a correction',
                                  prompt: 'Describe what information you believe should be corrected.',
                                  baseSummary: 'Review and correct my personal data.',
                                  detailsRequired: true,
                                ),
                        icon: const Icon(Icons.edit_note_rounded),
                        label: const Text('Request a correction'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _submitting
                            ? null
                            : () => _createRequest(
                                  type: 'ERASURE',
                                  title: 'Request an erasure review',
                                  prompt: 'You may add context for the request. Some records can require retention and may not be immediately deletable.',
                                  baseSummary: 'Review my personal data for erasure subject to applicable retention and legal-hold requirements.',
                                ),
                        icon: const Icon(Icons.delete_outline_rounded),
                        label: const Text('Request deletion review'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (widget.apiClient != null) ...[
              Row(
                children: [
                  Expanded(child: Text('Request status', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
                  if (_loading)
                    const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                ],
              ),
              const SizedBox(height: 10),
              if (_error != null)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.cloud_off_outlined),
                    title: const Text('Could not load privacy requests'),
                    subtitle: Text(_error!),
                    trailing: TextButton(onPressed: _loadRequests, child: const Text('Retry')),
                  ),
                )
              else if (!_loading && _requests.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('No privacy requests in this account context yet.')))
              else
                for (final request in _requests) _RequestCard(request: request),
            ],
            const SizedBox(height: 12),
            Text(
              'Aaraagate does not make a data-retention or regulatory-compliance claim on this screen. Formal commitments come from the applicable privacy notice, configured deployment process and qualified legal review.',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request});

  final Map<String, dynamic> request;

  @override
  Widget build(BuildContext context) {
    final type = request['requestType']?.toString() ?? 'OTHER';
    final status = request['status']?.toString() ?? 'OPEN';
    final legalHold = request['legalHold'] == true;
    final created = DateTime.tryParse(request['createdAt']?.toString() ?? '')?.toLocal();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(_typeLabel(type), style: const TextStyle(fontWeight: FontWeight.w900))),
                Chip(label: Text(status.replaceAll('_', ' ').toLowerCase())),
              ],
            ),
            Text(request['requestSummary']?.toString() ?? ''),
            if (created != null) ...[
              const SizedBox(height: 6),
              Text('Submitted ${created.day}/${created.month}/${created.year}', style: Theme.of(context).textTheme.bodySmall),
            ],
            if (legalHold) ...[
              const SizedBox(height: 8),
              const Text(
                'Retention review applies before this request can be completed.',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static String _typeLabel(String type) {
    switch (type) {
      case 'ACCESS':
        return 'Data access request';
      case 'CORRECTION':
        return 'Correction request';
      case 'ERASURE':
        return 'Erasure review request';
      default:
        return 'Privacy request';
    }
  }
}

class _PrivacySection extends StatelessWidget {
  const _PrivacySection({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(child: Icon(icon)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 5),
                    Text(body),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}
