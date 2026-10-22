import 'dart:convert';
import 'dart:typed_data';

/// CSV quoting also neutralizes formulas, including leading control/whitespace.
String financeCsvCell(Object? value) {
  var text = value?.toString() ?? '';
  if (RegExp(r'^[\s\x00-\x20]*[=+@-]').hasMatch(text)) text = "'$text";
  return '"${text.replaceAll('"', '""')}"';
}

Uint8List financeCsv(List<List<Object?>> rows) => Uint8List.fromList(
  utf8.encode('\ufeff${rows.map((row) => row.map(financeCsvCell).join(',')).join('\r\n')}\r\n'),
);

List<List<Object?>> receiptExportRows(Map<String, dynamic> receipt) => [
  ['Aaraagate maintenance payment receipt'],
  ['Receipt reference', receipt['receiptNumber']],
  ['Historical lookup alias', receipt['legacyReceiptNumber']],
  ['Society', receipt['societyName']],
  ['Building', receipt['buildingName']],
  ['Unit', receipt['unitNumber']],
  ['Invoice', receipt['invoiceNumber']],
  ['Currency', 'INR'],
  ['Original amount (paise)', receipt['amountPaise']],
  ['Current payment status', receipt['status']],
  ['Completed at', receipt['completedAt']],
  ['Boundary', 'Verified payment record. REFUNDED is not a net collection.'],
];

List<List<Object?>> statementExportRows(Map<String, dynamic> statement) {
  final rows = <List<Object?>>[
    ['Aaraagate maintenance activity statement'],
    ['Society', statement['societyName'], 'Building', statement['buildingName'], 'Unit', statement['unitNumber']],
    ['From', statement['from'], 'To', statement['to'], 'Date basis', statement['dateBasis']],
    ['Scope', statement['boundary']],
    ['Kind', 'Invoice', 'Receipt reference', 'Original amount (paise)', 'Currency', 'Status', 'Recorded at UTC'],
  ];
  for (final kind in ['invoices', 'payments']) {
    for (final value in (statement[kind] as List? ?? const [])) {
      final row = Map<String, dynamic>.from(value as Map);
      rows.add([kind == 'invoices' ? 'INVOICE' : 'PAYMENT', row['invoiceNumber'], row['receiptNumber'], row['amountPaise'], 'INR', row['status'], row['createdAt']]);
    }
  }
  return rows;
}
