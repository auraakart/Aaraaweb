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
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Welcome home', style: theme.textTheme.bodyLarge),
                      const SizedBox(height: 2),
                      Text(householdName, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                Badge(
                  isLabelVisible: controller.notices.isNotEmpty,
                  label: Text(controller.notices.length.toString()),
                  child: IconButton.filledTonal(onPressed: onOpenNotices, icon: const Icon(Icons.notifications_none_rounded)),
                ),
              ],
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
                  leading: const CircleAvatar(child: Icon(Icons.campaign_outlined)),
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
                leading: const CircleAvatar(child: Icon(Icons.receipt_long_outlined)),
                title: const Text('Maintenance & payments', style: TextStyle(fontWeight: FontWeight.w800)),
                subtitle: const Text('Dues and payments for your unit'),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
            ),
            const SizedBox(height: 24),
            Text('Quick actions', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _QuickAction(icon: Icons.person_add_alt_1_rounded, label: 'Invite guest', onTap: onOpenGate)),
                const SizedBox(width: 10),
                Expanded(child: _QuickAction(icon: Icons.home_repair_service_rounded, label: 'Book service', onTap: onOpenServices)),
                const SizedBox(width: 10),
                Expanded(child: _QuickAction(icon: Icons.support_agent_rounded, label: 'Helpdesk', onTap: onOpenHelpdesk)),
                const SizedBox(width: 10),
                Expanded(
                  child: _QuickAction(
                    icon: Icons.sos_rounded,
                    label: 'SOS',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SosScreen(controller: controller))),
                    urgent: true,
                  ),
                ),
              ],
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
                    Icon(Icons.auto_awesome_rounded, color: theme.colorScheme.primary),
                    const SizedBox(width: 12),
                    const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Ask AuraGate', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(height: 3), Text('“My electrician is coming tomorrow at 11.”')])),
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
      case 'DELIVERY': return Icons.local_shipping_outlined;
      case 'DOMESTIC_HELP': return Icons.cleaning_services_outlined;
      case 'CAB': return Icons.local_taxi_outlined;
      case 'SERVICE_PROVIDER': return Icons.home_repair_service_outlined;
      default: return Icons.person_outline_rounded;
    }
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Ink(
        padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 6),
        decoration: BoxDecoration(color: urgent ? scheme.errorContainer : scheme.surface, borderRadius: BorderRadius.circular(18)),
        child: Column(children: [Icon(icon, color: urgent ? scheme.error : scheme.primary), const SizedBox(height: 8), Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))]),
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
