import 'package:flutter/material.dart';

class CommunityScreen extends StatelessWidget {
  const CommunityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          Text('Community', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Notices, helpdesk and society updates in one place.'),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: FilledButton.tonalIcon(onPressed: () {}, icon: const Icon(Icons.support_agent_outlined), label: const Text('Helpdesk'))),
            const SizedBox(width: 10),
            Expanded(child: FilledButton.tonalIcon(onPressed: () {}, icon: const Icon(Icons.event_outlined), label: const Text('Events'))),
          ]),
          const SizedBox(height: 24),
          Text('Latest notices', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const Card(child: Column(children: [
            ListTile(leading: CircleAvatar(child: Icon(Icons.water_drop_outlined)), title: Text('Water shutdown tomorrow'), subtitle: Text('Block A · 10:00 AM–1:00 PM'), trailing: Icon(Icons.chevron_right)),
            Divider(height: 1),
            ListTile(leading: CircleAvatar(child: Icon(Icons.celebration_outlined)), title: Text('Ganesh Chaturthi gathering'), subtitle: Text('Clubhouse · Saturday 6:00 PM'), trailing: Icon(Icons.chevron_right)),
          ])),
          const SizedBox(height: 24),
          Text('Open helpdesk', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Card(child: ListTile(contentPadding: const EdgeInsets.all(16), leading: const CircleAvatar(child: Icon(Icons.build_outlined)), title: const Text('Lift noise near 12th floor', style: TextStyle(fontWeight: FontWeight.w800)), subtitle: const Text('Assigned to Facility Team · Updated 40 min ago'), trailing: Chip(label: const Text('In progress'), backgroundColor: theme.colorScheme.secondaryContainer))),
        ],
      ),
    );
  }
}
