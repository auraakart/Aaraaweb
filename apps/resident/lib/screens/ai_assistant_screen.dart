import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../theme/aaraagate_theme.dart';
import '../voice/resident_speech.dart';
import '../widgets/premium_ui.dart';

class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({
    super.key,
    required this.apiClient,
    required this.unitId,
    this.demoMode = false,
    this.initialPrompt,
    this.speech,
  });

  final ApiClient apiClient;
  final String? unitId;
  final bool demoMode;
  final String? initialPrompt;
  final ResidentSpeech? speech;

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _result;
  Map<String, dynamic>? _proposal;
  late final ResidentSpeech _speech;
  bool _listening = false;
  String _voiceLanguage = 'en';
  String? _voiceStatus;

  static const _quickActions = <({String label, String prompt, IconData icon})>[
    (label: 'Maintenance dues', prompt: 'What is my maintenance due?', icon: Icons.receipt_long_rounded),
    (label: 'Open complaints', prompt: 'Show my open complaints', icon: Icons.support_agent_rounded),
    (label: "Today's visitors & staff", prompt: 'Any visitor or staff activity today?', icon: Icons.groups_2_outlined),
    (label: 'Book amenities', prompt: 'What amenities can I book?', icon: Icons.event_available_rounded),
    (label: 'Society updates', prompt: 'Summarize society updates', icon: Icons.campaign_outlined),
  ];

  @override
  void initState() {
    super.initState();
    _speech = widget.speech ?? DeviceResidentSpeech();
    if (widget.initialPrompt?.trim().isNotEmpty == true) {
      _controller.text = widget.initialPrompt!.trim();
    }
  }

  void _clearPendingProposal() {
    if (_proposal?['status']?.toString() == 'PROPOSED') _proposal = null;
  }

  @override
  void dispose() {
    _speech.stop();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _listenForAssistant() async {
    if (_busy || _listening) return;
    setState(() {
      _listening = true;
      _voiceStatus = ResidentVoiceCopy.text(_voiceLanguage, 'assistantListening');
      _error = null;
    });
    try {
      final text = await _speech.listenOnce(languageCode: _voiceLanguage);
      if (!mounted) return;
      if (text == null || text.trim().isEmpty) {
        setState(() => _voiceStatus = ResidentVoiceCopy.text(_voiceLanguage, 'assistantUnavailable'));
        return;
      }
      setState(() {
        _clearPendingProposal();
        _controller.text = text.trim();
        _controller.selection = TextSelection.collapsed(offset: _controller.text.length);
        _voiceStatus = ResidentVoiceCopy.text(_voiceLanguage, 'assistantReview');
      });
    } finally {
      if (mounted) setState(() => _listening = false);
    }
  }

  Future<void> _ask() async {
    final message = _controller.text.trim();
    if (message.length < 2) return;
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
      _clearPendingProposal();
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
      _result = null;
      _clearPendingProposal();
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
    final scheme = theme.colorScheme;
    final languagePicker = InputDecorator(
      decoration: const InputDecoration(labelText: 'Language'),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _voiceLanguage,
          isExpanded: true,
          onChanged: _listening ? null : (value) => setState(() => _voiceLanguage = value ?? 'en'),
          items: [
            for (final entry in ResidentVoiceCopy.languageLabels.entries)
              DropdownMenuItem(value: entry.key, child: Text(entry.value)),
          ],
        ),
      ),
    );
    final speakButton = OutlinedButton.icon(
      onPressed: _busy || _listening ? null : _listenForAssistant,
      icon: Icon(_listening ? Icons.graphic_eq_rounded : Icons.mic_none_rounded),
      label: Text(_listening
          ? ResidentVoiceCopy.text(_voiceLanguage, 'assistantListening')
          : ResidentVoiceCopy.text(_voiceLanguage, 'assistantAction')),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PremiumPageIntro(
          icon: Icons.auto_awesome_rounded,
          title: 'How can I help?',
          supportingText: widget.demoMode
              ? 'Try a question using the demo society data.'
              : 'Get a quick answer from your selected property and permissions.',
        ),
        const SizedBox(height: AaraagateTokens.space5),
        const PremiumSectionHeader(
          title: 'Quick actions',
          supportingText: 'Choose one or type your own question.',
        ),
        const SizedBox(height: AaraagateTokens.space3),
        Wrap(
          spacing: AaraagateTokens.space2,
          runSpacing: AaraagateTokens.space2,
          children: [
            for (final action in _quickActions)
              ActionChip(
                avatar: Icon(action.icon, size: 18, color: scheme.primary),
                label: Text(action.label),
                onPressed: _busy
                    ? null
                    : () {
                        setState(() {
                          _clearPendingProposal();
                          _controller.text = action.prompt;
                          _controller.selection = TextSelection.collapsed(offset: _controller.text.length);
                          _voiceStatus = null;
                        });
                        _ask();
                      },
              ),
          ],
        ),
        const SizedBox(height: AaraagateTokens.space5),
        PremiumSurface(
          elevated: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LayoutBuilder(
                builder: (context, constraints) {
                  final scale = MediaQuery.textScalerOf(context).scale(1.0);
                  final stacked = constraints.maxWidth < 430 || scale > 1.25;
                  if (stacked) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        languagePicker,
                        const SizedBox(height: AaraagateTokens.space2),
                        speakButton,
                      ],
                    );
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(child: languagePicker),
                      const SizedBox(width: AaraagateTokens.space3),
                      speakButton,
                    ],
                  );
                },
              ),
              if (_voiceStatus != null) ...[
                const SizedBox(height: AaraagateTokens.space2),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      _listening ? Icons.hearing_rounded : Icons.check_circle_outline_rounded,
                      size: 18,
                      color: scheme.primary,
                    ),
                    const SizedBox(width: AaraagateTokens.space2),
                    Expanded(
                      child: Text(
                        _voiceStatus!,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: AaraagateTokens.space3),
              TextField(
                controller: _controller,
                onChanged: (_) {
                  if (_proposal?['status']?.toString() == 'PROPOSED') {
                    setState(_clearPendingProposal);
                  }
                },
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Ask Aaraagate',
                  hintText: 'Dues, visitors, complaints, amenities or society updates',
                ),
              ),
              const SizedBox(height: AaraagateTokens.space3),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _busy ? null : _ask,
                  icon: const Icon(Icons.send_rounded),
                  label: Text(_busy ? 'Checking…' : 'Ask'),
                ),
              ),
              if (widget.unitId != null) ...[
                const SizedBox(height: AaraagateTokens.space2),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _draftComplaint,
                    icon: const Icon(Icons.edit_note_rounded),
                    label: const Text('Create complaint'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _errorCard(ThemeData theme) {
    return PremiumSurface(
      color: theme.colorScheme.errorContainer,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, color: theme.colorScheme.onErrorContainer),
          const SizedBox(width: AaraagateTokens.space2),
          Expanded(
            child: Text(
              _error!,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }

  Widget _resultCard(ThemeData theme) {
    final sources = ((_result!['sources'] as List?) ?? const [])
        .map((source) => source.toString().trim())
        .where((source) => source.isNotEmpty)
        .take(3)
        .toList(growable: false);
    final answer = _result!['answer']?.toString().trim();

    return PremiumSurface(
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
                ),
                child: Icon(Icons.auto_awesome_rounded, color: theme.colorScheme.primary, size: 21),
              ),
              const SizedBox(width: AaraagateTokens.space3),
              Text('Answer', style: theme.textTheme.titleMedium),
            ],
          ),
          const SizedBox(height: AaraagateTokens.space3),
          Text(
            answer?.isNotEmpty == true ? answer! : 'No matching information was found.',
            style: theme.textTheme.bodyLarge,
          ),
          if (sources.isNotEmpty) ...[
            const SizedBox(height: AaraagateTokens.space3),
            Text(
              'Based on ' + sources.join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
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
              'Review complaint before submitting',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17),
            ),
            const SizedBox(height: 6),
            Text(status == 'PROPOSED' ? 'Ready for your review' : status == 'EXECUTED' || status == 'CONFIRMED' ? 'Complaint submitted' : status == 'CANCELLED' ? 'Complaint cancelled' : 'Status: $status'),
            const SizedBox(height: 6),
            Text(
              widget.demoMode
                  ? 'Demo safeguard: this simulates review and confirmation and does not submit external data.'
                  : status == 'PROPOSED'
                      ? 'Aaraagate prepared this from your description. Review it first—nothing is submitted until you confirm.'
                      : status == 'EXECUTED' || status == 'CONFIRMED'
                          ? 'Your complaint has been submitted through the normal authorized helpdesk workflow.'
                          : status == 'CANCELLED'
                              ? 'This proposal was cancelled and no complaint was submitted.'
                              : 'Normal complaint authorization and validation still apply.',
            ),
            if (status == 'PROPOSED') ...[
              const SizedBox(height: 12),
              if ((_proposal!['title']?.toString().trim().isNotEmpty ?? false))
                Text('Title: ${_proposal!['title']}'),
              if ((_proposal!['category']?.toString().trim().isNotEmpty ?? false))
                Text('Category: ${_proposal!['category']}'),
              if ((_proposal!['priority']?.toString().trim().isNotEmpty ?? false))
                Text('Priority: ${_proposal!['priority']}'),
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
      content.add(const SizedBox(height: AaraagateTokens.space3));
      content.add(_errorCard(theme));
    }
    if (_result != null) {
      content.add(const SizedBox(height: AaraagateTokens.space3));
      content.add(_resultCard(theme));
    }
    if (_proposal != null) {
      content.add(const SizedBox(height: AaraagateTokens.space3));
      content.add(_proposalCard());
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Aaraagate Assistant')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AaraagateTokens.pageGutter,
          AaraagateTokens.space3,
          AaraagateTokens.pageGutter,
          AaraagateTokens.space8,
        ),
        children: content,
      ),
    );
  }

}
