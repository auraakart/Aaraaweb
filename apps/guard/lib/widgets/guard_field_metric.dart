import 'package:flutter/material.dart';

/// One field-operations count, with a single spoken label/value announcement.
/// Larger text uses the full summary width instead of forcing narrow columns.
class GuardFieldMetric extends StatelessWidget {
  const GuardFieldMetric({
    super.key,
    required this.label,
    required this.value,
  });

  final String label;
  final Object? value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = '${value ?? 0}';
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
    final labelText = Text(label, style: theme.textTheme.labelMedium);
    final countText = Text(
      count,
      style: theme.textTheme.headlineSmall?.copyWith(
        fontWeight: FontWeight.w900,
      ),
    );

    return Semantics(
      container: true,
      label: '$label: $count',
      excludeSemantics: true,
      child: SizedBox(
        width: largeText ? double.infinity : 128,
        child: largeText
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(child: labelText),
                  const SizedBox(width: 12),
                  Flexible(
                    child: Text(
                      count,
                      textAlign: TextAlign.end,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [labelText, countText],
              ),
      ),
    );
  }
}
