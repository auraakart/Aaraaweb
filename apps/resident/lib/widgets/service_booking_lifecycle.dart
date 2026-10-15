import 'package:flutter/material.dart';

class ServiceBookingLifecycle extends StatelessWidget {
  const ServiceBookingLifecycle({
    super.key,
    required this.status,
    this.compact = false,
  });

  final String status;
  final bool compact;

  static const _activeSteps = <String>[
    'REQUESTED',
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
  ];

  static String labelFor(String status) {
    switch (status) {
      case 'REQUESTED':
        return 'Requested';
      case 'CONFIRMED':
        return 'Confirmed';
      case 'IN_PROGRESS':
        return 'Service started';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status.replaceAll('_', ' ').toLowerCase();
    }
  }

  static String cancellationGuidance(String status) {
    switch (status) {
      case 'REQUESTED':
        return 'You can cancel while the provider is reviewing your request.';
      case 'CONFIRMED':
        return 'You can cancel before the service starts. Linked gate access will be revoked.';
      case 'IN_PROGRESS':
        return 'Cancellation is no longer available after the service has started.';
      case 'COMPLETED':
        return 'This service is complete and can no longer be cancelled.';
      case 'CANCELLED':
        return 'This booking has already been cancelled.';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (status == 'CANCELLED') {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cancel_outlined, size: compact ? 16 : 18, color: scheme.error),
          const SizedBox(width: 6),
          Text('Cancelled', style: TextStyle(fontWeight: FontWeight.w700, color: scheme.error)),
        ],
      );
    }

    final current = _activeSteps.indexOf(status).clamp(0, _activeSteps.length - 1);
    return Semantics(
      label: 'Service booking progress: ${labelFor(status)}',
      child: Row(
        children: [
          for (var index = 0; index < _activeSteps.length; index++) ...[
            Expanded(
              child: Column(
                children: [
                  Icon(
                    index <= current ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                    size: compact ? 17 : 20,
                    color: index <= current ? scheme.primary : scheme.outline,
                  ),
                  if (!compact) ...[
                    const SizedBox(height: 4),
                    Text(
                      labelFor(_activeSteps[index]),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ],
                ],
              ),
            ),
            if (index < _activeSteps.length - 1)
              Expanded(
                child: Divider(
                  thickness: 2,
                  color: index < current ? scheme.primary : scheme.outlineVariant,
                ),
              ),
          ],
        ],
      ),
    );
  }
}
