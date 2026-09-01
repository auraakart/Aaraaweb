import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
                      request: request,
                      onApprove: request['status'] == 'PENDING' ? () => _approve(context, request) : null,
                      onDeny: request['status'] == 'PENDING' ? () => _deny(context, request) : null,
                      onCancel: request['status'] == 'APPROVED' ? () => _cancel(context, request) : null,
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
      builder: (dialogContext) => AlertDialog(
        title: const Text('Invite guest'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 10),
          TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
          const SizedBox(height: 10),
          TextField(controller: purpose, decoration: const InputDecoration(labelText: 'Purpose')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Create pass')),
        ],
      ),
    );
    if (submit != true || name.text.trim().isEmpty || !context.mounted) return;
    try {
      final pass = await controller.createGuest(
        name: name.text.trim(),
        phone: phone.text.trim().isEmpty ? null : phone.text.trim(),
        purpose: purpose.text.trim().isEmpty ? null : purpose.text.trim(),
      );
      if (!context.mounted) return;
      await _showPass(context, pass);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _approve(BuildContext context, Map<String, dynamic> request) async {
    try {
      final result = await controller.approveAccess(request['id'].toString());
      final rawRequest = result['request'];
      final credential = result['credential']?.toString();
      if (!context.mounted) return;
      if (rawRequest is Map && credential != null && credential.isNotEmpty) {
        await _showPass(context, {'request': Map<String, dynamic>.from(rawRequest), 'credential': credential});
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _deny(BuildContext context, Map<String, dynamic> request) async {
    try {
      await controller.denyAccess(request['id'].toString());
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _cancel(BuildContext context, Map<String, dynamic> request) async {
    try {
      await controller.cancelAccess(request['id'].toString());
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _showPass(BuildContext context, Map<String, dynamic> pass) async {
    final request = pass['request'];
    final visitor = request is Map ? request['subjectName']?.toString() ?? 'Visitor' : 'Visitor';
    final credential = pass['credential']?.toString() ?? '';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Visitor pass ready'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(visitor, style: Theme.of(dialogContext).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            const Text('Share this one-time access credential with your visitor. The guard can scan it from a QR or enter it manually.'),
            const SizedBox(height: 16),
            SelectableText(credential, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: credential));
              if (dialogContext.mounted) ScaffoldMessenger.of(dialogContext).showSnackBar(const SnackBar(content: Text('Pass copied')));
            },
            child: const Text('Copy pass'),
          ),
          FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Done')),
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
  const _AccessCard({required this.request, this.onApprove, this.onDeny, this.onCancel});
  final Map<String, dynamic> request;
  final VoidCallback? onApprove;
  final VoidCallback? onDeny;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final title = request['subjectName']?.toString() ?? 'Unknown';
    final type = _label(request['subjectType']?.toString());
    final status = _label(request['status']?.toString());
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const CircleAvatar(child: Icon(Icons.badge_outlined)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w800)), Text(type)])),
              Text(status, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w700)),
            ]),
            if (onApprove != null || onDeny != null || onCancel != null) ...[
              const SizedBox(height: 12),
              Row(children: [
                if (onDeny != null) Expanded(child: OutlinedButton(onPressed: onDeny, child: const Text('Deny'))),
                if (onDeny != null && onApprove != null) const SizedBox(width: 8),
                if (onApprove != null) Expanded(child: FilledButton(onPressed: onApprove, child: const Text('Allow'))),
                if (onCancel != null) Expanded(child: OutlinedButton(onPressed: onCancel, child: const Text('Cancel pass'))),
              ]),
            ],
          ],
        ),
      ),
    );
  }

  static String _label(String? value) => (value ?? '').toLowerCase().split('_').map((e) => e.isEmpty ? e : '${e[0].toUpperCase()}${e.substring(1)}').join(' ');
}

class _StateCard extends StatelessWidget {
  const _StateCard({required this.icon, required this.message, this.action, this.onTap});
  final IconData icon;
  final String message;
  final String? action;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(22), child: Column(children: [Icon(icon, size: 34), const SizedBox(height: 10), Text(message, textAlign: TextAlign.center), if (action != null) ...[const SizedBox(height: 10), TextButton(onPressed: onTap, child: Text(action!))]]));
}
