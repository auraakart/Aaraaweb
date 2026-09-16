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
      duration: AaraagateGuardMotion.standard,
      curve: AaraagateGuardMotion.emphasized,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? (prominent ? scheme.surface : scheme.surfaceContainerLow),
        borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusCard),
        boxShadow: prominent
            ? [BoxShadow(color: scheme.shadow.withOpacity(.09), blurRadius: 24, offset: const Offset(0, 8))]
            : null,
      ),
      child: child,
    );
    return Semantics(container: true, label: semanticLabel, child: surface);
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
      child: Container(
        constraints: const BoxConstraints(minHeight: 32),
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(color: colors.$1, borderRadius: BorderRadius.circular(999)),
        child: Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colors.$2, fontWeight: FontWeight.w900)),
      ),
    );
  }
}
