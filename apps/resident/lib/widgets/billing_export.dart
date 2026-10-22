import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../data/finance_export.dart';
import '../data/resident_repository.dart';
import '../localization/aaraagate_strings.dart';

class BillingExportButton extends StatefulWidget {
  const BillingExportButton({super.key, required this.repository, this.unitId, this.receipt, this.isCurrent, this.share});
  final ResidentRepository repository;
  final String? unitId;
  final bool Function()? isCurrent;
  final Map<String, dynamic>? receipt;
  final Future<ShareResult> Function(ShareParams)? share;

  @override
  State<BillingExportButton> createState() => _BillingExportButtonState();
}

class _BillingExportButtonState extends State<BillingExportButton> {
  bool _busy = false;
  int _epoch = 0;

  @override
  void didUpdateWidget(covariant BillingExportButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.unitId != widget.unitId || !identical(oldWidget.repository, widget.repository) || !identical(oldWidget.receipt, widget.receipt)) {
      _epoch++;
      _busy = false;
    }
  }

  Future<void> _export() async {
    if (_busy || widget.isCurrent?.call()==false) return;
    final epoch = ++_epoch;
    final repository = widget.repository;
    final unitId = widget.unitId;
    final receipt = widget.receipt;
    bool current() => mounted && epoch == _epoch && identical(repository, widget.repository) && unitId == widget.unitId && widget.isCurrent?.call()!=false;
    setState(() => _busy = true);
    final strings = AaraagateStrings.device();
    final timer = Stopwatch()..start();
    try {
      late List<List<Object?>> rows;
      if (receipt != null) {
        rows = receiptExportRows(receipt);
      } else {
        if (unitId == null || unitId.isEmpty) return;
        final now = DateTime.now().toUtc().add(const Duration(hours:5,minutes:30));
        final range = await showDateRangePicker(context: context, firstDate: DateTime(now.year - 10), lastDate: now,
          helpText: '${strings.text('billingExportStatement')} · IST', initialDateRange: DateTimeRange(start: DateTime(now.year, now.month, 1), end: now));
        if (range == null || !current()) {
          repository.recordJourney('FINANCE_EXPORT','CANCELLED',timer.elapsedMilliseconds).ignore();
          return;
        }
        final days = DateTime.utc(range.end.year, range.end.month, range.end.day).difference(DateTime.utc(range.start.year, range.start.month, range.start.day)).inDays;
        if (days > 365) throw StateError('period');
        String day(DateTime value) => '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
        final statement = await repository.maintenanceStatement(unitId: unitId, from: day(range.start), to: day(range.end));
        if (!current()) return;
        rows = statementExportRows(statement);
      }
      if (!current()) return;
      final box = context.findRenderObject() as RenderBox?;
      final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
      final result = await (widget.share ?? SharePlus.instance.share)(ShareParams(files: [XFile.fromData(financeCsv(rows), mimeType: 'text/csv')],
        fileNameOverrides: [receipt != null ? 'Aaraagate-receipt.csv' : 'Aaraagate-maintenance-statement.csv'], sharePositionOrigin: origin));
      repository.recordJourney('FINANCE_EXPORT',result.status==ShareResultStatus.success?'SUCCEEDED':result.status==ShareResultStatus.dismissed?'CANCELLED':'UNCONFIRMED',timer.elapsedMilliseconds).ignore();
    } catch (_) {
      repository.recordJourney('FINANCE_EXPORT','FAILED',timer.elapsedMilliseconds).ignore();
      if (current()) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(strings.text('billingExportFailed'))));
    } finally {
      if (current()) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: _busy || (widget.receipt == null && (widget.unitId == null || widget.unitId!.isEmpty)) ? null : _export,
    icon: const Icon(Icons.ios_share_outlined),
    label: Text(AaraagateStrings.device().text(_busy ? 'billingExportPreparing' : widget.receipt != null ? 'billingExportReceipt' : 'billingExportStatement')),
  );
}
