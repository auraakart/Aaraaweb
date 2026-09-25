import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../data/resident_data_controller.dart';
import '../data/sos_repository_extension.dart';
import '../data/models/resident_sos_incident.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

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
  List<ResidentSosIncident> _incidents = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final unitId = widget.controller.primaryUnitId;
    if (unitId == null) {
      if (mounted) {
        setState(() {
          _incidents = const [];
          _loading = false;
        });
      }
      return;
    }
    try {
      final incidents = await widget.controller.repository.sosIncidents();
      final scoped = incidents.where((incident) => incident.unitId == unitId).toList(growable: false);
      if (!mounted) return;
      setState(() => _incidents = scoped);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  ResidentSosIncident? get _activeIncident {
    for (final incident in _incidents) {
      if (incident.isActive) return incident;
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_friendlyError(e))));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancel(ResidentSosIncident incident) async {
    final unitId = widget.controller.primaryUnitId;
    if (unitId == null || incident.unitId != unitId) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('This SOS belongs to another property.')),
        );
      }
      return;
    }
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
      await widget.controller.repository.cancelSos(incident.id, note: 'Cancelled by resident');
      await _load();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_friendlyError(error))),
        );
      }
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
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space3,
            AaraagateTokens.pageGutter,
            AaraagateTokens.space8,
          ),
          children: [
            PremiumSurface(
              elevated: true,
              color: active == null ? theme.colorScheme.errorContainer.withValues(alpha: .18) : theme.colorScheme.primaryContainer.withValues(alpha: .28),
              padding: const EdgeInsets.all(AaraagateTokens.space5),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    Icons.health_and_safety_rounded,
                    size: 48,
                    color: active == null ? theme.colorScheme.error : theme.colorScheme.primary,
                  ),
                  const SizedBox(height: AaraagateTokens.space3),
                  Text(
                    active == null ? 'Emergency assistance' : 'SOS is active',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: AaraagateTokens.space2),
                  Text(
                    active == null
                        ? 'Send an SOS to society operations and security when you need immediate help.'
                        : 'Security has received your emergency request for this property. Keep your phone available for follow-up.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AaraagateTokens.space5),
                  if (active == null)
                    Semantics(
                      button: true,
                      label: 'Send emergency SOS for current property',
                      hint: 'Opens a confirmation before sending',
                      child: FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: theme.colorScheme.error,
                          foregroundColor: theme.colorScheme.onError,
                          padding: const EdgeInsets.symmetric(vertical: 18),
                        ),
                        onPressed: _submitting ? null : _trigger,
                        icon: const Icon(Icons.sos_rounded),
                        label: Text(_submitting ? 'SENDING…' : 'SEND SOS', style: const TextStyle(fontWeight: FontWeight.w900)),
                      ),
                    )
                  else
                    OutlinedButton(
                      onPressed: _submitting ? null : () => _cancel(active),
                      child: const Text('Cancel active SOS'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AaraagateTokens.space6),
            PremiumSectionHeader(
              title: 'Recent SOS activity',
              supportingText: 'Only incidents for your currently selected property are shown.',
              trailing: AaraagateStatusPill(label: '${_incidents.length}', tone: AaraagateStatusTone.neutral),
            ),
            const SizedBox(height: AaraagateTokens.space3),
            if (_loading)
              const AppStateCard(
                icon: Icons.sync_rounded,
                message: 'Loading SOS activity…',
                loading: true,
              )
            else if (_error != null)
              AppStateCard(
                icon: Icons.error_outline_rounded,
                message: _error!,
                actionLabel: 'Retry',
                onAction: _load,
              )
            else if (_incidents.isEmpty)
              const AppStateCard(
                icon: Icons.check_circle_outline_rounded,
                message: 'No SOS incidents for this property.',
              )
            else
              for (final incident in _incidents) ...[
                PremiumSurface(
                  padding: const EdgeInsets.all(AaraagateTokens.space4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainer,
                          borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
                        ),
                        child: Icon(_statusIcon(incident.status), color: theme.colorScheme.primary),
                      ),
                      const SizedBox(width: AaraagateTokens.space3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _statusLabel(incident.status),
                              style: theme.textTheme.titleMedium,
                            ),
                            const SizedBox(height: AaraagateTokens.space1),
                            Text(
                              incident.message ?? 'Emergency SOS',
                              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AaraagateTokens.space2),
              ],
            const SizedBox(height: AaraagateTokens.space5),
            const PremiumSurface(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded),
                  SizedBox(width: AaraagateTokens.space3),
                  Expanded(
                    child: Text(
                      'Aaraagate SOS supports society emergency response. For medical, police, or fire emergencies, also contact the appropriate local emergency service directly.',
                    ),
                  ),
                ],
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

  static String _friendlyError(Object error) {
    if (error is ApiException) {
      if (error.statusCode == 401) return 'Your session has expired. Sign in again.';
      if (error.statusCode == 403) return 'SOS is not available for this property or role.';
      if (error.statusCode == 409) return 'SOS state changed. Refresh and try again.';
    }
    return 'SOS could not be completed. Check your connection and try again.';
  }

  static IconData _statusIcon(String? status) => switch (status) {
    'TRIGGERED' => Icons.sos_rounded,
    'ACKNOWLEDGED' => Icons.visibility_rounded,
    'RESOLVED' => Icons.check_circle_rounded,
    'CANCELLED' => Icons.cancel_outlined,
    _ => Icons.notifications_active_outlined,
  };
}
