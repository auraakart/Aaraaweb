import 'package:flutter/material.dart';

/// The handover record is rendered without altering its approval or refresh flow.
class GuardFieldHandoverCard extends StatelessWidget {
  const GuardFieldHandoverCard({
    super.key,
    required this.handover,
    required this.busy,
    required this.onAcknowledge,
  });

  final Map<String, dynamic> handover;
  final bool busy;
  final VoidCallback onAcknowledge;

  @override
  Widget build(BuildContext context) {
    final status = handover['status']?.toString() ?? '';
    final outgoing = handover['outgoingGuardName']?.toString() ?? 'Outgoing guard';
    final gate = handover['gateName']?.toString();
    final identity = '$outgoing${gate == null ? '' : ' · $gate'}';
    final items = handover['openItems'] is List
        ? (handover['openItems'] as List)
            .map((item) => item.toString())
            .where((item) => item.trim().isNotEmpty)
            .toList(growable: false)
        : <String>[];
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
    final title = Text(
      identity,
      key: const ValueKey('guard-handover-identity'),
      style: const TextStyle(fontWeight: FontWeight.w800),
    );
    final statusLabel = Text(
      status,
      key: const ValueKey('guard-handover-status'),
    );
    final heading = largeText
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              title,
              const SizedBox(height: 6),
              statusLabel,
            ],
          )
        : Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: title),
              const SizedBox(width: 8),
              statusLabel,
            ],
          );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            heading,
            const SizedBox(height: 6),
            Text(handover['summary']?.toString() ?? ''),
            if (items.isNotEmpty) ...[
              const SizedBox(height: 8),
              for (final item in items.take(6))
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text('• $item'),
                ),
            ],
            if (status == 'OPEN')
              largeText
                  ? SizedBox(
                      width: double.infinity,
                      child: FilledButton.tonal(
                        onPressed: busy ? null : onAcknowledge,
                        child: const Text('ACKNOWLEDGE'),
                      ),
                    )
                  : Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.tonal(
                        onPressed: busy ? null : onAcknowledge,
                        child: const Text('ACKNOWLEDGE'),
                      ),
                    ),
          ],
        ),
      ),
    );
  }
}
