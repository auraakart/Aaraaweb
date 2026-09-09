import 'package:flutter/material.dart';

class PropertyContextBar extends StatelessWidget {
  const PropertyContextBar({
    super.key,
    required this.societyName,
    required this.propertyLabel,
    required this.relationship,
    required this.onSwitch,
  });

  final String societyName;
  final String propertyLabel;
  final String relationship;
  final VoidCallback onSwitch;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final relationshipLabel = relationship == 'OWNER'
        ? 'Owner'
        : relationship == 'OCCUPANT'
            ? 'Resident'
            : relationship.replaceAll('_', ' ').toLowerCase();

    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Material(
          color: scheme.surfaceContainerHighest.withOpacity(.7),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
            child: Row(
              children: [
                Icon(Icons.apartment_rounded, color: scheme.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        societyName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        relationshipLabel.isEmpty ? propertyLabel : '$propertyLabel · $relationshipLabel',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: onSwitch,
                  icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                  label: const Text('Switch'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
