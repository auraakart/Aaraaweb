import 'package:flutter/material.dart';
import '../data/maintenance_receipt.dart';
import '../data/resident_repository.dart';
import '../localization/aaraagate_strings.dart';
import '../theme/aaraagate_theme.dart';
import 'billing_export.dart';

class BillingReceiptSheet extends StatelessWidget {
  const BillingReceiptSheet({super.key,required this.repository,required this.receipt,required this.isCurrent});
  final ResidentRepository repository;
  final MaintenanceReceipt receipt;
  final bool Function() isCurrent;

  @override
  Widget build(BuildContext context) {
    final theme=Theme.of(context);
    final strings=AaraagateStrings.device();
    return SingleChildScrollView(
      padding:const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter,AaraagateTokens.space1,AaraagateTokens.pageGutter,AaraagateTokens.space6),
      child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[
          Container(width:AaraagateTokens.iconContainer,height:AaraagateTokens.iconContainer,
            decoration:BoxDecoration(color:theme.colorScheme.primaryContainer,borderRadius:BorderRadius.circular(AaraagateTokens.radiusControl)),
            child:Icon(Icons.receipt_long_outlined,color:theme.colorScheme.onPrimaryContainer)),
          const SizedBox(width:AaraagateTokens.space3),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            SelectableText(strings.format('billingReceiptReference',{'reference':receipt.number}),style:theme.textTheme.titleLarge),
            Text(strings.text('billingVerifiedPayment'),style:theme.textTheme.bodySmall?.copyWith(color:theme.colorScheme.onSurfaceVariant)),
          ])),
        ]),
        const SizedBox(height:AaraagateTokens.space5),
        Text(receipt.amount,style:theme.textTheme.headlineMedium),
        const SizedBox(height:AaraagateTokens.space2),
        Text('${receipt.societyName}\n${receipt.buildingName} · ${receipt.unitNumber}\n${receipt.invoiceNumber}\n${strings.text('status${receipt.status}')}',style:theme.textTheme.bodyMedium?.copyWith(height:1.5)),
        const SizedBox(height:AaraagateTokens.space5),
        BillingExportButton(repository:repository,receipt:receipt.data,isCurrent:isCurrent),
        SizedBox(width:double.infinity,child:FilledButton(onPressed:()=>Navigator.pop(context),child:Text(strings.text('billingDone')))),
      ]),
    );
  }
}
