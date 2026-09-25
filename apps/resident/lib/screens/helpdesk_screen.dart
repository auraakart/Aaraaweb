import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../localization/aaraagate_strings.dart';
import '../theme/aaraagate_theme.dart';
import '../voice/resident_speech.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class HelpdeskScreen extends StatefulWidget {
  const HelpdeskScreen({super.key, required this.controller, this.speech});
  final ResidentDataController controller;
  final ResidentSpeech? speech;

  @override
  State<HelpdeskScreen> createState() => _HelpdeskScreenState();
}

class _HelpdeskScreenState extends State<HelpdeskScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _tickets = const [];
  late final ResidentSpeech speech;

  @override
  void initState() {
    super.initState();
    speech = widget.speech ?? DeviceResidentSpeech();
    _load();
  }

  @override
  void dispose() {
    speech.stop();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final tickets = await widget.controller.repository.helpdeskTickets();
      final selected = widget.controller.primaryUnitId;
      final scoped = selected == null
          ? tickets
          : tickets
              .where((ticket) => ticket['unitId']?.toString() == selected)
              .toList(growable: false);
      if (mounted) setState(() => _tickets = scoped);
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to load complaints. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeCount = _tickets.where((ticket) {
      final status = ticket['status']?.toString().toUpperCase();
      return status != 'RESOLVED' && status != 'CLOSED' && status != 'CANCELLED';
    }).length;

    return Scaffold(
      appBar: AppBar(title: const Text('Helpdesk')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newTicket,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New complaint'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space3,
            AaraagateTokens.pageGutter,
            104,
          ),
          children: [
            PremiumSectionHeader(
              title: 'Your complaints',
              supportingText: _tickets.isEmpty
                  ? 'Report a society issue and track every update from one place.'
                  : '$activeCount active · ${_tickets.length} total for this property.',
            ),
            const SizedBox(height: AaraagateTokens.space4),
            if (_loading && _tickets.isEmpty)
              const AppStateCard(
                icon: Icons.sync_rounded,
                message: 'Loading complaints…',
                loading: true,
              )
            else if (_error != null)
              AppStateCard(
                icon: Icons.error_outline_rounded,
                message: _error!,
                actionLabel: 'Try again',
                onAction: _load,
              )
            else if (_tickets.isEmpty)
              const AppStateCard(
                icon: Icons.task_alt_rounded,
                message: 'No complaints for this property. Report a society issue and track every update here.',
              )
            else
              for (final ticket in _tickets) ...[
                _TicketCard(ticket: ticket, onTap: () => _openTicket(ticket)),
                const SizedBox(height: AaraagateTokens.space3),
              ],
          ],
        ),
      ),
    );
  }

  Future<void> _newTicket() async {
    final unitId = widget.controller.primaryUnitId;
    if (unitId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select a property before creating a complaint.')),
      );
      return;
    }

    final title = TextEditingController();
    final description = TextEditingController();
    final category = TextEditingController();
    String priority = 'NORMAL';
    String? validationMessage;
    String? voiceStatus;
    bool submitting = false;
    bool listening = false;
    final languageCode = AaraagateStrings.device().languageCode;

    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setModalState) {
          final theme = Theme.of(sheetContext);
          return SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              AaraagateTokens.pageGutter,
              AaraagateTokens.space2,
              AaraagateTokens.pageGutter,
              MediaQuery.viewInsetsOf(sheetContext).bottom + AaraagateTokens.space6,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('New complaint', style: theme.textTheme.headlineSmall),
                const SizedBox(height: AaraagateTokens.space1),
                Text(
                  'Describe the issue clearly so your society team can route it faster.',
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: AaraagateTokens.space5),
                TextField(
                  controller: title,
                  decoration: const InputDecoration(labelText: 'Issue title'),
                  textInputAction: TextInputAction.next,
                  maxLength: 120,
                ),
                const SizedBox(height: AaraagateTokens.space2),
                OutlinedButton.icon(
                  onPressed: submitting || listening
                      ? null
                      : () async {
                          setModalState(() {
                            listening = true;
                            voiceStatus = ResidentVoiceCopy.text(languageCode, 'listening');
                            validationMessage = null;
                          });
                          final transcript = await speech.listenOnce(languageCode: languageCode);
                          if (!sheetContext.mounted) return;
                          if (transcript == null || transcript.trim().isEmpty) {
                            setModalState(() {
                              listening = false;
                              voiceStatus = ResidentVoiceCopy.text(languageCode, 'unavailable');
                            });
                            return;
                          }
                          final clean = transcript.trim();
                          description.text = clean;
                          if (title.text.trim().isEmpty) {
                            final first = clean.split(RegExp(r'[.!?\n]')).map((part) => part.trim()).firstWhere((part) => part.isNotEmpty, orElse: () => 'Resident request');
                            title.text = first.length <= 120 ? first : first.substring(0, 120);
                          }
                          setModalState(() {
                            listening = false;
                            voiceStatus = ResidentVoiceCopy.text(languageCode, 'review');
                          });
                        },
                  icon: Icon(listening ? Icons.hearing_rounded : Icons.mic_rounded),
                  label: Text(listening ? ResidentVoiceCopy.text(languageCode, 'listening') : ResidentVoiceCopy.text(languageCode, 'action')),
                ),
                if (voiceStatus != null) ...[
                  const SizedBox(height: AaraagateTokens.space2),
                  Text(voiceStatus!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                ],
                const SizedBox(height: AaraagateTokens.space2),
                TextField(
                  controller: description,
                  decoration: const InputDecoration(labelText: 'Describe the issue'),
                  minLines: 4,
                  maxLines: 6,
                  maxLength: 2000,
                ),
                const SizedBox(height: AaraagateTokens.space2),
                TextField(
                  controller: category,
                  decoration: const InputDecoration(labelText: 'Category (optional)'),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: AaraagateTokens.space3),
                DropdownButtonFormField<String>(
                  initialValue: priority,
                  decoration: const InputDecoration(labelText: 'Priority'),
                  items: const [
                    DropdownMenuItem(value: 'LOW', child: Text('Low')),
                    DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
                    DropdownMenuItem(value: 'HIGH', child: Text('High')),
                    DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
                  ],
                  onChanged: submitting
                      ? null
                      : (value) {
                          if (value != null) setModalState(() => priority = value);
                        },
                ),
                if (validationMessage != null) ...[
                  const SizedBox(height: AaraagateTokens.space3),
                  Text(
                    validationMessage!,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                  ),
                ],
                const SizedBox(height: AaraagateTokens.space5),
                FilledButton.icon(
                  onPressed: submitting
                      ? null
                      : () async {
                          final cleanTitle = title.text.trim();
                          final cleanDescription = description.text.trim();
                          if (cleanTitle.length < 3 || cleanDescription.length < 5) {
                            setModalState(() {
                              validationMessage = 'Add a clear title and a little more detail before submitting.';
                            });
                            return;
                          }
                          setModalState(() {
                            submitting = true;
                            validationMessage = null;
                          });
                          try {
                            await widget.controller.repository.createHelpdeskTicket(
                              unitId: unitId,
                              title: cleanTitle,
                              description: cleanDescription,
                              category: category.text.trim(),
                              priority: priority,
                            );
                            if (sheetContext.mounted) Navigator.pop(sheetContext, true);
                          } catch (_) {
                            if (sheetContext.mounted) {
                              setModalState(() {
                                submitting = false;
                                validationMessage = 'Complaint could not be submitted. Check your connection and retry.';
                              });
                            }
                          }
                        },
                  icon: submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send_rounded),
                  label: Text(submitting ? 'Submitting…' : 'Submit complaint'),
                ),
              ],
            ),
          );
        },
      ),
    );

    title.dispose();
    description.dispose();
    category.dispose();
    if (created == true) await _load();
  }

  Future<void> _openTicket(Map<String, dynamic> ticket) async {
    final selected = widget.controller.primaryUnitId;
    if (selected != null && ticket['unitId']?.toString() != selected) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('This complaint belongs to another property.')),
        );
      }
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _TicketDetail(controller: widget.controller, ticket: ticket),
      ),
    );
    await _load();
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.onTap});
  final Map<String, dynamic> ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = ticket['status']?.toString() ?? 'OPEN';
    final priority = ticket['priority']?.toString() ?? 'NORMAL';
    final category = ticket['category']?.toString().trim() ?? '';
    final sla = ticket['computedSlaState']?.toString() ?? ticket['slaState']?.toString() ?? 'UNTRACKED';
    final building = ticket['buildingName']?.toString();
    final unit = ticket['unitNumber']?.toString();

    return PremiumSurface(
      onTap: onTap,
      semanticLabel: 'Open complaint ${ticket['title'] ?? 'Complaint'}, ${_displayLabel(status)}',
      color: scheme.surfaceContainerLow,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: AaraagateTokens.iconContainer,
            height: AaraagateTokens.iconContainer,
            decoration: BoxDecoration(
              color: _priorityTone(priority) == AaraagateStatusTone.danger
                  ? scheme.errorContainer
                  : scheme.primaryContainer,
              borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
            ),
            child: Icon(
              Icons.support_agent_rounded,
              color: _priorityTone(priority) == AaraagateStatusTone.danger
                  ? scheme.onErrorContainer
                  : scheme.onPrimaryContainer,
            ),
          ),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(ticket['title']?.toString() ?? 'Complaint', style: theme.textTheme.titleMedium),
                const SizedBox(height: AaraagateTokens.space2),
                Wrap(
                  spacing: AaraagateTokens.space2,
                  runSpacing: AaraagateTokens.space2,
                  children: [
                    AaraagateStatusPill(label: _displayLabel(status), tone: _statusTone(status)),
                    if (priority != 'NORMAL')
                      AaraagateStatusPill(label: _displayLabel(priority), tone: _priorityTone(priority)),
                    if (category.isNotEmpty)
                      AaraagateStatusPill(label: category, tone: AaraagateStatusTone.neutral),
                  ],
                ),
                if (building != null || unit != null) ...[
                  const SizedBox(height: AaraagateTokens.space2),
                  Text(
                    [building, unit].where((value) => value != null && value.trim().isNotEmpty).join(' · '),
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
                const SizedBox(height: AaraagateTokens.space2),
                AaraagateStatusPill(label: 'SLA ${_displayLabel(sla)}', tone: _slaTone(sla)),
              ],
            ),
          ),
          const SizedBox(width: AaraagateTokens.space2),
          Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
        ],
      ),
    );
  }
}

class _TicketDetail extends StatefulWidget {
  const _TicketDetail({required this.controller, required this.ticket});
  final ResidentDataController controller;
  final Map<String, dynamic> ticket;

  @override
  State<_TicketDetail> createState() => _TicketDetailState();
}

class _TicketDetailState extends State<_TicketDetail> {
  bool loading = true;
  bool submittingComment = false;
  String? activityError;
  String? commentError;
  List<Map<String, dynamic>> activities = const [];
  final comment = TextEditingController();

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (mounted) {
      setState(() {
        loading = true;
        activityError = null;
      });
    }
    try {
      final result = await widget.controller.repository.helpdeskActivities(widget.ticket['id'].toString());
      if (mounted) setState(() => activities = result);
    } catch (_) {
      if (mounted) setState(() => activityError = 'Complaint activity could not be loaded.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }

  Future<void> _sendComment() async {
    final selected = widget.controller.primaryUnitId;
    if (selected != null && widget.ticket['unitId']?.toString() != selected) return;
    final message = comment.text.trim();
    if (message.isEmpty || submittingComment) return;

    setState(() {
      submittingComment = true;
      commentError = null;
    });
    try {
      await widget.controller.repository.addHelpdeskComment(widget.ticket['id'].toString(), message);
      comment.clear();
      await load();
    } catch (_) {
      if (mounted) setState(() => commentError = 'Comment could not be sent. Please retry.');
    } finally {
      if (mounted) setState(() => submittingComment = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = widget.ticket['status']?.toString() ?? 'OPEN';
    final priority = widget.ticket['priority']?.toString() ?? 'NORMAL';
    final sla = widget.ticket['computedSlaState']?.toString() ?? widget.ticket['slaState']?.toString() ?? 'UNTRACKED';
    final building = widget.ticket['buildingName']?.toString();
    final unit = widget.ticket['unitNumber']?.toString();
    final nextAction = _ticketNextAction(widget.ticket);
    final resolutionCode = widget.ticket['resolutionCode']?.toString();
    final closureCode = widget.ticket['closureCode']?.toString();

    return Scaffold(
      appBar: AppBar(title: const Text('Complaint details')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AaraagateTokens.pageGutter,
          AaraagateTokens.space3,
          AaraagateTokens.pageGutter,
          AaraagateTokens.space8,
        ),
        children: [
          PremiumSurface(
            color: scheme.surface,
            elevated: true,
            padding: const EdgeInsets.all(AaraagateTokens.space5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.ticket['title']?.toString() ?? 'Complaint', style: theme.textTheme.headlineSmall),
                const SizedBox(height: AaraagateTokens.space2),
                Wrap(
                  spacing: AaraagateTokens.space2,
                  runSpacing: AaraagateTokens.space2,
                  children: [
                    AaraagateStatusPill(label: _displayLabel(status), tone: _statusTone(status)),
                    AaraagateStatusPill(label: _displayLabel(priority), tone: _priorityTone(priority)),
                  ],
                ),
                if (building != null || unit != null) ...[
                  const SizedBox(height: AaraagateTokens.space3),
                  Text(
                    [building, unit].where((value) => value != null && value.trim().isNotEmpty).join(' · '),
                    style: theme.textTheme.titleSmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
                const SizedBox(height: AaraagateTokens.space3),
                AaraagateStatusPill(label: 'SLA ${_displayLabel(sla)}', tone: _slaTone(sla)),
                if ((widget.ticket['description']?.toString() ?? '').isNotEmpty) ...[
                  const SizedBox(height: AaraagateTokens.space4),
                  Text(
                    widget.ticket['description'].toString(),
                    style: theme.textTheme.bodyLarge?.copyWith(height: 1.5),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AaraagateTokens.space6),
          const PremiumSectionHeader(
            title: 'Service recovery',
            supportingText: 'Current target dates and what to expect next.',
          ),
          const SizedBox(height: AaraagateTokens.space3),
          PremiumSurface(
            color: scheme.surfaceContainerLow,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('What happens next', style: theme.textTheme.titleMedium),
                const SizedBox(height: AaraagateTokens.space2),
                Text(nextAction, style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                const SizedBox(height: AaraagateTokens.space4),
                _RecoveryRow(label: 'First response target', value: _formatTarget(widget.ticket['firstResponseDueAt'])),
                const SizedBox(height: AaraagateTokens.space2),
                _RecoveryRow(label: 'Resolution target', value: _formatTarget(widget.ticket['resolutionDueAt'])),
                if (resolutionCode != null || closureCode != null) ...[
                  const SizedBox(height: AaraagateTokens.space4),
                  Text('Resolution evidence', style: theme.textTheme.titleSmall),
                  const SizedBox(height: AaraagateTokens.space2),
                  if (resolutionCode != null) _RecoveryRow(label: 'Resolution code', value: _displayLabel(resolutionCode)),
                  if (closureCode != null) ...[
                    if (resolutionCode != null) const SizedBox(height: AaraagateTokens.space2),
                    _RecoveryRow(label: 'Closure code', value: _displayLabel(closureCode)),
                  ],
                ],
              ],
            ),
          ),
          const SizedBox(height: AaraagateTokens.space6),
          const PremiumSectionHeader(
            title: 'Activity',
            supportingText: 'Updates from your society team appear here in order.',
          ),
          const SizedBox(height: AaraagateTokens.space3),
          if (loading)
            const AppStateCard(
              icon: Icons.sync_rounded,
              message: 'Loading complaint activity…',
              loading: true,
            )
          else if (activityError != null)
            AppStateCard(
              icon: Icons.error_outline_rounded,
              message: activityError!,
              actionLabel: 'Retry',
              onAction: load,
            )
          else if (activities.isEmpty)
            const AppStateCard(icon: Icons.history_rounded, message: 'No complaint activity yet.')
          else
            for (final item in activities) ...[
              _ActivityRow(item: item),
              const SizedBox(height: AaraagateTokens.space2),
            ],
          const SizedBox(height: AaraagateTokens.space6),
          const PremiumSectionHeader(
            title: 'Add a comment',
            supportingText: 'Keep additional details in the same complaint thread.',
          ),
          const SizedBox(height: AaraagateTokens.space3),
          TextField(
            controller: comment,
            decoration: const InputDecoration(labelText: 'Comment'),
            maxLength: 1000,
            minLines: 2,
            maxLines: 4,
          ),
          if (commentError != null) ...[
            const SizedBox(height: AaraagateTokens.space1),
            Text(commentError!, style: theme.textTheme.bodySmall?.copyWith(color: scheme.error)),
          ],
          const SizedBox(height: AaraagateTokens.space3),
          FilledButton.icon(
            onPressed: submittingComment ? null : _sendComment,
            icon: submittingComment
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded),
            label: Text(submittingComment ? 'Sending…' : 'Send comment'),
          ),
        ],
      ),
    );
  }
}

class _RecoveryRow extends StatelessWidget {
  const _RecoveryRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
        const SizedBox(width: AaraagateTokens.space3),
        Flexible(child: Text(value, textAlign: TextAlign.right, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700))),
      ],
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final message = item['message']?.toString().trim();
    final fallback = item['type']?.toString().replaceAll('_', ' ') ?? 'Update';
    final metadata = [item['actorName'], item['toStatus']]
        .where((value) => value != null && value.toString().trim().isNotEmpty)
        .map((value) => _displayLabel(value.toString()))
        .join(' · ');

    return PremiumSurface(
      padding: const EdgeInsets.all(AaraagateTokens.space3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
            ),
            child: Icon(Icons.history_rounded, color: scheme.onPrimaryContainer, size: 20),
          ),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(message?.isNotEmpty == true ? message! : _displayLabel(fallback), style: theme.textTheme.bodyMedium),
                if (metadata.isNotEmpty) ...[
                  const SizedBox(height: AaraagateTokens.space1),
                  Text(metadata, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _ticketNextAction(Map<String, dynamic> ticket) {
  final status = ticket['status']?.toString().toUpperCase() ?? 'OPEN';
  final sla = ticket['computedSlaState']?.toString().toUpperCase() ?? ticket['slaState']?.toString().toUpperCase() ?? 'UNTRACKED';
  if (status == 'CLOSED') return 'This complaint is closed. The activity timeline keeps the recorded resolution and any reopen history.';
  if (status == 'RESOLVED') return 'The society team has marked this resolved. Review the recorded resolution and add a comment if more context is needed.';
  if (sla == 'RESOLUTION_BREACHED') return 'The resolution target has passed. The society team can review or escalate the ticket under its SLA process.';
  if (sla == 'RESPONSE_BREACHED') return 'The first-response target has passed. Your complaint remains active and visible to the society helpdesk team.';
  if (status == 'IN_PROGRESS') return 'The society team is working on this complaint. Add any new details in the same thread.';
  if (sla == 'UNTRACKED') return 'Your complaint is open. A service target may appear after the society applies its helpdesk SLA policy.';
  return 'Your complaint is open and currently within its configured service target.';
}

String _formatTarget(dynamic raw) {
  final date = DateTime.tryParse(raw?.toString() ?? '');
  if (date == null) return 'Not set';
  final local = date.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day/$month/${local.year} · $hour:$minute';
}

AaraagateStatusTone _slaTone(String state) {
  switch (state.toUpperCase()) {
    case 'MET':
      return AaraagateStatusTone.success;
    case 'RESPONSE_BREACHED':
    case 'RESOLUTION_BREACHED':
      return AaraagateStatusTone.danger;
    case 'ON_TRACK':
      return AaraagateStatusTone.info;
    default:
      return AaraagateStatusTone.neutral;
  }
}

AaraagateStatusTone _statusTone(String status) {
  switch (status.toUpperCase()) {
    case 'RESOLVED':
    case 'CLOSED':
      return AaraagateStatusTone.success;
    case 'IN_PROGRESS':
    case 'ASSIGNED':
      return AaraagateStatusTone.info;
    case 'CANCELLED':
    case 'REJECTED':
      return AaraagateStatusTone.danger;
    default:
      return AaraagateStatusTone.warning;
  }
}

AaraagateStatusTone _priorityTone(String priority) {
  switch (priority.toUpperCase()) {
    case 'URGENT':
      return AaraagateStatusTone.danger;
    case 'HIGH':
      return AaraagateStatusTone.warning;
    case 'LOW':
      return AaraagateStatusTone.neutral;
    default:
      return AaraagateStatusTone.info;
  }
}

String _displayLabel(String raw) => raw
    .trim()
    .toLowerCase()
    .split('_')
    .where((part) => part.isNotEmpty)
    .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
    .join(' ');
