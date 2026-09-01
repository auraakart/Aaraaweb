import 'package:flutter/material.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onOpenGate, required this.onOpenServices});

  final VoidCallback onOpenGate;
  final VoidCallback onOpenServices;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Good evening', style: theme.textTheme.bodyLarge),
                    const SizedBox(height: 2),
                    Text('A-1204 · Green Heights', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
              IconButton.filledTonal(onPressed: () {}, icon: const Icon(Icons.notifications_none_rounded)),
            ],
          ),
          const SizedBox(height: 24),
          Text('Needs your attention', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
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
                      const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Visitor waiting at Gate 2', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(height: 3), Text('Ramesh Kumar · Plumbing visit')])),
                      const Text('Now', style: TextStyle(fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(child: OutlinedButton(onPressed: () {}, child: const Text('Deny'))),
                      const SizedBox(width: 10),
                      Expanded(child: FilledButton(onPressed: () {}, child: const Text('Allow'))),
                    ],
                  ),
                ],
              ),
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
              Expanded(child: _QuickAction(icon: Icons.support_agent_rounded, label: 'Helpdesk', onTap: () {})),
              const SizedBox(width: 10),
              Expanded(child: _QuickAction(icon: Icons.sos_rounded, label: 'SOS', onTap: () {}, urgent: true)),
            ],
          ),
          const SizedBox(height: 24),
          Text('Today', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const _TimelineTile(icon: Icons.cleaning_services_outlined, title: 'Maid checked in', subtitle: 'Lakshmi · Gate 1', time: '8:15 AM'),
          const _TimelineTile(icon: Icons.inventory_2_outlined, title: 'Parcel received at gate', subtitle: 'Amazon · Leave with security', time: '12:40 PM'),
          const _TimelineTile(icon: Icons.campaign_outlined, title: 'Water shutdown notice', subtitle: 'Block A · Tomorrow 10 AM–1 PM', time: '3:05 PM'),
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Ink(
        padding: const EdgeInsets.symmetric(vertical: 15, horizontal: 6),
        decoration: BoxDecoration(color: urgent ? scheme.errorContainer : Colors.white, borderRadius: BorderRadius.circular(18)),
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
          trailing: Text(time, style: Theme.of(context).textTheme.labelMedium),
        ),
      ),
    );
  }
}
