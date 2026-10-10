import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/assistant_destinations.dart';
import '../data/assistant_followup_context.dart';
import '../preferences/assistant_local_preferences.dart';
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
    this.assistantPreferences,
    this.preferenceScope,
  });

  final ApiClient apiClient;
  final String? unitId;
  final bool demoMode;
  final String? initialPrompt;
  final ResidentSpeech? speech;
  final ValueChanged<String>? onOpenSection;
  final AssistantLocalPreferences? assistantPreferences;
  final String? preferenceScope;

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final TextEditingController _controller = TextEditingController();
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _result;
  String? _lastSubmittedMessage;
  String? _lastPolicyPrompt;
  bool _dailyBriefingShortcut = false;
  bool? _feedbackHelpful;
  late AssistantLocalPreferences _localPreferences;
  int _preferenceLoadEpoch = 0;
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
    _localPreferences = widget.assistantPreferences ?? AssistantLocalPreferences(scope: widget.preferenceScope);
    _readAssistantPreferences();
    if (widget.initialPrompt?.trim().isNotEmpty == true) {
      _controller.text = widget.initialPrompt!.trim();
    }
  }

  Future<void> _readAssistantPreferences() async {
    final epoch = ++_preferenceLoadEpoch;
    try {
      final enabled = await _localPreferences.loadBriefingShortcut();
      if (mounted && epoch == _preferenceLoadEpoch) {
        setState(() => _dailyBriefingShortcut = enabled);
      }
    } catch (_) {
      if (mounted && epoch == _preferenceLoadEpoch) {
        setState(() => _dailyBriefingShortcut = false);
      }
    }
  }

  Future<void> _setDailyBriefingShortcut(bool enabled) async {
    final previous = _dailyBriefingShortcut;
    setState(() => _dailyBriefingShortcut = enabled);
    try {
      await _localPreferences.setBriefingShortcut(enabled);
    } catch (_) {
      if (mounted) {
        setState(() => _dailyBriefingShortcut = previous);
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          const SnackBar(content: Text('Could not save Assistant preference.')),
        );
      }
    }
  }

  @override
  void didUpdateWidget(covariant AiAssistantScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.preferenceScope != widget.preferenceScope) {
      _dailyBriefingShortcut = false;
      if (widget.assistantPreferences == null) {
        _localPreferences = AssistantLocalPreferences(scope: widget.preferenceScope);
      }
      _readAssistantPreferences();
    }
    if (oldWidget.unitId != widget.unitId || oldWidget.demoMode != widget.demoMode || oldWidget.apiClient != widget.apiClient || oldWidget.preferenceScope != widget.preferenceScope) {
      // Never display a prior household's answer or reuse its conversation topic.
      _lastPolicyPrompt = null;
      _lastSubmittedMessage = null;
      _feedbackHelpful = null;
      _result = null;
      _error = null;
      _controller.clear();
    }
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
        _lastSubmittedMessage = null;
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
      _feedbackHelpful = null;
      _lastSubmittedMessage = message;
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
            for (final action in [
              ..._quickActions,
              if (_dailyBriefingShortcut)
                (label: 'Daily briefing', prompt: 'What is happening today?', icon: Icons.wb_sunny_outlined),
            ])
              ActionChip(
                avatar: Icon(action.icon, size: 18, color: scheme.primary),
                label: Text(action.label),
                onPressed: _busy || _listening
                    ? null
                    : () {
                        setState(() {
                          _controller.text = action.prompt;
                          _controller.selection = TextSelection.collapsed(offset: _controller.text.length);
                          _voiceStatus = null;
                        });
                        _ask();
                      },
              ),
          ],
        ),
        if (widget.preferenceScope?.trim().isNotEmpty == true || widget.assistantPreferences != null)
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: const Text('Show daily briefing shortcut'),
          subtitle: const Text('Optional on this device. No push notifications or background monitoring.'),
          value: _dailyBriefingShortcut,
          onChanged: _busy || _listening ? null : _setDailyBriefingShortcut,
        ),
        const SizedBox(height: AaraagateTokens.space3),
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
                  if (_lastSubmittedMessage != null) {
                    setState(() => _lastSubmittedMessage = null);
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

  bool get _canOpenHelpdeskForComplaint {
    final prompt = _lastSubmittedMessage;
    return widget.unitId != null && widget.onOpenSection != null && !_busy && !_listening &&
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
          const SizedBox(height: AaraagateTokens.space3),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AaraagateTokens.space2,
            children: [
              const Text('Was this useful?'),
              TextButton.icon(
                onPressed: () => setState(() => _feedbackHelpful = true),
                icon: const Icon(Icons.thumb_up_outlined, size: 18),
                label: const Text('Helpful'),
              ),
              TextButton.icon(
                onPressed: () => setState(() => _feedbackHelpful = false),
                icon: const Icon(Icons.thumb_down_outlined, size: 18),
                label: const Text('Not helpful'),
              ),
            ],
          ),
          if (_feedbackHelpful != null) ...[
            const SizedBox(height: AaraagateTokens.space1),
            Text(
              'Feedback stays on this screen; no question or rating was sent.',
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            if (_feedbackHelpful == false && widget.unitId != null && widget.onOpenSection != null)
              TextButton.icon(
                icon: const Icon(Icons.support_agent_rounded),
                label: const Text('Report in Helpdesk'),
                onPressed: () => widget.onOpenSection!('helpdesk'),
              ),
          ],
          // Only Helpdesk creates complaints; the Assistant may navigate there.
          if (_canOpenHelpdeskForComplaint && destination?.section != 'helpdesk') ...[
            const SizedBox(height: AaraagateTokens.space3),
            OutlinedButton.icon(
              onPressed: () => widget.onOpenSection!('helpdesk'),
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('Open Helpdesk'),
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
