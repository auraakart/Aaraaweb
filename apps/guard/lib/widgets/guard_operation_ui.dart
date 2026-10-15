import 'package:flutter/material.dart';
import '../theme/aaraagate_guard_theme.dart';

enum GuardStatusTone { neutral, ready, waiting, blocked, offline }

class GuardOperationSurface extends StatelessWidget {
  const GuardOperationSurface({
    super.key,
    required this.child,
    this.color,
    this.padding = const EdgeInsets.all(AaraagateGuardTokens.space4),
    this.prominent = false,
    this.semanticLabel,
  });

  final Widget child;
  final Color? color;
  final EdgeInsetsGeometry padding;
  final bool prominent;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final surface = AnimatedContainer(
      duration: AaraagateGuardMotion.duration(context, AaraagateGuardMotion.standard),
      curve: AaraagateGuardMotion.emphasized,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? (prominent ? scheme.surface : scheme.surfaceContainerLow),
        borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusCard),
        boxShadow: prominent ? AaraagateGuardElevation.raised(scheme.shadow) : null,
      ),
      child: child,
    );
    return Semantics(container: true, label: semanticLabel, child: surface);
  }
}

class GuardQuickAction extends StatelessWidget {
  const GuardQuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.tonal = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool tonal;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final background = tonal ? scheme.surfaceContainer : scheme.primaryContainer;
    final foreground = tonal ? scheme.onSurface : scheme.onPrimaryContainer;
    final radius = BorderRadius.circular(AaraagateGuardTokens.radiusControl);

    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        color: background,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 84),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AaraagateGuardTokens.space2,
                vertical: AaraagateGuardTokens.space3,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: foreground, size: 28),
                  const SizedBox(height: AaraagateGuardTokens.space2),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: foreground,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class GuardStatusPill extends StatelessWidget {
  const GuardStatusPill({super.key, required this.label, this.tone = GuardStatusTone.neutral});

  final String label;
  final GuardStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = switch (tone) {
      GuardStatusTone.ready => (scheme.primaryContainer, scheme.onPrimaryContainer),
      GuardStatusTone.waiting => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      GuardStatusTone.blocked => (scheme.errorContainer, scheme.onErrorContainer),
      GuardStatusTone.offline => (scheme.errorContainer, scheme.onErrorContainer),
      GuardStatusTone.neutral => (scheme.surfaceContainerHigh, scheme.onSurfaceVariant),
    };
    return Semantics(
      label: 'Status: $label',
      excludeSemantics: true,
      child: Container(
        constraints: const BoxConstraints(minHeight: 32),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: colors.$1, borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusPill)),
        child: Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colors.$2, fontWeight: FontWeight.w700)),
      ),
    );
  }
}
