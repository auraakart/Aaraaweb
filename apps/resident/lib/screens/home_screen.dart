import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../widgets/app_state_card.dart';
import 'sos_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.controller,
    required this.onOpenGate,
    required this.onOpenServices,
    required this.onOpenHelpdesk,
    required this.onOpenNotices,
    required this.onOpenBilling,
  });

  final ResidentDataController controller;
  final VoidCallback onOpenGate;
  final VoidCallback onOpenServices;
  final VoidCallback onOpenHelpdesk;
  final VoidCallback onOpenNotices;
  final VoidCallback onOpenBilling;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pending = controller.firstPendingAccess;
    final household = controller.households.isEmpty ? null : controller.households.first;
    final householdName = household?['displayName']?.toString() ?? 'Your home';

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            _HomeHero(
              householdName: householdName,
              noticeCount: controller.notices.length,
              onOpenNotices: onOpenNotices,
            ),
            const SizedBox(height: 24),
            Text('Needs your attention', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            if (controller.loading && controller.accessRequests.isEmpty)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Checking gate activity…', loading: true)
            else if (controller.accessError != null)
              AppStateCard(
                icon: Icons.error_outline_rounded,
                message: 'Access requests could not be loaded.',
                actionLabel: 'Retry',
                onAction: controller.load,
              )
            else if (pending == null)
              const AppStateCard(icon: Icons.check_circle_outline_rounded, message: 'Nothing needs approval right now.')
            else
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: theme.colorScheme.primaryContainer,
                            child: Icon(Icons.person_pin_circle_outlined, color: theme.colorScheme.onPrimaryContainer),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${pending['subjectName'] ?? 'Visitor'} is waiting', style: const TextStyle(fontWeight: FontWeight.w800)),
                                const SizedBox(height: 3),
                                Text('${pending['subjectType'] ?? 'VISITOR'}${pending['purpose'] == null ? '' : ' · ${pending['purpose']}'}'),
                              ],
                            ),
                          ),
                          const Text('Now', style: TextStyle(fontWeight: FontWeight.w700)),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(child: OutlinedButton(onPressed: () => controller.denyAccess(pending['id'].toString()), child: const Text('Deny'))),
                          const SizedBox(width: 10),
                          Expanded(child: FilledButton(onPressed: () => controller.approveAccess(pending['id'].toString()), child: const Text('Allow'))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            if (controller.notices.isNotEmpty) ...[
              const SizedBox(height: 16),
              Card(
                child: ListTile(
                  onTap: onOpenNotices,
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.primaryContainer,
                    foregroundColor: theme.colorScheme.onPrimaryContainer,
                    child: const Icon(Icons.campaign_outlined),
                  ),
                  title: Text(controller.notices.first['title']?.toString() ?? 'Society notice', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: const Text('Latest society update'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                ),
              ),
            ],
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                onTap: onOpenBilling,
                leading: CircleAvatar(
                  backgroundColor: theme.colorScheme.primaryContainer,
                  foregroundColor: theme.colorScheme.onPrimaryContainer,
                  child: const Icon(Icons.receipt_long_outlined),
                ),
                title: const Text('Maintenance & payments', style: TextStyle(fontWeight: FontWeight.w800)),
                subtitle: const Text('Dues and payments for your unit'),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
            ),
            const SizedBox(height: 24),
            Text('Quick actions', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) {
                final itemWidth = (constraints.maxWidth - 10) / 2;
                return Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    SizedBox(width: itemWidth, child: _QuickAction(icon: Icons.person_add_alt_1_rounded, label: 'Invite guest', onTap: onOpenGate)),
                    SizedBox(width: itemWidth, child: _QuickAction(icon: Icons.home_repair_service_rounded, label: 'Book service', onTap: onOpenServices)),
                    SizedBox(width: itemWidth, child: _QuickAction(icon: Icons.support_agent_rounded, label: 'Helpdesk', onTap: onOpenHelpdesk)),
                    SizedBox(
                      width: itemWidth,
                      child: _QuickAction(
                        icon: Icons.sos_rounded,
                        label: 'SOS',
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SosScreen(controller: controller))),
                        urgent: true,
                      ),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 24),
            Text('Today', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            if (controller.accessRequests.isEmpty)
              const AppStateCard(icon: Icons.shield_outlined, message: 'No access activity yet. New entries will appear here.')
            else
              for (final item in controller.accessRequests.take(3))
                _TimelineTile(
                  icon: _iconFor(item['subjectType']?.toString()),
                  title: item['subjectName']?.toString() ?? 'Access request',
                  subtitle: '${item['subjectType'] ?? 'ACCESS'} · ${item['status'] ?? ''}',
                  time: '',
                ),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(Icons.auto_awesome_rounded, color: theme.colorScheme.primary),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Ask Aaraagate', style: TextStyle(fontWeight: FontWeight.w800)),
                          SizedBox(height: 3),
                          Text('“My electrician is coming tomorrow at 11.”'),
                        ],
                      ),
                    ),
                    const Icon(Icons.arrow_forward_ios_rounded, size: 16),
                  ],
                ),
              ),
            ),
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
  const _HomeHero({required this.householdName, required this.noticeCount, required this.onOpenNotices});

  final String householdName;
  final int noticeCount;
  final VoidCallback onOpenNotices;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [scheme.primaryContainer, Colors.white],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outline.withOpacity(.55)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: scheme.primary,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.home_rounded, color: Colors.white),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Welcome home', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                const SizedBox(height: 3),
                Text(householdName, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -.3)),
              ],
            ),
          ),
          Badge(
            isLabelVisible: noticeCount > 0,
            label: Text(noticeCount.toString()),
            child: IconButton.filledTonal(onPressed: onOpenNotices, icon: const Icon(Icons.notifications_none_rounded)),
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap, this.urgent = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = urgent ? scheme.errorContainer : scheme.surface;
    final foreground = urgent ? scheme.error : scheme.primary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Ink(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 14),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: urgent ? scheme.error.withOpacity(.18) : scheme.outline.withOpacity(.55)),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 46),
          child: Row(
            children: [
              Icon(icon, color: foreground),
              const SizedBox(width: 10),
              Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800))),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimelineTile extends StatelessWidget {
  const _TimelineTile({required this.icon, required this.title, required this.subtitle, required this.time});
  final IconData icon;
  final String title;
  final String subtitle;
  final String time;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
          leading: CircleAvatar(backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest, child: Icon(icon)),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(subtitle),
          trailing: time.isEmpty ? null : Text(time, style: Theme.of(context).textTheme.labelMedium),
        ),
      ),
    );
  }
}
