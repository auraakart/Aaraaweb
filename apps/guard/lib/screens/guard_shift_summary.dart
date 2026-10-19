part of 'guard_operations_screen.dart';

// Isolated presentation only; controller authority remains in GuardOperationsScreen.
class _GuardShiftSummary extends StatelessWidget {
  const _GuardShiftSummary({required this.controller, required this.strings});

  final GuardController controller;
  final GuardStrings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final gateReady = controller.gateId != null;
    return GuardOperationSurface(
      key: const ValueKey('guard-shift-summary'),
      semanticLabel: gateReady
          ? '${strings.get('securityShiftActive')} · ${controller.gateName ?? strings.get('activeGate')}'
          : strings.get('selectGateBegin'),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stacked = MediaQuery.textScalerOf(context).scale(1) > 1.3 ||
              constraints.maxWidth < 250;
          final details = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(strings.get('securityShiftActive'), style: theme.textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(
                controller.gateName ?? strings.get('selectGateBegin'),
                style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          );
          final statusPill = GuardStatusPill(
            label: gateReady ? 'READY' : 'SELECT GATE',
            tone: gateReady ? GuardStatusTone.ready : GuardStatusTone.waiting,
          );
          if (stacked) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                details,
                const SizedBox(height: AaraagateGuardTokens.space2),
                statusPill,
              ],
            );
          }
          return Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(Icons.security_rounded, color: scheme.onPrimaryContainer, size: 28),
              ),
              const SizedBox(width: 12),
              Expanded(child: details),
              const SizedBox(width: 8),
              statusPill,
            ],
          );
        },
      ),
    );
  }
}
