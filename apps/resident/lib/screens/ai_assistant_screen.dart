import 'dart:convert';

import 'package:flutter/material.dart';

import '../data/api_client.dart';

class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({
    super.key,
    required this.apiClient,
    required this.unitId,
    this.demoMode = false,
  });

  final ApiClient apiClient;
  final String? unitId;
  final bool demoMode;

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _result;
  Map<String, dynamic>? _proposal;
  List<Map<String, dynamic>> _tools = const [];
  bool _toolsBusy = false;

  static const _demoPrompts = <String>[
    'What do I need to take care of today?',
    'What is my maintenance due?',
    'Show my open complaints',
    'Any visitor or staff activity today?',
    'What amenities can I book?',
    'Summarize society updates',
  ];

  @override
  void initState() {
    super.initState();
    if (!widget.demoMode) _loadTools();
  }

  Future<void> _loadTools() async {
    setState(() => _toolsBusy = true);
    try {
      final raw = await widget.apiClient.get('/api/v1/ai-operations/assistant/tools');
      if (!mounted) return;
      final body = Map<String, dynamic>.from(raw as Map);
      final tools = (body['tools'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      setState(() => _tools = tools);
    } catch (_) {
      // Capability discovery is additive; assistant queries remain available.
    } finally {
      if (mounted) setState(() => _toolsBusy = false);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    final message = _controller.text.trim();
    if (message.length < 2) return;
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });
    try {
      if (widget.demoMode) {
        await Future<void>.delayed(const Duration(milliseconds: 350));
        if (!mounted) return;
        setState(() => _result = _demoAnswer(message));
        return;
      }
      final raw = await widget.apiClient.post(
        '/api/v1/ai-operations/assistant/query',
        {
          'message': message,
          if (widget.unitId != null) 'unitId': widget.unitId,
        },
      );
      if (!mounted) return;
      setState(() => _result = Map<String, dynamic>.from(raw as Map));
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic> _demoAnswer(String message) {
    final normalized = message.toLowerCase();
    if (normalized.contains('due') || normalized.contains('maintenance') || normalized.contains('bill')) {
      return {
        'answer': 'Your September maintenance bill is ₹4,250 and is due on 25 September. Your August bill is fully paid.',
        'facts': {'outstanding': '₹4,250', 'period': 'September 2026', 'dueDate': '25 Sep 2026', 'lastPayment': '₹4,250 on 05 Aug 2026 via UPI'},
        'sources': ['Maintenance billing', 'Payment receipts'],
      };
    }
    if (normalized.contains('complaint') || normalized.contains('helpdesk') || normalized.contains('ticket')) {
      return {
        'answer': 'You have 2 active helpdesk requests. Water seepage near the balcony is high priority; the corridor-light request is already in progress.',
        'facts': {'activeRequests': 2, 'highPriority': 'Water seepage near balcony', 'inProgress': 'Corridor light not working'},
        'sources': ['Helpdesk', 'SLA status'],
      };
    }
    if (normalized.contains('visitor') || normalized.contains('staff') || normalized.contains('gate')) {
      return {
        'answer': 'Amit Verma is waiting for approval. One delivery and one cab entry were also recorded today. Lakshmi and Ramesh are active household staff.',
        'facts': {'waitingApproval': 'Amit Verma', 'recentEntries': 3, 'activeStaff': 4},
        'sources': ['Gate access', 'Domestic help'],
      };
    }
    if (normalized.contains('amenit')) {
      return {
        'answer': 'Badminton, clubhouse, swimming pool and guest-room options are available in this demo. Weekend slots are usually the busiest.',
        'facts': {'recommended': 'Badminton court · Saturday 6:00 PM', 'otherOptions': ['Clubhouse', 'Swimming pool', 'Guest room']},
        'sources': ['Amenities', 'Booking availability'],
      };
    }
    if (normalized.contains('notice') || normalized.contains('update') || normalized.contains('society')) {
      return {
        'answer': 'Key updates: lift maintenance is scheduled tomorrow, the Ganesh festival programme starts Friday at 6:30 PM, and September maintenance is pending.',
        'facts': {'priorityUpdates': 3, 'nextEvent': 'Ganesh festival · Friday 6:30 PM'},
        'sources': ['Society notices', 'Community calendar', 'Billing'],
      };
    }
    return {
      'answer': 'Today you have one visitor waiting at the gate, ₹4,250 maintenance due, two active helpdesk requests, and a Saturday badminton option. I can also summarize notices, staff, services and community activity.',
      'facts': {'gate': '1 approval waiting', 'billing': '₹4,250 due', 'helpdesk': '2 active', 'amenitySuggestion': 'Badminton · Saturday 6:00 PM'},
      'sources': ['Gate access', 'Billing', 'Helpdesk', 'Amenities'],
    };
  }

  Future<void> _draftComplaint() async {
    final message = _controller.text.trim();
    final unitId = widget.unitId;
    if (message.length < 5 || unitId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (widget.demoMode) {
        await Future<void>.delayed(const Duration(milliseconds: 300));
        if (!mounted) return;
        final lower = message.toLowerCase();
        setState(() => _proposal = {
          'id': 'demo-ai-proposal-1',
          'status': 'PROPOSED',
          'title': 'Resident-reported issue',
          'description': message,
          'category': lower.contains('water') || lower.contains('leak') ? 'PLUMBING' : lower.contains('light') || lower.contains('power') ? 'ELECTRICAL' : lower.contains('lift') ? 'LIFT' : 'GENERAL',
          'priority': lower.contains('urgent') || lower.contains('leak') || lower.contains('danger') ? 'HIGH' : 'NORMAL',
        });
        return;
      }
      final raw = await widget.apiClient.post(
        '/api/v1/ai-operations/assistant/helpdesk-from-text',
        {'unitId': unitId, 'text': message},
      );
      if (!mounted) return;
      setState(() => _proposal = Map<String, dynamic>.from(raw as Map));
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _proposalAction(bool confirm) async {
    final id =
        _proposal?['id']?.toString() ?? _proposal?['proposalId']?.toString();
    if (id == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (widget.demoMode) {
        await Future<void>.delayed(const Duration(milliseconds: 250));
        if (!mounted) return;
        setState(() => _proposal = {...?_proposal, 'status': confirm ? 'CONFIRMED' : 'CANCELLED', if (confirm) 'ticketId': 'demo-ticket-ai-1'});
        return;
      }
      final action = confirm ? 'confirm' : 'cancel';
      final raw = await widget.apiClient.post(
        '/api/v1/ai-operations/proposals/$id/$action',
      );
      if (!mounted) return;
      setState(() => _proposal = Map<String, dynamic>.from(raw as Map));
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _overviewCard(ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.auto_awesome_rounded, color: theme.colorScheme.primary),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Grounded operations assistant',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              widget.demoMode
                  ? 'Explore a safe AI showcase using the demo society data on this device.'
                  : 'Answers use authorized Aaraagate records only. The assistant cannot change society data directly; actions require an explicit confirmation.',
            ),
            if (widget.demoMode) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final prompt in _demoPrompts)
                    ActionChip(
                      label: Text(prompt),
                      onPressed: _busy ? null : () { _controller.text = prompt; _ask(); },
                    ),
                ],
              ),
            ],
            if (!widget.demoMode && (_toolsBusy || _tools.isNotEmpty)) ...[
              const SizedBox(height: 14),
              Text('Available for you', style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              if (_toolsBusy)
                const LinearProgressIndicator(minHeight: 2)
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final tool in _tools)
                      Chip(
                        avatar: Icon(tool['context'] == 'PROPERTY' ? Icons.home_outlined : Icons.apartment_outlined, size: 18),
                        label: Text(tool['label']?.toString() ?? tool['id']?.toString() ?? 'Assistant capability'),
                      ),
                  ],
                ),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText:
                    'Ask about dues, receipts, bookings, complaints, amenities or services',
                hintText: 'Example: What is the status of my maintenance dues?',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _ask,
                    icon: const Icon(Icons.send_rounded),
                    label: Text(_busy ? 'Checking…' : 'Ask'),
                  ),
                ),
                if (widget.unitId != null) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : _draftComplaint,
                      icon: const Icon(Icons.edit_note_rounded),
                      label: const Text('Complaint draft'),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorCard(ThemeData theme) {
    return Card(
      color: theme.colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(
          _error!,
          style: TextStyle(color: theme.colorScheme.onErrorContainer),
        ),
      ),
    );
  }

  Widget _resultCard(ThemeData theme) {
    final sources = (_result!['sources'] as List?) ?? const [];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _result!['answer']?.toString() ?? 'Grounded result',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            _factsView(theme, _result!['facts']),
            const SizedBox(height: 10),
            Text(
              'Sources: ${sources.join(', ')}',
              style: theme.textTheme.labelMedium,
            ),
          ],
        ),
      ),
    );
  }

  Widget _factsView(ThemeData theme, dynamic facts) {
    if (facts is Map) {
      final entries = facts.entries.toList(growable: false);
      if (entries.isEmpty) return Text('No additional records returned.', style: theme.textTheme.bodySmall);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final entry in entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text('${entry.key}: ${_displayValue(entry.value)}', style: theme.textTheme.bodySmall),
            ),
        ],
      );
    }
    if (facts is List) {
      if (facts.isEmpty) return Text('No matching records found.', style: theme.textTheme.bodySmall);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [for (final item in facts.take(8)) Text('• ${_displayValue(item)}', style: theme.textTheme.bodySmall)],
      );
    }
    return Text(_displayValue(facts), style: theme.textTheme.bodySmall);
  }

  String _displayValue(dynamic value) {
    if (value == null) return '—';
    if (value is List) return value.map(_displayValue).join(' · ');
    if (value is Map) return value.entries.map((e) => '${e.key}: ${_displayValue(e.value)}').join(' · ');
    return value.toString();
  }

  Widget _proposalCard() {
    final status = _proposal!['status']?.toString() ?? 'PROPOSED';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Complaint action proposal',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
            ),
            const SizedBox(height: 6),
            Text('Status: $status'),
            const SizedBox(height: 6),
            Text(
              widget.demoMode
                  ? 'Demo safeguard: this simulates confirm/cancel and does not submit external data.'
                  : 'Nothing is submitted until you confirm. Normal complaint authorization and validation still apply.',
            ),
            if (status == 'PROPOSED') ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => _proposalAction(false),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : () => _proposalAction(true),
                      child: const Text('Confirm complaint'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final content = <Widget>[_overviewCard(theme)];
    if (_error != null) {
      content.add(const SizedBox(height: 12));
      content.add(_errorCard(theme));
    }
    if (_result != null) {
      content.add(const SizedBox(height: 12));
      content.add(_resultCard(theme));
    }
    if (_proposal != null) {
      content.add(const SizedBox(height: 12));
      content.add(_proposalCard());
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Aaraagate Assistant')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 32),
        children: content,
      ),
    );
  }
}
