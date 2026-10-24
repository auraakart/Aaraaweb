import 'dart:convert';
import 'package:aaraagate_resident/data/finance_export.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('neutralizes spreadsheet formulas and preserves quoted multilingual data', () {
    for (final value in ['=1+1', ' +SUM(A1)', '\t@command', '-formula']) {
      expect(financeCsvCell(value), startsWith('"\''));
    }
    expect(financeCsvCell('தமிழ், "வீடு"'), '"தமிழ், ""வீடு"""');
    expect(utf8.decode(financeCsv([['=formula', 12345]])), contains('"12345"'));
  });
  test('labels refunded values as original amounts without fabricating a balance', () {
    final rows = statementExportRows({'from':'2026-01-01','to':'2026-01-31','payments':[
      {'invoiceNumber':'INV-1','receiptNumber':'AGRP-full','amountPaise':12000,'status':'REFUNDED'}
    ]});
    expect(rows.last, contains('REFUNDED'));
    expect(rows.last, contains(12000));
    expect(rows[4], contains('Original amount (paise)'));
    expect(rows.toString().toLowerCase(), isNot(contains('closing balance')));
  });
}
