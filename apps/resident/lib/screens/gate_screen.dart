import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';

class GateScreen extends StatelessWidget {
  const GateScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final waiting = controller.accessRequests.where((e) => e['status'] == 'PENDING').length;
    final inside = controller.accessRequests.where((e) => e['status'] == 'CHECKED_IN').length;
    final today = controller.accessRequests.length;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Text('Gate & Access', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('Invite, approve and track everyone entering your home.', style: theme.textTheme.bodyLarge),
            const SizedBox(height: 20),
            FilledButton.icon(onPressed: () => _invite(context), icon: const Icon(Icons.add_rounded), label: const Text('Invite someone')),
            const SizedBox(height: 20),
            Row(children: [
              Expanded(child: _Metric(label: 'Waiting', value: '$waiting')),
              const SizedBox(width: 10),
              Expanded(child: _Metric(label: 'Inside', value: '$inside')),
              const SizedBox(width: 10),
              Expanded(child: _Metric(label: 'Total', value: '$today')),
            ]),
            const SizedBox(height: 24),
            Text('Access activity', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            if (controller.loading && controller.accessRequests.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (controller.accessError != null)
              _StateCard(icon: Icons.cloud_off_outlined, message: 'Could not load access activity.', action: 'Retry', onTap: controller.load)
            else if (controller.accessRequests.isEmpty)
              const _StateCard(icon: Icons.shield_outlined, message: 'No access requests yet. Invite a guest when you need one.')
            else
              ...controller.accessRequests.map((request) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _AccessCard(
                      title: request['subjectName']?.toString() ?? 'Unknown',
                      type: _label(request['subjectType']?.toString()),
                      status: _label(request['status']?.toString()),
                    ),
                  )),
          ],
        ),
      ),
    );
  }

  Future<void> _invite(BuildContext context) async {
    final name = TextEditingController();
    final phone = TextEditingController();
    final purpose = TextEditingController();
    final submit = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Invite guest'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 10),
          TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
          const SizedBox(height: 10),
          TextField(controller: purpose, decoration: const InputDecoration(labelText: 'Purpose')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
        ],
      ),
    );
    if (submit != true || name.text.trim().isEmpty) return;
    try {
      await controller.createGuest(name: name.text.trim(), phone: phone.text.trim().isEmpty ? null : phone.text.trim(), purpose: purpose.text.trim().isEmpty ? null : purpose.text.trim());
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  static String _label(String? value) => (value ?? '').toLowerCase().split('_').map((e) => e.isEmpty ? e : '${e[0].toUpperCase()}${e.substring(1)}').join(' ');
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)), const SizedBox(height: 2), Text(label)])));
}

class _AccessCard extends StatelessWidget {
  const _AccessCard({required this.title, required this.type, required this.status});
  final String title;
  final String type;
  final String status;
  @override
  Widget build(BuildContext context) => Card(child: ListTile(contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8), leading: const CircleAvatar(child: Icon(Icons.badge_outlined)), title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text(type), trailing: Text(status, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w700))));
}

class _StateCard extends StatelessWidget {
  const _StateCard({required this.icon, required this.message, this.action, this.onTap});
  final IconData icon;
  final String message;
  final String? action;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(22), child: Column(children: [Icon(icon, size: 34), const SizedBox(height: 10), Text(message, textAlign: TextAlign.center), if (action != null) ...[const SizedBox(height: 10), TextButton(onPressed: onTap, child: Text(action!))]])));
}
