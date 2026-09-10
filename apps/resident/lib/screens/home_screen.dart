import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import 'sos_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.controller,
    required this.showGate,
    required this.showServices,
    required this.showHelpdesk,
    required this.showNotices,
    required this.showBilling,
    required this.showAmenities,
    required this.showSos,
    required this.onOpenGate,
    required this.onOpenServices,
    required this.onOpenHelpdesk,
    required this.onOpenNotices,
    required this.onOpenBilling,
    required this.onOpenAmenities,
  });

  final ResidentDataController controller;
  final bool showGate;
  final bool showServices;
  final bool showHelpdesk;
  final bool showNotices;
  final bool showBilling;
  final bool showAmenities;
  final bool showSos;
  final VoidCallback onOpenGate;
  final VoidCallback onOpenServices;
  final VoidCallback onOpenHelpdesk;
  final VoidCallback onOpenNotices;
  final VoidCallback onOpenBilling;
  final VoidCallback onOpenAmenities;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pending = controller.firstPendingAccess;
    final household = controller.activeHousehold;
    final householdName = household?['displayName']?.toString() ?? 'Your home';
    final hasQuickActions = showGate || showServices || showAmenities || showHelpdesk || showSos;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.space5,
            AaraagateTokens.space3,
            AaraagateTokens.space5,
            28,
          ),
          children: [
            _HomeHero(
              householdName: householdName,
              noticeCount: showNotices ? controller.notices.length : 0,
              showNotices: showNotices,
              onOpenNotices: onOpenNotices,
            ),
            if (controller.entitlementsError != null) ...[
              const SizedBox(height: AaraagateTokens.space4),
              AppStateCard(
                icon: Icons.sync_problem_outlined,
                message: controller.entitlementsError!,
                actionLabel: 'Retry',
                onAction: controller.load,
              ),
            ],
            if (showGate) ...[
              const SizedBox(height: AaraagateTokens.space6),
              _SectionHeading(
                title: 'Needs your attention',
                supportingText: pending == null ? null : 'A gate response is waiting for you',
              ),
              const SizedBox(height: AaraagateTokens.space3),
              if (controller.loading && controller.accessRequests.isEmpty)
                const AppStateCard(
                  icon: Icons.sync_rounded,
                  message: 'Checking gate activity…',
                  loading: true,
                )
              else if (controller.accessError != null)
                AppStateCard(
                  icon: Icons.error_outline_rounded,
                  message: 'Access requests could not be loaded.',
                  actionLabel: 'Retry',
                  onAction: controller.load,
                )
              else if (pending == null)
                const _AllClearCard()
              else
                _PendingAccessCard(
                  pending: pending,
                  onDeny: () => controller.denyAccess(pending['id'].toString()),
                  onAllow: () => controller.approveAccess(pending['id'].toString()),
                ),
            ],
            if (hasQuickActions) ...[
              const SizedBox(height: AaraagateTokens.space6),
              const _SectionHeading(title: 'Quick actions'),
              const SizedBox(height: AaraagateTokens.space3),
              LayoutBuilder(
                builder: (context, constraints) {
                  final itemWidth = (constraints.maxWidth - AaraagateTokens.space3) / 2;
                  return Wrap(
                    spacing: AaraagateTokens.space3,
                    runSpacing: AaraagateTokens.space3,
                    children: [
                      if (showGate)
                        SizedBox(
                          width: itemWidth,
                          child: _QuickAction(
                            icon: Icons.person_add_alt_1_rounded,
                            label: 'Invite guest',
                            onTap: onOpenGate,
                          ),
                        ),
                      if (showServices)
                        SizedBox(
                          width: itemWidth,
                          child: _QuickAction(
                            icon: Icons.home_repair_service_rounded,
                            label: 'Book service',
                            onTap: onOpenServices,
                          ),
                        ),
                      if (showAmenities)
                        SizedBox(
                          width: itemWidth,
                          child: _QuickAction(
                            icon: Icons.sports_tennis_rounded,
                            label: 'Amenities',
                            onTap: onOpenAmenities,
                          ),
                        ),
                      if (showHelpdesk)
                        SizedBox(
                          width: itemWidth,
                          child: _QuickAction(
                            icon: Icons.support_agent_rounded,
                            label: 'Helpdesk',
                            onTap: onOpenHelpdesk,
                          ),
                        ),
                      if (showSos)
                        SizedBox(
                          width: itemWidth,
                          child: _QuickAction(
                            icon: Icons.sos_rounded,
                            label: 'SOS',
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => SosScreen(controller: controller)),
                            ),
                            urgent: true,
                          ),
                        ),
                    ],
                  );
                },
              ),
            ],
            if (showNotices || showBilling) ...[
              const SizedBox(height: AaraagateTokens.space6),
              const _SectionHeading(title: 'For your home'),
              const SizedBox(height: AaraagateTokens.space3),
              if (showNotices && controller.notices.isNotEmpty)
                _HomeSummaryRow(
                  icon: Icons.campaign_outlined,
                  title: controller.notices.first['title']?.toString() ?? 'Society notice',
                  subtitle: 'Latest society update',
                  onTap: onOpenNotices,
                ),
              if (showNotices && controller.notices.isNotEmpty && showBilling)
                const SizedBox(height: AaraagateTokens.space2),
              if (showBilling)
                _HomeSummaryRow(
                  icon: Icons.receipt_long_outlined,
                  title: 'Maintenance & payments',
                  subtitle: 'Dues and payment history for your unit',
                  onTap: onOpenBilling,
                ),
            ],
            if (showGate) ...[
              const SizedBox(height: AaraagateTokens.space6),
              const _SectionHeading(title: 'Today'),
              const SizedBox(height: AaraagateTokens.space3),
              if (controller.accessRequests.isEmpty)
                const AppStateCard(
                  icon: Icons.shield_outlined,
                  message: 'No access activity yet. New entries will appear here.',
                )
              else
                Container(
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surface,
                    borderRadius: BorderRadius.circular(AaraagateTokens.radiusCard),
                  ),
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

class _HomeHero extends StatelessWidget {
  const _HomeHero({
    required this.householdName,
    required this.noticeCount,
    required this.showNotices,
    required this.onOpenNotices,
  });

  final String householdName;
  final int noticeCount;
  final bool showNotices;
  final VoidCallback onOpenNotices;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.all(AaraagateTokens.space5),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [scheme.primaryContainer.withOpacity(.78), scheme.surface],
        ),
        borderRadius: BorderRadius.circular(AaraagateTokens.radiusSheet),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: scheme.primary,
              borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
            ),
            child: Icon(Icons.home_rounded, color: scheme.onPrimary),
          ),
          const SizedBox(width: AaraagateTokens.space4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Welcome home',
                  style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: AaraagateTokens.space1),
                Text(householdName, style: theme.textTheme.titleLarge),
              ],
            ),
          ),
          if (showNotices)
            Semantics(
              button: true,
              label: noticeCount > 0 ? '$noticeCount society notices' : 'Society notices',
              child: Badge(
                isLabelVisible: noticeCount > 0,
                label: Text(noticeCount.toString()),
                child: IconButton.filledTonal(
                  tooltip: 'Notices',
                  onPressed: onOpenNotices,
                  icon: const Icon(Icons.notifications_none_rounded),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, this.supportingText});

  final String title;
  final String? supportingText;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.titleMedium),
        if (supportingText != null) ...[
          const SizedBox(height: 2),
          Text(
            supportingText!,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}

class _PendingAccessCard extends StatelessWidget {
  const _PendingAccessCard({
    required this.pending,
    required this.onDeny,
    required this.onAllow,
  });

  final Map<String, dynamic> pending;
  final VoidCallback onDeny;
  final VoidCallback onAllow;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final name = pending['subjectName']?.toString() ?? 'Visitor';
    final type = _displayLabel(pending['subjectType']?.toString() ?? 'VISITOR');
    final purpose = pending['purpose']?.toString();

    return Semantics(
      container: true,
      label: '$name is waiting at the gate',
      child: Card(
        elevation: 2,
        shadowColor: Colors.black.withOpacity(.08),
        child: Padding(
          padding: const EdgeInsets.all(AaraagateTokens.space5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
                    ),
                    child: Icon(Icons.person_pin_circle_outlined, color: scheme.onPrimaryContainer),
                  ),
                  const SizedBox(width: AaraagateTokens.space4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: theme.textTheme.titleMedium),
                        const SizedBox(height: 2),
                        Text(
                          purpose == null || purpose.isEmpty ? type : '$type · $purpose',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Now',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: scheme.onPrimaryContainer,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AaraagateTokens.space5),
              Row(
                children: [
                  Expanded(child: OutlinedButton(onPressed: onDeny, child: const Text('Deny'))),
                  const SizedBox(width: AaraagateTokens.space3),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: onAllow,
                      icon: const Icon(Icons.check_rounded),
                      label: const Text('Allow'),
                    ),
                  ),
                ],
              ),
            ],
          ),
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
    return Container(
      padding: const EdgeInsets.all(AaraagateTokens.space4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AaraagateTokens.radiusCard),
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

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.urgent = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = urgent ? scheme.errorContainer.withOpacity(.65) : scheme.surface;
    final foreground = urgent ? scheme.error : scheme.primary;

    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 72),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                vertical: AaraagateTokens.space4,
                horizontal: AaraagateTokens.space4,
              ),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: foreground.withOpacity(.10),
                      borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
                    ),
                    child: Icon(icon, color: foreground, size: 21),
                  ),
                  const SizedBox(width: AaraagateTokens.space3),
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
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
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Material(
      color: scheme.surface,
      borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 72),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
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
                      Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AaraagateTokens.space2),
                Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
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
