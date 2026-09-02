import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../data/sos_repository_extension.dart';

class SosScreen extends StatefulWidget {
  const SosScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _incidents = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final incidents = await widget.controller.repository.sosIncidents();
      if (!mounted) return;
      setState(() => _incidents = incidents);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic>? get _activeIncident {
    for (final incident in _incidents) {
      final status = incident['status']?.toString();
      if (status == 'TRIGGERED' || status == 'ACKNOWLEDGED') return incident;
    }
    return null;
  }

  Future<void> _trigger() async {
    final unitId = widget.controller.primaryUnitId;
    if (unitId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No household unit is available for SOS.')));
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: Icon(Icons.sos_rounded, color: Theme.of(context).colorScheme.error, size: 40),
        title: const Text('Send emergency SOS?'),
        content: const Text('Use SOS only for an immediate emergency. Society operations and security will be alerted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('SEND SOS')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _submitting = true);
    try {
      await widget.controller.repository.triggerSos(unitId: unitId, message: 'Emergency SOS triggered from resident app');
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('SOS sent. Security has been notified.')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('SOS could not be sent: $e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancel(Map<String, dynamic> incident) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel active SOS?'),
        content: const Text('Cancel only if the emergency has ended or the SOS was sent accidentally.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep active')),
          FilledButton.tonal(onPressed: () => Navigator.pop(context, true), child: const Text('Cancel SOS')),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _submitting = true);
    try {
      await widget.controller.repository.cancelSos(incident['id'].toString(), note: 'Cancelled by resident');
      await _load();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final active = _activeIncident;
    return Scaffold(
      appBar: AppBar(title: const Text('Emergency SOS')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.health_and_safety_rounded, size: 48, color: active == null ? theme.colorScheme.error : theme.colorScheme.primary),
                    const SizedBox(height: 12),
                    Text(active == null ? 'Emergency assistance' : 'SOS is active', textAlign: TextAlign.center, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Text(
                      active == null ? 'Send an SOS to society operations and security when you need immediate help.' : 'Security has received your emergency request. Keep your phone available for follow-up.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 18),
                    if (active == null)
                      FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: theme.colorScheme.error, foregroundColor: theme.colorScheme.onError, padding: const EdgeInsets.symmetric(vertical: 18)),
                        onPressed: _submitting ? null : _trigger,
                        icon: const Icon(Icons.sos_rounded),
                        label: Text(_submitting ? 'SENDING…' : 'SEND SOS', style: const TextStyle(fontWeight: FontWeight.w900)),
                      )
                    else
                      OutlinedButton(onPressed: _submitting ? null : () => _cancel(active), child: const Text('Cancel active SOS')),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text('Recent SOS activity', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            if (_loading)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else if (_error != null)
              Card(child: ListTile(title: const Text('SOS history could not be loaded.'), subtitle: Text(_error!), trailing: TextButton(onPressed: _load, child: const Text('Retry'))))
            else if (_incidents.isEmpty)
              const Card(child: ListTile(leading: Icon(Icons.check_circle_outline_rounded), title: Text('No SOS incidents'), subtitle: Text('Your emergency activity will appear here.')))
            else
              for (final incident in _incidents)
                Card(
                  child: ListTile(
                    leading: CircleAvatar(child: Icon(_statusIcon(incident['status']?.toString()))),
                    title: Text(_statusLabel(incident['status']?.toString()), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text(incident['message']?.toString() ?? 'Emergency SOS'),
                  ),
                ),
            const SizedBox(height: 18),
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded),
                    SizedBox(width: 12),
                    Expanded(child: Text('AuraGate SOS supports society emergency response. For medical, police, or fire emergencies, also contact the appropriate local emergency service directly.')),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _statusLabel(String? status) => switch (status) {
    'TRIGGERED' => 'SOS sent',
    'ACKNOWLEDGED' => 'Security acknowledged',
    'RESOLVED' => 'Resolved',
    'CANCELLED' => 'Cancelled',
    _ => status?.replaceAll('_', ' ') ?? 'SOS update',
  };

  static IconData _statusIcon(String? status) => switch (status) {
    'TRIGGERED' => Icons.sos_rounded,
    'ACKNOWLEDGED' => Icons.visibility_rounded,
    'RESOLVED' => Icons.check_circle_rounded,
    'CANCELLED' => Icons.cancel_outlined,
    _ => Icons.notifications_active_outlined,
  };
}
