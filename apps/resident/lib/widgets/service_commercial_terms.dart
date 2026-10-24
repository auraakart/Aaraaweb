import 'package:flutter/material.dart';
import '../localization/aaraagate_strings.dart';

class ServiceCommercialTerms extends StatelessWidget {
  const ServiceCommercialTerms({super.key, required this.terms, this.recorded = false});
  final Object? terms;
  final bool recorded;
  static const labels = <String, String>{'invoiceIssuer':'Invoice issuer','cancellation':'Cancellation','refund':'Refund','settlement':'Settlement','rework':'Rework'};
  @override
  Widget build(BuildContext context) {
    final values = terms is Map ? terms as Map : const {};
    final strings = AaraagateStrings.device();
    final provided = labels.keys.where((key) => values[key] is String && (values[key] as String).trim().isNotEmpty).length;
    final copy = {'invoiceIssuer':'termsInvoiceIssuer','cancellation':'termsCancellation','refund':'termsRefund','settlement':'termsSettlement','rework':'termsRework'};
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(strings.text(recorded ? 'termsRecorded' : 'termsDeclared'), style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 8),
      if(strings.languageCode=='en') Text(recorded ? 'Saved with this request. These declarations do not authorize a payment or establish verified tax, refund or settlement rules.' : 'Review these declarations before requesting. They do not establish verified tax, refund or settlement rules.'),
      const SizedBox(height: 8),
      Text(strings.format('termsProvided', {'count':provided,'total':labels.length})),
      Text(strings.text('termsBoundary')),
      for (final entry in labels.entries) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${strings.text(copy[entry.key]!)}: ${values[entry.key] is String && (values[entry.key] as String).trim().isNotEmpty ? values[entry.key] : strings.text(recorded ? 'termsNotRecorded' : 'termsMissing')}')),
    ])));
  }
}
