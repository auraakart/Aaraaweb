import 'package:flutter/material.dart';
import '../theme/aaraagate_theme.dart';

enum AaraagateStatusTone { neutral, info, success, warning, danger }

/// Shared low-chrome surface for resident journeys. Interactive surfaces add
/// restrained press feedback while preserving a full semantic button target.
class PremiumSurface extends StatefulWidget {
  const PremiumSurface({
    super.key,
    required this.child,
    this.onTap,
    this.semanticLabel,
    this.padding = const EdgeInsets.all(AaraagateTokens.space4),
    this.color,
    this.elevated = false,
  });

  final Widget child;
  final VoidCallback? onTap;
  final String? semanticLabel;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final bool elevated;

  @override
  State<PremiumSurface> createState() => _PremiumSurfaceState();
}

class _PremiumSurfaceState extends State<PremiumSurface> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final radius = BorderRadius.circular(AaraagateTokens.radiusCard);
    final surface = AnimatedScale(
      scale: widget.onTap != null && _pressed ? .985 : 1,
      duration: AaraagateMotion.quick,
      curve: AaraagateMotion.emphasized,
      child: AnimatedContainer(
        duration: AaraagateMotion.standard,
        curve: AaraagateMotion.emphasized,
        decoration: BoxDecoration(
          color: widget.color ?? (widget.elevated ? scheme.surface : scheme.surfaceContainerLow),
          borderRadius: radius,
          boxShadow: widget.elevated
              ? [BoxShadow(color: scheme.shadow.withValues(alpha: .08), blurRadius: 24, offset: const Offset(0, 8))]
              : null,
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: widget.onTap,
            onTapDown: widget.onTap == null ? null : (_) => _setPressed(true),
            onTapUp: widget.onTap == null ? null : (_) => _setPressed(false),
            onTapCancel: widget.onTap == null ? null : () => _setPressed(false),
            borderRadius: radius,
            child: Padding(padding: widget.padding, child: widget.child),
          ),
        ),
      ),
    );
    if (widget.onTap == null) return surface;
    return Semantics(button: true, label: widget.semanticLabel, child: surface);
  }
}

/// Consistent section heading for scan-friendly resident screens.
/// Keeps headings quiet enough that the screen title remains dominant.
class PremiumSectionHeader extends StatelessWidget {
  const PremiumSectionHeader({
    super.key,
    required this.title,
    this.supportingText,
    this.trailing,
  });

  final String title;
  final String? supportingText;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          textScaler: TextScaler.linear(MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.8).toDouble()),
          style: theme.textTheme.titleMedium,
        ),
        if (supportingText != null) ...[
          const SizedBox(height: AaraagateTokens.space1),
          Text(
            supportingText!,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            textScaler: TextScaler.linear(MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.8).toDouble()),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.35,
            ),
          ),
        ],
      ],
    );

    if (trailing == null) return copy;

    return LayoutBuilder(
      builder: (context, constraints) {
        final scale = MediaQuery.textScalerOf(context).scale(1);
        final stacked = constraints.maxWidth < 420 || scale > 1.3;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              copy,
              const SizedBox(height: AaraagateTokens.space2),
              Align(alignment: Alignment.centerLeft, child: trailing!),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: copy),
            const SizedBox(width: AaraagateTokens.space3),
            trailing!,
          ],
        );
      },
    );
  }
}

class AaraagateStatusPill extends StatelessWidget {
  const AaraagateStatusPill({super.key, required this.label, this.tone = AaraagateStatusTone.neutral});

  final String label;
  final AaraagateStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = switch (tone) {
      AaraagateStatusTone.info => (scheme.primaryContainer, scheme.onPrimaryContainer),
      AaraagateStatusTone.success => (scheme.tertiaryContainer, scheme.onTertiaryContainer),
      AaraagateStatusTone.warning => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      AaraagateStatusTone.danger => (scheme.errorContainer, scheme.onErrorContainer),
      AaraagateStatusTone.neutral => (scheme.surfaceContainerHigh, scheme.onSurfaceVariant),
    };
    return Semantics(
      label: 'Status: $label',
      child: Container(
        constraints: const BoxConstraints(minHeight: 28),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: colors.$1, borderRadius: BorderRadius.circular(999)),
        child: Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colors.$2, fontWeight: FontWeight.w800)),
      ),
    );
  }
}
