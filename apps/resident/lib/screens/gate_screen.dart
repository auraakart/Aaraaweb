import 'package:flutter/material.dart';

class GateScreen extends StatelessWidget {
  const GateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          Text('Gate & Access', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Invite, approve and track everyone entering your home.', style: theme.textTheme.bodyLarge),
          const SizedBox(height: 20),
          FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.add_rounded), label: const Text('Invite someone')),
          const SizedBox(height: 20),
          Row(children: [Expanded(child: _Metric(label: 'Waiting', value: '1')), const SizedBox(width: 10), Expanded(child: _Metric(label: 'Inside', value: '2')), const SizedBox(width: 10), Expanded(child: _Metric(label: 'Today', value: '7'))]),
          const SizedBox(height: 24),
          Text('Active access', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const _AccessCard(icon: Icons.person_outline, title: 'Ramesh Kumar', type: 'Visitor · Plumbing', status: 'Waiting approval', action: 'Review'),
          const SizedBox(height: 10),
          const _AccessCard(icon: Icons.local_shipping_outlined, title: 'Amazon delivery', type: 'Delivery', status: 'Valid until 7:30 PM', action: 'View'),
          const SizedBox(height: 10),
          const _AccessCard(icon: Icons.cleaning_services_outlined, title: 'Lakshmi', type: 'Domestic help', status: 'Inside since 8:15 AM', action: 'Track'),
          const SizedBox(height: 24),
          Text('Recent', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const Card(child: Column(children: [ListTile(leading: Icon(Icons.check_circle_outline), title: Text('Suresh · Electrician'), subtitle: Text('Checked out · 4:22 PM')), Divider(height: 1), ListTile(leading: Icon(Icons.check_circle_outline), title: Text('Ola cab'), subtitle: Text('Checked out · 2:10 PM'))])),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)), const SizedBox(height: 2), Text(label)])));
}

class _AccessCard extends StatelessWidget {
  const _AccessCard({required this.icon, required this.title, required this.type, required this.status, required this.action});
  final IconData icon;
  final String title;
  final String type;
  final String status;
  final String action;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [CircleAvatar(child: Icon(icon)), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), Text(type), const SizedBox(height: 4), Text(status, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w600))])), TextButton(onPressed: () {}, child: Text(action))])));
}
