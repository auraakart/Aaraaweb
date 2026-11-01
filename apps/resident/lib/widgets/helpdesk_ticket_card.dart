import 'package:flutter/material.dart';
import '../theme/aaraagate_theme.dart';
import 'premium_ui.dart';
import 'helpdesk_status_labels.dart';

class HelpdeskTicketCard extends StatelessWidget {
  const HelpdeskTicketCard({super.key, required this.ticket, required this.onTap});
  final Map<String, dynamic> ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = ticket['status']?.toString() ?? 'OPEN';
    final priority = ticket['priority']?.toString() ?? 'NORMAL';
    final category = ticket['category']?.toString().trim() ?? '';
    final ticketNumber = ticket['ticketNumber']?.toString().trim() ?? '';
    final sla = ticket['computedSlaState']?.toString() ?? ticket['slaState']?.toString() ?? 'UNTRACKED';
    final building = ticket['buildingName']?.toString();
    final unit = ticket['unitNumber']?.toString();
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;

    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(ticket['title']?.toString() ?? 'Complaint', style: theme.textTheme.titleMedium),
        if (ticketNumber.isNotEmpty) ...[
          const SizedBox(height: AaraagateTokens.space1),
          Text(ticketNumber, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
        ],
        SizedBox(height: compact ? AaraagateTokens.space1 : AaraagateTokens.space2),
        Wrap(
          spacing: AaraagateTokens.space2,
          runSpacing: AaraagateTokens.space2,
          children: [
            AaraagateStatusPill(label: helpdeskDisplayLabel(status), tone: helpdeskStatusTone(status)),
            if (priority != 'NORMAL')
              AaraagateStatusPill(label: helpdeskDisplayLabel(priority), tone: helpdeskPriorityTone(priority)),
            if (category.isNotEmpty)
              AaraagateStatusPill(label: category, tone: AaraagateStatusTone.neutral),
          ],
        ),
        if (building != null || unit != null) ...[
          SizedBox(height: compact ? AaraagateTokens.space1 : AaraagateTokens.space2),
          Text(
            [building, unit].where((value) => value != null && value.trim().isNotEmpty).join(' · '),
            style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
        SizedBox(height: compact ? AaraagateTokens.space1 : AaraagateTokens.space2),
        AaraagateStatusPill(label: 'SLA ${helpdeskDisplayLabel(sla)}', tone: helpdeskSlaTone(sla)),
      ],
    );
    final leading = Container(
      width: compact ? 40 : AaraagateTokens.iconContainer,
      height: compact ? 40 : AaraagateTokens.iconContainer,
      decoration: BoxDecoration(
        color: helpdeskPriorityTone(priority) == AaraagateStatusTone.danger
            ? scheme.errorContainer
            : scheme.primaryContainer,
        borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
      ),
      child: Icon(
        Icons.support_agent_rounded,
        color: helpdeskPriorityTone(priority) == AaraagateStatusTone.danger
            ? scheme.onErrorContainer
            : scheme.onPrimaryContainer,
      ),
    );
    final chevron = Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant);
    return PremiumSurface(
      onTap: onTap,
      semanticLabel: 'Open complaint $ticketNumber, ${ticket['title'] ?? 'Complaint'}, ${helpdeskDisplayLabel(status)}',
      color: scheme.surfaceContainerLow,
      padding: EdgeInsets.all(compact ? AaraagateTokens.space3 : AaraagateTokens.space4),
      child: LayoutBuilder(builder: (context, constraints) {
        final stacked = constraints.maxWidth < 320 && MediaQuery.textScalerOf(context).scale(1) > 1.3;
        if (stacked) {
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [leading, const Spacer(), chevron]),
            const SizedBox(height: AaraagateTokens.space2),
            details,
          ]);
        }
        return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          leading,
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(child: details),
          const SizedBox(width: AaraagateTokens.space2),
          chevron,
        ]);
      }),
    );
  }
}
