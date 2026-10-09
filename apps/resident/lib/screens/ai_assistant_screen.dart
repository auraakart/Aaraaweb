import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/assistant_destinations.dart';
import '../data/assistant_followup_context.dart';
import '../data/demo_ai_assistant_answers.dart';
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
    this.onOpenSection,
  });

  final ApiClient apiClient;
  final String? unitId;
  final bool demoMode;
  final String? initialPrompt;
  final ResidentSpeech? speech;
  final ValueChanged<String>? onOpenSection;

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _result;
  Map<String, dynamic>? _proposal;
  String? _lastSubmittedMessage;
  String? _lastPolicyPrompt;
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

  @override
  void didUpdateWidget(covariant AiAssistantScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.unitId != widget.unitId || oldWidget.demoMode != widget.demoMode || oldWidget.apiClient != widget.apiClient) {
      // Never display a prior household's answer or reuse its conversation topic.
      _lastPolicyPrompt = null;
      _lastSubmittedMessage = null;
      _result = null;
      _proposal = null;
      _error = null;
      _controller.clear();
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
    } on ResidentSpeechUnavailable {
      if (mounted) setState(() => _voiceStatus = ResidentVoiceCopy.text(_voiceLanguage, 'assistantUnsupported'));
    } catch (_) {
      if (mounted) setState(() => _voiceStatus = ResidentVoiceCopy.text(_voiceLanguage, 'assistantUnavailable'));
    } finally {
      if (mounted) setState(() => _listening = false);
    }
  }

  Future<void> _ask() async {
    if (_busy || _listening) return;
    final message = _controller.text.trim();
    if (message.length < 2) return;
    final requestedUnitId = widget.unitId;
    final effectiveMessage = expandSocietyPolicyFollowup(message,
      previousQuestion: _lastPolicyPrompt,
      previousIntent: _lastPolicyPrompt == null ? null : 'SOCIETY_KNOWLEDGE',
    );
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
      _lastSubmittedMessage = message;
      _clearPendingProposal();
    });
    try {
      if (widget.demoMode) {
        await Future<void>.delayed(const Duration(milliseconds: 350));
        if (!mounted || widget.unitId != requestedUnitId) return;
        final demoResult = DemoAiAssistantAnswers.answer(effectiveMessage, unitId: requestedUnitId);
        setState(() {
          _result = demoResult;
          _lastPolicyPrompt = demoResult['intent'] == 'SOCIETY_KNOWLEDGE' ? effectiveMessage : null;
        });
        return;
      }
      final raw = await widget.apiClient.post(
        '/api/v1/ai-operations/assistant/query',
        {
          'message': effectiveMessage,
          if (requestedUnitId != null) 'unitId': requestedUnitId,
        },
      );
      if (!mounted || widget.unitId != requestedUnitId) return;
      final next = Map<String, dynamic>.from(raw as Map);
      setState(() {
        _result = next;
        _lastPolicyPrompt = next['intent'] == 'SOCIETY_KNOWLEDGE' ? effectiveMessage : null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _draftComplaint() async {
    if (_busy || _listening) return;
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
          onChanged: _busy || _listening ? null : (value) => setState(() => _voiceLanguage = value ?? 'en'),
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
                onPressed: _busy || _listening
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
                      _listening ? Icons.hearing_rounded : Icons.info_outline_rounded,
                      size: 18,
                      color: scheme.primary,
                    ),
                    const SizedBox(width: AaraagateTokens.space2),
                    Expanded(
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                        _voiceStatus!,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: AaraagateTokens.space3),
              TextField(
                controller: _controller,
                readOnly: _listening || _busy,
                onChanged: (_) {
                  if (_proposal?['status']?.toString() == 'PROPOSED' || _result != null) {
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
                  onPressed: _busy || _listening ? null : _ask,
                  icon: const Icon(Icons.send_rounded),
                  label: Text(_busy ? 'Checking…' : 'Ask'),
                ),
              ),
              if (widget.unitId != null) ...[
                const SizedBox(height: AaraagateTokens.space2),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _busy || _listening ? null : _draftComplaint,
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

  bool get _canPrepareComplaintFromAnswer {
    final prompt = _lastSubmittedMessage;
    return widget.unitId != null && !_busy && !_listening &&
        _result != null && prompt != null &&
        _controller.text.trim() == prompt &&
        RegExp(r'\b(?:raise|file|create|submit|register)\s+(?:a\s+)?(?:complaint|ticket)\b|\breport\s+(?:an?\s+)?(?:issue|problem)\b',
          caseSensitive: false).hasMatch(prompt);
  }

  Widget _resultCard(ThemeData theme) {
    final sources = ((_result!['sources'] as List?) ?? const [])
        .map((source) => source.toString().trim())
        .where((source) => source.isNotEmpty)
        .take(3)
        .toList(growable: false);
    final answer = _result!['answer']?.toString().trim();
    final destination = widget.unitId != null && sources.isNotEmpty
        ? assistantDestinationForIntent(_result!['intent']?.toString()) : null;

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
              Expanded(child: Text('Answer', style: theme.textTheme.titleMedium)),
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
          if (destination != null && widget.onOpenSection != null) ...[
            const SizedBox(height: AaraagateTokens.space3),
            OutlinedButton.icon(
              icon: const Icon(Icons.open_in_new_rounded),
              label: Text(destination.label),
              onPressed: () => widget.onOpenSection!(destination.section),
            ),
          ],
          if (_canPrepareComplaintFromAnswer) ...[
            const SizedBox(height: AaraagateTokens.space3),
            OutlinedButton.icon(
              onPressed: _draftComplaint,
              icon: const Icon(Icons.edit_note_rounded),
              label: const Text('Prepare complaint for review'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _proposalCard() {
    final status = _proposal!['status']?.toString() ?? 'PROPOSED';
    return PremiumSurface(
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Review complaint before submitting',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
            const SizedBox(height: 8),
            Text(status == 'PROPOSED' ? 'Ready for your review' : status == 'EXECUTED' || status == 'CONFIRMED' ? 'Complaint submitted' : status == 'CANCELLED' ? 'Complaint cancelled' : 'Status: $status'),
            const SizedBox(height: 8),
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
              const SizedBox(height: 16),
              PremiumActionGroup(
                primary: FilledButton(
                  onPressed: _busy ? null : () => _proposalAction(true),
                  child: const Text('Confirm complaint'),
                ),
                secondary: OutlinedButton(
                  onPressed: _busy ? null : () => _proposalAction(false),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ],
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
