import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../data/resident_home_highlights.dart';
import '../localization/aaraagate_strings.dart';
import '../theme/aaraagate_theme.dart';
import '../layout/resident_responsive_layout.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';
import 'sos_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.controller,
    this.societyLogoBytes,
    this.societyDisplayName,
    required this.showGate,
    required this.showStaff,
    required this.showServices,
    required this.showHelpdesk,
    required this.showNotices,
    required this.showBilling,
    required this.showAmenities,
    required this.showSos,
    required this.showAi,
    required this.onOpenStaff,
    required this.onOpenServices,
    required this.onOpenHelpdesk,
    required this.onOpenNotices,
    required this.onOpenBilling,
    required this.onOpenAmenities,
    required this.onOpenAi,
  });

  final ResidentDataController controller;
  final Uint8List? societyLogoBytes;
  final String? societyDisplayName;
  final bool showGate;
  final bool showStaff;
  final bool showServices;
  final bool showHelpdesk;
  final bool showNotices;
  final bool showBilling;
  final bool showAmenities;
  final bool showSos;
  final bool showAi;
  final VoidCallback onOpenStaff;
  final VoidCallback onOpenServices;
  final VoidCallback onOpenHelpdesk;
  final VoidCallback onOpenNotices;
  final VoidCallback onOpenBilling;
  final VoidCallback onOpenAmenities;
  final ValueChanged<String?> onOpenAi;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = AaraagateStrings.device();
    // Compact only at standard text sizes; generous layout stays available for accessibility.
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;
    final pending = controller.firstPendingAccess;
    final hasQuickActions = showStaff || showBilling || showAmenities || showHelpdesk;
    final highlights = ResidentHomeHighlights.build(
      invoices: showBilling ? controller.maintenanceInvoices : const [],
      payments: showBilling ? controller.maintenancePayments : const [],
      bookings: showServices ? controller.bookings : const [],
      notices: showNotices ? controller.notices : const [],
      tickets: showHelpdesk ? controller.helpdeskTickets : const [],
    );
    final actionableHighlights = highlights
        .where((item) => item.urgency != ResidentHomeUrgency.info)
        .toList(growable: false);
    final attentionCount = actionableHighlights.length + (pending != null ? 1 : 0);
    final attentionSummary = attentionCount == 0
        ? highlights.isEmpty
            ? 'Nothing needs your attention right now.'
            : 'No urgent follow-up. Recent activity is shown below.'
        : attentionCount == 1
            ? '1 item needs your attention.'
            : '$attentionCount items need your attention.';

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(
            compact ? AaraagateTokens.space4 : AaraagateTokens.pageGutter,
            AaraagateTokens.space3,
            compact ? AaraagateTokens.space4 : AaraagateTokens.pageGutter,
            compact ? AaraagateTokens.space6 : AaraagateTokens.space8,
          ),
          children: [
            if (societyLogoBytes != null) ...[
              Semantics(
                container: true,
                image: true,
                label: 'Logo of ${societyDisplayName ?? 'your society'}',
                child: ExcludeSemantics(
                  child: Row(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
                      child: Image.memory(
                        societyLogoBytes!, width: 52, height: 52, fit: BoxFit.contain,
                        errorBuilder: (context, error, stackTrace) =>
                          const Icon(Icons.apartment_rounded, size: 52),
                      ),
                    ),
                    const SizedBox(width: AaraagateTokens.space3),
                    Expanded(child: Text(
                      societyDisplayName ?? 'Your society',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium,
                    )),
                  ]),
                ),
              ),
              const SizedBox(height: AaraagateTokens.space4),
            ],
            if (showAi) ...[
              _AssistantEntryCard(
                summary: _assistantSummary(pending, highlights),
                onTap: () => onOpenAi(_assistantPrompt(pending, highlights)),
              ),
              SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
            ],
            if (hasQuickActions) ...[
              PremiumSectionHeader(
                title: strings.text('homeQuickActions'),
              ),
              SizedBox(height: compact ? AaraagateTokens.space2 : AaraagateTokens.space3),
              LayoutBuilder(
                builder: (context, constraints) {
                  final scale = MediaQuery.textScalerOf(context).scale(1);
                  // Localized scripts and longer labels need readable tiles,
                  // not four narrow English-sized icon captions.
                  final compactGrid = strings.languageCode == 'en' &&
                      residentCompactHomeQuickActionColumns(
                        maxWidth: constraints.maxWidth,
                        textScale: scale,
                      ) == 4;
                  final columns = compactGrid
                      ? 4
                      : constraints.maxWidth >= 720 && scale < 1.3
                          ? 4
                          : residentQuickActionColumns(maxWidth: constraints.maxWidth, textScale: scale);
                  final gap = compactGrid ? AaraagateTokens.space2 : AaraagateTokens.space3;
                  final itemWidth = (constraints.maxWidth - gap * (columns - 1)) / columns;
                  return Wrap(
                    key: const ValueKey('home-quick-actions'),
                    spacing: gap,
                    runSpacing: gap,
                    children: [
                      if (showStaff)
                        SizedBox(
                          width: itemWidth,
                          child: compactGrid ? _CompactHomeQuickAction(
                            icon: Icons.badge_outlined,
                            label: strings.text('homeStaff'),
                            onTap: onOpenStaff,
                          ) : PremiumQuickAction(icon: Icons.badge_outlined, label: strings.text('homeStaff'), onTap: onOpenStaff),
                        ),
                      if (showBilling)
                        SizedBox(
                          width: itemWidth,
                          child: compactGrid ? _CompactHomeQuickAction(
                            icon: Icons.receipt_long_outlined,
                            label: strings.text('homeBilling'),
                            onTap: onOpenBilling,
                          ) : PremiumQuickAction(icon: Icons.receipt_long_outlined, label: strings.text('homeBilling'), onTap: onOpenBilling),
                        ),
                      if (showAmenities)
                        SizedBox(
                          width: itemWidth,
                          child: compactGrid ? _CompactHomeQuickAction(
                            icon: Icons.sports_tennis_rounded,
                            label: strings.text('homeAmenities'),
                            onTap: onOpenAmenities,
                          ) : PremiumQuickAction(icon: Icons.sports_tennis_rounded, label: strings.text('homeAmenities'), onTap: onOpenAmenities),
                        ),
                      if (showHelpdesk)
                        SizedBox(
                          width: itemWidth,
                          child: compactGrid ? _CompactHomeQuickAction(
                            icon: Icons.support_agent_rounded,
                            label: strings.text('homeHelpdesk'),
                            onTap: onOpenHelpdesk,
                          ) : PremiumQuickAction(icon: Icons.support_agent_rounded, label: strings.text('homeHelpdesk'), onTap: onOpenHelpdesk),
                        ),
                    ],
                  );
                },
              ),
            ],
            if (controller.entitlementsError != null) ...[
              const SizedBox(height: AaraagateTokens.space4),
              AppStateCard(
                icon: Icons.sync_problem_outlined,
                message: controller.entitlementsError!,
                actionLabel: 'Retry',
                onAction: controller.load,
              ),
            ],
            if (showGate || highlights.isNotEmpty) ...[
              SizedBox(height: compact ? AaraagateTokens.space4 : AaraagateTokens.space6),
              Semantics(
                container: true,
                liveRegion: true,
                label: 'Action inbox. $attentionSummary',
                child: ExcludeSemantics(
                  child: PremiumSectionHeader(
                    title: 'Action inbox',
                    supportingText: attentionSummary,
                  ),
                ),
              ),
              SizedBox(height: compact ? AaraagateTokens.space2 : AaraagateTokens.space3),
              if (showGate && controller.loading && controller.accessRequests.isEmpty)
                const AppStateCard(
                  icon: Icons.sync_rounded,
                  message: 'Checking gate activity…',
                  loading: true,
                )
              else if (showGate && controller.accessError != null)
                AppStateCard(
                  icon: Icons.error_outline_rounded,
                  message: 'Access requests could not be loaded.',
                  actionLabel: 'Retry',
                  onAction: controller.load,
                )
              else if (showGate && pending != null)
                _PendingAccessCard(
                  key: ValueKey(pending['id']),
                  pending: pending,
                  onDeny: () async {
                    await controller.denyAccess(pending['id'].toString());
                  },
                  onAllow: () async {
                    await controller.approveAccess(pending['id'].toString());
                  },
                )
              else if (showGate && highlights.isEmpty)
                const _AllClearCard(),
              if (showGate && pending != null && highlights.isNotEmpty)
                SizedBox(height: compact ? AaraagateTokens.space2 : AaraagateTokens.space3),
              for (var i = 0; i < highlights.length; i++) ...[
                _HomeSummaryRow(
                  icon: _highlightIcon(highlights[i].kind),
                  title: highlights[i].title,
                  subtitle: highlights[i].subtitle,
                  urgency: highlights[i].urgency,
                  actionLabel: _highlightActionLabel(highlights[i].kind),
                  onTap: () {
                    switch (highlights[i].kind) {
                      case ResidentHomeHighlightKind.billing:
                        onOpenBilling();
                        break;
                      case ResidentHomeHighlightKind.helpdesk:
                        onOpenHelpdesk();
                        break;
                      case ResidentHomeHighlightKind.service:
                        onOpenServices();
                        break;
                      case ResidentHomeHighlightKind.notice:
                        onOpenNotices();
                        break;
                    }
                  },
                ),
                if (i < highlights.length - 1)
                  SizedBox(height: compact ? AaraagateTokens.space1 : AaraagateTokens.space2),
              ],
            ],
            // Empty Community and Gate history remain available in their tabs:
            // do not repeat large placeholder panels on the resident dashboard.
            if (showNotices && controller.notices.isNotEmpty) ...[
              SizedBox(height: compact ? AaraagateTokens.space4 : AaraagateTokens.space6),
              PremiumSectionHeader(
                title: 'Community',
                supportingText: controller.notices.isEmpty
                    ? 'Society notices and updates will appear here.'
                    : 'Latest from your society.',
                trailing: TextButton(
                  onPressed: onOpenNotices,
                  child: const Text('See all'),
                ),
              ),
              SizedBox(height: compact ? AaraagateTokens.space2 : AaraagateTokens.space3),
              _CommunityPreview(
                notice: controller.notices.first,
                onTap: onOpenNotices,
              ),
            ],
            if (showSos) ...[
              SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => SosScreen(controller: controller)),
                ),
                icon: const Icon(Icons.sos_rounded),
                label: const Text('Emergency SOS'),
              ),
            ],
            if (showGate && controller.accessRequests.isNotEmpty) ...[
              SizedBox(height: compact ? AaraagateTokens.space4 : AaraagateTokens.space6),
              const PremiumSectionHeader(title: 'Recent gate activity'),
              SizedBox(height: compact ? AaraagateTokens.space2 : AaraagateTokens.space3),
              PremiumSurface(
                  padding: EdgeInsets.zero,
                  color: theme.colorScheme.surface,
                  child: Column(
                    children: [
                      for (var i = 0; i < controller.accessRequests.take(3).length; i++) ...[
                        _TimelineTile(
                          icon: _iconFor(controller.accessRequests[i]['subjectType']?.toString()),
                          title: controller.accessRequests[i]['subjectName']?.toString() ?? 'Access request',
                          subtitle: '${controller.accessRequests[i]['subjectType'] ?? 'ACCESS'} · ${controller.accessRequests[i]['status'] ?? ''}',
                          time: '',
                        ),
                        if (i < controller.accessRequests.take(3).length - 1)
                          Divider(height: 1, indent: 64, color: theme.colorScheme.outlineVariant),
                      ],
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  static String _highlightActionLabel(ResidentHomeHighlightKind kind) {
    switch (kind) {
      case ResidentHomeHighlightKind.billing:
        return 'Open billing';
      case ResidentHomeHighlightKind.helpdesk:
        return 'Open helpdesk';
      case ResidentHomeHighlightKind.service:
        return 'Open service';
      case ResidentHomeHighlightKind.notice:
        return 'Read update';
    }
  }

  static String _assistantSummary(Map<String, dynamic>? pending, List<ResidentHomeHighlight> highlights) {
    if (pending != null) return 'A visitor is waiting. Ask what needs your attention before you decide.';
    if (highlights.isEmpty) return 'Ask about dues, staff, services, amenities or society updates.';
    switch (highlights.first.kind) {
      case ResidentHomeHighlightKind.billing:
        return 'You have a billing item that needs attention. Ask for the amount, due date and payment context.';
      case ResidentHomeHighlightKind.helpdesk:
        return 'You have an active helpdesk item. Ask for its latest status and next action.';
      case ResidentHomeHighlightKind.service:
        return 'You have an upcoming service. Ask for timing, provider and booking status.';
      case ResidentHomeHighlightKind.notice:
        return 'A society update needs attention. Ask for the important details and any action required.';
    }
  }

  static String? _assistantPrompt(Map<String, dynamic>? pending, List<ResidentHomeHighlight> highlights) {
    if (pending != null) return 'What do I need to know about the visitor waiting at the gate?';
    if (highlights.isEmpty) return null;
    switch (highlights.first.kind) {
      case ResidentHomeHighlightKind.billing:
        return 'What is my maintenance due and when should I pay it?';
      case ResidentHomeHighlightKind.helpdesk:
        return 'What is the latest status of my open helpdesk request?';
      case ResidentHomeHighlightKind.service:
        return 'What home service do I have coming up and what should I know?';
      case ResidentHomeHighlightKind.notice:
        return 'Summarize the society update that needs my attention.';
    }
  }

  static IconData _highlightIcon(ResidentHomeHighlightKind kind) {
    switch (kind) {
      case ResidentHomeHighlightKind.billing:
        return Icons.receipt_long_outlined;
      case ResidentHomeHighlightKind.helpdesk:
        return Icons.support_agent_rounded;
      case ResidentHomeHighlightKind.service:
        return Icons.home_repair_service_outlined;
      case ResidentHomeHighlightKind.notice:
        return Icons.campaign_outlined;
    }
  }

  static IconData _iconFor(String? type) {
    switch (type) {
      case 'DELIVERY':
        return Icons.local_shipping_outlined;
      case 'DOMESTIC_HELP':
        return Icons.cleaning_services_outlined;
      case 'CAB':
        return Icons.local_taxi_outlined;
      case 'SERVICE_PROVIDER':
        return Icons.home_repair_service_outlined;
      default:
        return Icons.person_outline_rounded;
    }
  }
}

// Compact dashboard-only layout. Shared PremiumQuickAction remains unchanged.
class _CompactHomeQuickAction extends StatelessWidget {
  const _CompactHomeQuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return PremiumSurface(
      onTap: onTap,
      semanticLabel: label,
      color: scheme.surfaceContainerLow,
      padding: const EdgeInsets.symmetric(
        horizontal: AaraagateTokens.space1,
        vertical: AaraagateTokens.space2,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 22, color: scheme.primary),
          const SizedBox(height: AaraagateTokens.space1),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _AssistantEntryCard extends StatelessWidget {
  const _AssistantEntryCard({required this.onTap, required this.summary});

  final VoidCallback onTap;
  final String summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;
    return PremiumSurface(
      onTap: onTap,
      semanticLabel: 'Open Aaraagate Assistant. $summary',
      color: scheme.surfaceContainerLow,
      padding: compact
          ? const EdgeInsets.symmetric(horizontal: AaraagateTokens.space3, vertical: AaraagateTokens.space2)
          : const EdgeInsets.all(AaraagateTokens.space4),
      child: Row(
        children: [
          if (MediaQuery.textScalerOf(context).scale(1) < 1.5) ...[
            Container(
              width: compact ? 34 : 48,
              height: compact ? 34 : 48,
              decoration: BoxDecoration(
                color: scheme.primary,
                borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
              ),
              child: Icon(Icons.auto_awesome_rounded, color: scheme.onPrimary),
            ),
            SizedBox(width: compact ? AaraagateTokens.space3 : AaraagateTokens.space4),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Ask Aaraagate Assistant', style: compact ? theme.textTheme.titleSmall : theme.textTheme.titleMedium),
                const SizedBox(height: AaraagateTokens.space1),
                Text(
                  summary,
                  maxLines: compact ? 1 : null,
                  overflow: compact ? TextOverflow.ellipsis : TextOverflow.clip,
                  style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: AaraagateTokens.space2),
          Icon(Icons.arrow_forward_rounded, color: scheme.primary),
        ],
      ),
    );
  }
}

class _PendingAccessCard extends StatefulWidget {
  const _PendingAccessCard({
    super.key,
    required this.pending,
    required this.onDeny,
    required this.onAllow,
  });

  final Map<String, dynamic> pending;
  final Future<void> Function() onDeny;
  final Future<void> Function() onAllow;

  @override
  State<_PendingAccessCard> createState() => _PendingAccessCardState();
}

class _PendingAccessCardState extends State<_PendingAccessCard> {
  bool _busy = false;
  String? _pendingAction;
  String? _error;

  Future<void> _submit(String decision, Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _pendingAction = decision;
      _error = null;
    });
    try {
      await action();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not update gate access. Check your connection and retry.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final name = widget.pending['subjectName']?.toString() ?? 'Visitor';
    final type = _displayLabel(widget.pending['subjectType']?.toString() ?? 'VISITOR');
    final purpose = widget.pending['purpose']?.toString();
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;

    return Semantics(
      container: true,
      label: '$name is waiting at the gate',
      child: PremiumSurface(
        elevated: true,
        color: scheme.surface,
        padding: EdgeInsets.all(compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PremiumIdentityHeader(
              icon: Icons.person_pin_circle_outlined,
              title: name,
              supportingText: purpose == null || purpose.isEmpty ? type : '$type · $purpose',
              status: const AaraagateStatusPill(label: 'Waiting', tone: AaraagateStatusTone.info),
            ),
            if (_error != null) ...[
              const SizedBox(height: AaraagateTokens.space3),
              Text(
                _error!,
                style: theme.textTheme.bodySmall?.copyWith(color: scheme.error),
              ),
            ],
            SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
            PremiumActionGroup(
              inlineMinWidth: 300,
              primary: FilledButton(
                onPressed: _busy ? null : () => _submit('allow', widget.onAllow),
                child: PremiumActionLabel(
                  label: 'Allow', icon: Icons.check_rounded,
                  busy: _busy && _pendingAction == 'allow',
                ),
              ),
              secondary: OutlinedButton(
                onPressed: _busy ? null : () => _submit('deny', widget.onDeny),
                child: PremiumActionLabel(label: 'Deny', busy: _busy && _pendingAction == 'deny'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AllClearCard extends StatelessWidget {
  const _AllClearCard();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PremiumSurface(
      padding: const EdgeInsets.symmetric(
        horizontal: AaraagateTokens.space3,
        vertical: AaraagateTokens.space2,
      ),
      child: Row(
        children: [
          Icon(Icons.check_circle_rounded, color: scheme.primary),
          const SizedBox(width: AaraagateTokens.space3),
          const Expanded(child: Text('All clear — nothing needs approval right now.')),
        ],
      ),
    );
  }
}

class _CommunityPreview extends StatelessWidget {
  const _CommunityPreview({required this.notice, required this.onTap});

  final Map<String, dynamic> notice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final title = notice['title']?.toString() ?? 'Community update';
    final body = notice['body']?.toString() ?? '';
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;

    return PremiumSurface(
      onTap: onTap,
      semanticLabel: title,
      color: scheme.surface,
      padding: EdgeInsets.all(compact ? AaraagateTokens.space3 : AaraagateTokens.space4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: compact ? 36 : 42,
            height: compact ? 36 : 42,
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
            ),
            child: Icon(Icons.campaign_outlined, color: scheme.onPrimaryContainer),
          ),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                ),
                if (body.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
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

class _HomeSummaryRow extends StatelessWidget {
  const _HomeSummaryRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    required this.urgency,
    required this.actionLabel,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final ResidentHomeUrgency urgency;
  final String actionLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final urgencyLabel = urgency == ResidentHomeUrgency.immediate ? 'Act now' : urgency == ResidentHomeUrgency.soon ? 'Soon' : 'Info';
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;
    return PremiumSurface(
      onTap: onTap,
      semanticLabel: '$urgencyLabel. $title. $subtitle. $actionLabel',
      color: scheme.surface,
      padding: EdgeInsets.symmetric(
        horizontal: compact ? AaraagateTokens.space3 : AaraagateTokens.space4,
        vertical: compact ? AaraagateTokens.space2 : AaraagateTokens.space3,
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          children: [
            Container(
              width: compact ? 36 : 42,
              height: compact ? 36 : 42,
              decoration: BoxDecoration(
                color: scheme.surfaceContainer,
                borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
              ),
              child: Icon(icon, color: scheme.primary),
            ),
            const SizedBox(width: AaraagateTokens.space3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PremiumSectionHeader(
                    title: title,
                    trailing: AaraagateStatusPill(
                      label: urgencyLabel,
                      tone: urgency == ResidentHomeUrgency.immediate ? AaraagateStatusTone.danger : urgency == ResidentHomeUrgency.soon ? AaraagateStatusTone.warning : AaraagateStatusTone.neutral,
                    ),
                  ),
                  const SizedBox(height: AaraagateTokens.space1),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  if (!compact) ...[
                    const SizedBox(height: AaraagateTokens.space2),
                    Text(actionLabel, style: theme.textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: AaraagateTokens.space2),
            Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _TimelineTile extends StatelessWidget {
  const _TimelineTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.time,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String time;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return ListTile(
      minTileHeight: 64,
      contentPadding: const EdgeInsets.symmetric(horizontal: AaraagateTokens.space4, vertical: 4),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: scheme.surfaceContainer,
          borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
        ),
        child: Icon(icon, size: 20, color: scheme.primary),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(_displayLabel(subtitle), maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: time.isEmpty ? null : Text(time, style: theme.textTheme.labelMedium),
    );
  }
}

String _displayLabel(String value) {
  return value
      .split(' · ')
      .map((part) => part
          .toLowerCase()
          .split('_')
          .map((word) => word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
          .join(' '))
      .join(' · ');
}
