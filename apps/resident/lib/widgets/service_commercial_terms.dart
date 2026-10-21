import 'package:flutter/material.dart';

class ServiceCommercialTerms extends StatelessWidget {
  const ServiceCommercialTerms({super.key, required this.terms, this.recorded = false});
  final Object? terms;
  final bool recorded;
  static const labels = <String, String>{'invoiceIssuer':'Invoice issuer','cancellation':'Cancellation','refund':'Refund','settlement':'Settlement','rework':'Rework'};
  @override
  Widget build(BuildContext context) {
    final values = terms is Map ? terms as Map : const {};
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(recorded ? 'Terms recorded at booking request' : 'Provider-declared terms', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      Text(recorded ? 'Saved with this request. These declarations do not authorize a payment or establish verified tax, refund or settlement rules.' : 'Review these declarations before requesting. They do not establish verified tax, refund or settlement rules.'),
      for (final entry in labels.entries) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${entry.value}: ${values[entry.key] is String && (values[entry.key] as String).trim().isNotEmpty ? values[entry.key] : (recorded ? 'Not recorded' : 'Not specified')}')),
    ])));
  }
}
