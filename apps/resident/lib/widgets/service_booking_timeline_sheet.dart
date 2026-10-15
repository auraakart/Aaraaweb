import 'package:flutter/material.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class ServiceBookingTimelineSheet extends StatelessWidget {
  const ServiceBookingTimelineSheet({super.key, required this.timeline});

  final Map<String, dynamic> timeline;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final booking = timeline['booking'] is Map ? Map<String, dynamic>.from(timeline['booking'] as Map) : const <String, dynamic>{};
    final provider = booking['provider'] is Map ? Map<String, dynamic>.from(booking['provider'] as Map) : const <String, dynamic>{};
    final offering = booking['offering'] is Map ? Map<String, dynamic>.from(booking['offering'] as Map) : const <String, dynamic>{};
    final events = timeline['events'] is List
        ? (timeline['events'] as List).whereType<Map>().map((event) => Map<String, dynamic>.from(event)).toList(growable: false)
        : const <Map<String, dynamic>>[];
    final warranty = timeline['warranty'] is Map ? Map<String, dynamic>.from(timeline['warranty'] as Map) : null;

    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: 0.88,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space1, AaraagateTokens.pageGutter, AaraagateTokens.space5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const PremiumSectionHeader(title: 'Service timeline'),
              const SizedBox(height: AaraagateTokens.space2),
              Text(
                '${offering['name'] ?? 'Service'} · ${provider['businessName'] ?? 'Verified provider'}',
                style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: AaraagateTokens.space4),
              if (warranty != null) ...[
                PremiumSurface(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.verified_user_outlined, color: warranty['warrantyActive'] == true ? scheme.primary : scheme.onSurfaceVariant),
                      const SizedBox(width: AaraagateTokens.space3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(warranty['warrantyActive'] == true ? 'Service warranty active' : 'Service warranty', style: theme.textTheme.titleSmall),
                            const SizedBox(height: AaraagateTokens.space1),
                            if (warranty['warrantyDays'] != null)
                              Text('${warranty['warrantyDays']} day warranty', style: theme.textTheme.bodyMedium),
                            if ((warranty['revisitPolicy']?.toString() ?? '').trim().isNotEmpty)
                              Text(warranty['revisitPolicy'].toString(), style: theme.textTheme.bodyMedium),
                            if (warranty['warrantyUntil'] != null)
                              Text('Valid until ${_dateTime(warranty['warrantyUntil'])}', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AaraagateTokens.space4),
              ],
              Expanded(
                child: events.isEmpty
                    ? const AppStateCard(icon: Icons.timeline_outlined, message: 'No service timeline events are available yet.')
                    : ListView.separated(
                        itemCount: events.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AaraagateTokens.space2),
                        itemBuilder: (context, index) {
                          final event = events[index];
                          final action = event['action']?.toString() ?? 'STATUS_CHANGED';
                          return PremiumSurface(
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 42,
                                  height: 42,
                                  decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                                  child: Icon(_eventIcon(action), color: scheme.onPrimaryContainer, size: 22),
                                ),
                                const SizedBox(width: AaraagateTokens.space3),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(_eventLabel(action), style: theme.textTheme.titleSmall),
                                      const SizedBox(height: AaraagateTokens.space1),
                                      Text(_dateTime(event['occurredAt']), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static IconData _eventIcon(String action) {
    switch (action) {
      case 'PROVIDER_CONFIRMED':
        return Icons.verified_outlined;
      case 'PROVIDER_GATE_CHECKED_IN':
        return Icons.login_rounded;
      case 'PROVIDER_GATE_CHECKED_OUT':
        return Icons.logout_rounded;
      case 'SERVICE_IN_PROGRESS':
        return Icons.handyman_outlined;
      case 'SERVICE_COMPLETED':
        return Icons.task_alt_rounded;
      case 'BOOKING_CANCELLED':
        return Icons.cancel_outlined;
      default:
        return Icons.event_note_outlined;
    }
  }

  static String _eventLabel(String action) {
    switch (action) {
      case 'BOOKING_REQUESTED':
        return 'Booking requested';
      case 'PROVIDER_CONFIRMED':
        return 'Provider confirmed';
      case 'PROVIDER_GATE_CHECKED_IN':
        return 'Provider entered the society';
      case 'SERVICE_IN_PROGRESS':
        return 'Service started';
      case 'PROVIDER_GATE_CHECKED_OUT':
        return 'Provider exited the society';
      case 'SERVICE_COMPLETED':
        return 'Service completed';
      case 'BOOKING_CANCELLED':
        return 'Booking cancelled';
      default:
        return action.replaceAll('_', ' ').toLowerCase();
    }
  }

  static String _dateTime(dynamic raw) {
    final value = DateTime.tryParse(raw?.toString() ?? '');
    if (value == null) return raw?.toString() ?? '';
    final local = value.toLocal();
    final minute = local.minute.toString().padLeft(2, '0');
    return '${local.day}/${local.month}/${local.year} · ${local.hour}:$minute';
  }
}
