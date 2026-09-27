import 'package:flutter/material.dart';
import '../data/models/resident_parcel.dart';
import '../data/parcel_actions.dart';
import '../data/resident_repository.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class ParcelsScreen extends StatefulWidget {
  const ParcelsScreen({
    super.key,
    required this.repository,
    required this.unitId,
    this.demoMode = false,
  });

  final ResidentRepository repository;
  final String unitId;
  final bool demoMode;

  @override
  State<ParcelsScreen> createState() => _ParcelsScreenState();
}

class _ParcelsScreenState extends State<ParcelsScreen> {
  List<ResidentParcel> _parcels = const [];
  final Set<String> _pickupCodeBusy = <String>{};
  bool _loading = true;
  String? _error;

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
      final value = widget.demoMode ? _demoParcels() : await widget.repository.parcels();
      final scoped = value.where((parcel) => parcel.unitId == widget.unitId).toList(growable: false);
      if (!mounted) return;
      setState(() => _parcels = scoped);
    } catch (_) {
      if (mounted) setState(() => _error = 'Parcels could not be loaded.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickupCode(ResidentParcel parcel) async {
    if (!_belongsToActiveProperty(parcel)) {
      _showPropertyMismatch();
      return;
    }
    if (_pickupCodeBusy.contains(parcel.id)) return;
    setState(() => _pickupCodeBusy.add(parcel.id));
    try {
      final result = widget.demoMode
          ? ParcelPickupCode(
              code: '482731',
              expiresAt: DateTime.now().add(const Duration(minutes: 10)),
              maxAttempts: 5,
            )
          : await widget.repository.issueParcelPickupCode(parcel.id);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) {
          final theme = Theme.of(context);
          return AlertDialog(
            icon: const Icon(Icons.pin_rounded),
            title: const Text('Parcel pickup code'),
            content: Column(mainAxisSize: MainAxisSize.min, children: [
              PremiumSurface(
                elevated: true,
                child: SelectableText(
                  result.code,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, letterSpacing: 6),
                ),
              ),
              const SizedBox(height: AaraagateTokens.space3),
              Text(
                _pickupCodeGuidance(result),
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium,
              ),
            ]),
            actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
          );
        },
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pickup code could not be created. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _pickupCodeBusy.remove(parcel.id));
    }
  }

  String _pickupCodeGuidance(ParcelPickupCode result) {
    final details = <String>['Show this code to security when collecting the parcel.'];
    final expiresAt = result.expiresAt?.toLocal();
    if (expiresAt != null) {
      final hour = expiresAt.hour.toString().padLeft(2, '0');
      final minute = expiresAt.minute.toString().padLeft(2, '0');
      details.add('Valid until $hour:$minute.');
    }
    final maxAttempts = result.maxAttempts;
    if (maxAttempts != null && maxAttempts > 0) {
      details.add('Security has up to $maxAttempts attempts before a new code is required.');
    }
    return details.join(' ');
  }

  bool _belongsToActiveProperty(ResidentParcel parcel) => parcel.unitId == widget.unitId;

  void _showPropertyMismatch() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('This parcel belongs to another property.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final activeCount = _parcels.where((parcel) => parcel.isActive).length;
    return Scaffold(
      appBar: AppBar(title: const Text('Parcels')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space4,
            AaraagateTokens.pageGutter,
            AaraagateTokens.space8,
          ),
          children: [
            PremiumSectionHeader(
              title: 'Your parcels',
              supportingText: 'Track deliveries received at the gate and use a short-lived pickup code for secure collection.',
              trailing: AaraagateStatusPill(
                label: '$activeCount waiting',
                tone: activeCount == 0 ? AaraagateStatusTone.neutral : AaraagateStatusTone.info,
              ),
            ),
            const SizedBox(height: AaraagateTokens.space4),
            if (_loading && _parcels.isEmpty)
              const AppStateCard(icon: Icons.inventory_2_outlined, message: 'Loading parcels…', loading: true)
            else ...[
              if (_error != null) ...[
                AppStateCard(
                  icon: Icons.error_outline_rounded,
                  message: _error!,
                  actionLabel: 'Retry',
                  onAction: _load,
                ),
                const SizedBox(height: AaraagateTokens.space4),
              ],
              if (_parcels.isEmpty && _error == null)
                const AppStateCard(
                  icon: Icons.inventory_2_outlined,
                  message: 'No parcels yet. Parcels received at the gate will appear here.',
                )
              else
                for (final parcel in _parcels) ...[
                  _ParcelCard(
                    parcel: parcel,
                    busy: _pickupCodeBusy.contains(parcel.id),
                    onPickupCode: () => _pickupCode(parcel),
                  ),
                  const SizedBox(height: AaraagateTokens.space3),
                ],
              if (_loading && _parcels.isNotEmpty) const LinearProgressIndicator(),
              const SizedBox(height: AaraagateTokens.space4),
              Text(
                'Pickup codes are short-lived. Security verifies the code before handing over the parcel.',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<ResidentParcel> _demoParcels() => [
        ResidentParcel(
          id: 'demo-parcel-1',
          unitId: widget.unitId,
          courierName: 'Amazon',
          trackingReference: 'AMZ-77421',
          status: 'RECEIVED',
          receivedAt: DateTime.now().subtract(const Duration(hours: 2)),
          overdue: false,
        ),
        ResidentParcel(
          id: 'demo-parcel-2',
          unitId: widget.unitId,
          courierName: 'BlueDart',
          trackingReference: 'BD-209184',
          status: 'RECEIVED',
          receivedAt: DateTime.now().subtract(const Duration(hours: 30)),
          overdue: true,
        ),
        ResidentParcel(
          id: 'demo-parcel-3',
          unitId: widget.unitId,
          courierName: 'India Post',
          trackingReference: 'INP-55108',
          status: 'COLLECTED',
          receivedAt: DateTime.now().subtract(const Duration(days: 2)),
          overdue: false,
        ),
      ];
}

class _ParcelCard extends StatelessWidget {
  const _ParcelCard({
    required this.parcel,
    required this.busy,
    required this.onPickupCode,
  });

  final ResidentParcel parcel;
  final bool busy;
  final VoidCallback onPickupCode;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final active = parcel.isActive;
    final displayStatus = parcel.overdue && active ? 'OVERDUE' : parcel.status;
    final tone = parcel.overdue && active
        ? AaraagateStatusTone.danger
        : active
            ? AaraagateStatusTone.info
            : AaraagateStatusTone.success;
    return PremiumSurface(
      elevated: active,
      padding: const EdgeInsets.all(AaraagateTokens.space4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: AaraagateTokens.iconContainer,
            height: AaraagateTokens.iconContainer,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active ? scheme.primaryContainer : scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
            ),
            child: Icon(
              active ? Icons.inventory_2_outlined : Icons.check_rounded,
              color: active ? scheme.onPrimaryContainer : scheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(parcel.courierName ?? 'Parcel', style: theme.textTheme.titleMedium),
              if (parcel.trackingReference != null) ...[
                const SizedBox(height: AaraagateTokens.space1),
                Text(
                  parcel.trackingReference!,
                  style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ]),
          ),
          const SizedBox(width: AaraagateTokens.space2),
          AaraagateStatusPill(label: displayStatus.replaceAll('_', ' '), tone: tone),
        ]),
        if (parcel.receivedAt != null) ...[
          const SizedBox(height: AaraagateTokens.space3),
          Text('Received ${_friendly(parcel.receivedAt!)}', style: theme.textTheme.bodyMedium),
        ],
        if (active) ...[
          const SizedBox(height: AaraagateTokens.space4),
          Wrap(
            spacing: AaraagateTokens.space2,
            runSpacing: AaraagateTokens.space2,
            children: [
              FilledButton.icon(
                onPressed: busy ? null : onPickupCode,
                icon: busy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.pin_outlined),
                label: Text(busy ? 'Creating code…' : 'Pickup code'),
              ),

            ],
          ),
        ],
      ]),
    );
  }

  static String _friendly(DateTime value) {
    final local = value.toLocal();
    return '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')} '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
