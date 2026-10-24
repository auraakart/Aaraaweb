import '../data/maintenance_receipt.dart';
import '../widgets/billing_receipt_sheet.dart';
import '../data/resident_history.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../data/resident_repository.dart';
import '../localization/aaraagate_strings.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';
import '../widgets/billing_export.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key, required this.repository, this.activeUnitId});
  final ResidentRepository repository;
  final String? activeUnitId;

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  List<Map<String, dynamic>> invoices = const [];
  List<Map<String, dynamic>> payments = const [];
  List<Map<String, dynamic>> utilityCharges = const [];
  List<Map<String, dynamic>> utilityUsage = const [];
  Map<String, dynamic>? utilityInsights;
  Map<String, dynamic>? financeSummary;
  Map<String, dynamic>? autopayPreference;
  ResidentHistoryCursor? _paymentBefore;
  ResidentHistoryCursor? _paymentNext;
  final List<ResidentHistoryCursor?> _paymentPrevious = [];
  int _loadEpoch = 0;
  int _contextEpoch = 0;
  final Map<String,int> _preparationAttempts = {};
  bool autopayBusy = false;
  String? autopayError;
  bool loading = true;
  String? error;
  String? payingInvoiceId;
  final Map<String, String> _paymentAttemptKeys = <String, String>{};

  @override
  void initState() { super.initState(); _load(); }

  @override
  void didUpdateWidget(covariant BillingScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.repository, widget.repository) || oldWidget.activeUnitId != widget.activeUnitId) {
      _contextEpoch++; _paymentAttemptKeys.clear(); _preparationAttempts.clear(); payingInvoiceId=null;
      _paymentBefore=null; _paymentNext=null; _paymentPrevious.clear(); payments=const []; invoices=const []; _load();
    }
  }

  Future<void> _load() async {
    final repository=widget.repository;
    final selected=widget.activeUnitId;
    final epoch=++_loadEpoch;
    bool current()=>mounted && epoch==_loadEpoch && identical(repository,widget.repository) && selected==widget.activeUnitId;
    setState(() { loading = true; error = null; autopayError = null; });
    try {
      final result = await Future.wait([repository.maintenanceInvoices(), repository.maintenancePaymentHistory(unitId:selected,before:_paymentBefore)]);
      final paymentPage = ResidentHistoryPage(result[1]);
      Map<String, dynamic>? summaryResult;
      try {
        summaryResult = await repository.maintenanceSummary(unitId: selected);
      } catch (_) {
        summaryResult = null;
      }
      Map<String, dynamic>? autopayResult;
      if (selected != null && selected.isNotEmpty) {
        try {
          autopayResult = await repository.autopayPreference(unitId: selected);
        } catch (_) {
          autopayResult = null;
        }
      }
      List<Map<String, dynamic>> utilityResult = const [];
      try {
        utilityResult = await repository.issuedUtilityCharges();
      } catch (_) {
        utilityResult = const [];
      }
      List<Map<String, dynamic>> utilityUsageResult = const [];
      try {
        utilityUsageResult = await repository.utilityUsageHistory(unitId: selected);
      } catch (_) {
        utilityUsageResult = const [];
      }
      Map<String, dynamic>? utilityInsightResult;
      try {
        utilityInsightResult = await repository.utilityInsights(unitId: selected);
      } catch (_) {
        utilityInsightResult = null;
      }
      final scopedInvoices = selected == null ? result[0] : result[0].where((invoice) => invoice['unitId']?.toString() == selected).toList(growable: false);
      final invoiceIds = scopedInvoices.map((invoice) => invoice['id']?.toString()).whereType<String>().toSet();
      final scopedPayments = selected == null ? paymentPage.items : paymentPage.items.where((payment) => invoiceIds.contains(payment['invoiceId']?.toString())).toList(growable: false);
      final scopedUtilityCharges = selected == null ? utilityResult : utilityResult.where((charge) => charge['unitId']?.toString() == selected).toList(growable: false);
      final payableInvoiceIds = scopedInvoices.where((invoice) => invoice['status'] == 'ISSUED').map((invoice) => invoice['id']?.toString()).whereType<String>().toSet();
      _paymentAttemptKeys.removeWhere((invoiceId, _) => !payableInvoiceIds.contains(invoiceId));
      if (current()) setState(() { _paymentNext=paymentPage.next; invoices = scopedInvoices; payments = scopedPayments; utilityCharges = scopedUtilityCharges; utilityUsage = utilityUsageResult; utilityInsights = utilityInsightResult; financeSummary = summaryResult; autopayPreference = autopayResult; });
    } on ApiException catch (exception) {
      if (current()) setState(() => error = exception.statusCode == 403 ? AaraagateStrings.device().text('billingLoadDenied') : AaraagateStrings.device().text('billingLoadFailed'));
    } catch (_) {
      if (current()) setState(() => error = AaraagateStrings.device().text('billingLoadFailed'));
    } finally {
      if (current()) setState(() => loading = false);
    }
  }

  Future<void> _toggleAutopay(bool enabled) async {
    final unitId = widget.activeUnitId;
    if (unitId == null || unitId.isEmpty || autopayBusy) return;
    final current = autopayPreference ?? const <String, dynamic>{};
    final maxAmount = (current['maxAmountPaise'] as num?)?.toInt();
    final debitDays = (current['debitDaysBefore'] as num?)?.toInt() ?? 1;
    setState(() { autopayBusy = true; autopayError = null; });
    try {
      final updated = await widget.repository.saveAutopayPreference(
        unitId: unitId,
        enabled: enabled,
        maxAmountPaise: maxAmount,
        debitDaysBefore: debitDays,
      );
      if (!mounted) return;
      setState(() => autopayPreference = updated);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(enabled
            ? 'AutoPay preference saved. Automatic debit is not active until a provider mandate is connected.'
            : 'AutoPay preference turned off.'),
      ));
    } catch (_) {
      Map<String, dynamic>? refreshed;
      try {
        refreshed = await widget.repository.autopayPreference(unitId: unitId);
      } catch (_) {
        refreshed = null;
      }
      if (!mounted) return;

      if (refreshed != null) {
        setState(() => autopayPreference = refreshed);
      }
      final refreshedMax = (refreshed?['maxAmountPaise'] as num?)?.toInt();
      final refreshedDays = (refreshed?['debitDaysBefore'] as num?)?.toInt() ?? 1;
      final recovered = refreshed != null &&
          refreshed['enabled'] == enabled &&
          refreshedMax == maxAmount &&
          refreshedDays == debitDays;

      if (recovered) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(enabled
              ? 'AutoPay preference confirmed after reconnect. Automatic debit is not active until a provider mandate is connected.'
              : 'AutoPay preference is confirmed off after reconnect.'),
        ));
      } else {
        setState(() => autopayError = refreshed == null
            ? 'AutoPay preference could not be confirmed. Refresh Billing before retrying. No debit was attempted.'
            : 'AutoPay preference could not be confirmed. The latest server preference is shown; review it before retrying. No debit was attempted.');
      }
    } finally {
      if (mounted) setState(() => autopayBusy = false);
    }
  }

  Future<void> _showReceipt(Map<String, dynamic> payment) async {
    final repository=widget.repository;
    final selected=widget.activeUnitId;
    final epoch=_contextEpoch;
    bool current()=>mounted && epoch==_contextEpoch && identical(repository,widget.repository) && selected==widget.activeUnitId;
    setState(() => error = null);
    try {
      final receipt = MaintenanceReceipt.fromJson(await repository.maintenanceReceipt(payment['id'].toString()));
      if (!current()) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        useSafeArea: true,
        builder: (_) => BillingReceiptSheet(repository:repository,receipt:receipt,isCurrent:current),
      );
    } catch (_) {
      if (current()) setState(() => error = AaraagateStrings.device().text('billingReceiptFailed'));
    }
  }

  Future<void> _preparePayment(Map<String, dynamic> invoice) async {
    // Keep checkout single-flight, even if a callback runs before rebuild.
    if (payingInvoiceId != null) return;
    final id = invoice['id'].toString();
    if (widget.activeUnitId != null && invoice['unitId']?.toString() != widget.activeUnitId) {
      setState(() => error = AaraagateStrings.device().text('billingPropertyMismatch'));
      return;
    }
    final repository=widget.repository;
    final epoch=_contextEpoch;
    bool current()=>mounted && epoch==_contextEpoch && identical(repository,widget.repository);
    final timer=Stopwatch()..start();
    final attempt=_preparationAttempts.update(id,(value)=>value+1,ifAbsent:()=>1);
    repository.recordUsage('PAYMENT_CHECKOUT_STARTED').ignore();
    setState(() { payingInvoiceId = id; error = null; });
    try {
      final attemptKey = _paymentAttemptKeys.putIfAbsent(id, () => 'resident-${DateTime.now().microsecondsSinceEpoch}-$id');
      final order = await repository.createMaintenancePayment(invoiceId: id, idempotencyKey: attemptKey);
      repository.recordJourney('PAYMENT_PREPARATION','SUCCEEDED',timer.elapsedMilliseconds,retryCount:attempt-1).ignore();
      if (!current()) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        useSafeArea: true,
        builder: (sheetContext) {
          final theme = Theme.of(sheetContext);
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space1, AaraagateTokens.pageGutter, AaraagateTokens.space6),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 52, height: 52, decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl)), child: Icon(Icons.verified_user_outlined, color: theme.colorScheme.onPrimaryContainer)),
              const SizedBox(height: AaraagateTokens.space3),
              Text(AaraagateStrings.device().text('billingPaymentReady'), textAlign: TextAlign.center, style: theme.textTheme.titleLarge),
              const SizedBox(height: AaraagateTokens.space2),
              Text(AaraagateStrings.device().format('billingPaymentReference', {'reference': '${order['providerOrderId'] ?? order['id']}'}), textAlign: TextAlign.center, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.45)),
              const SizedBox(height: AaraagateTokens.space5),
              SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(sheetContext), child: Text(AaraagateStrings.device().text('billingDone')))),
            ]),
          );
        },
      );
      if(current()) { _paymentBefore=null; _paymentNext=null; _paymentPrevious.clear(); await _load(); }
    } catch (_) {
      repository.recordJourney('PAYMENT_PREPARATION','FAILED',timer.elapsedMilliseconds,retryCount:attempt-1).ignore();
      if (current()) setState(() => error = AaraagateStrings.device().text('billingPreparationFailed'));
    } finally {
      if (current()) setState(() => payingInvoiceId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final outstanding = invoices.where((invoice) => invoice['status'] == 'ISSUED').toList();
    final recoveryPayments = payments.where((payment) { final status = payment['status']?.toString(); return status == 'CREATED' || status == 'AUTHORIZED' || status == 'FAILED'; }).toList();
    final completedPayments = payments.where((payment) => payment['status'] == 'CAPTURED' || payment['status'] == 'REFUNDED').toList();
    outstanding.sort((a, b) => (DateTime.tryParse(a['dueDate']?.toString() ?? '') ?? DateTime(9999)).compareTo(DateTime.tryParse(b['dueDate']?.toString() ?? '') ?? DateTime(9999)));
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;
    final strings = AaraagateStrings.device();

    return Scaffold(
      appBar: AppBar(title: Text(strings.text('billingPageTitle'))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(compact ? AaraagateTokens.space4 : AaraagateTokens.pageGutter, AaraagateTokens.space3, compact ? AaraagateTokens.space4 : AaraagateTokens.pageGutter, compact ? AaraagateTokens.space6 : AaraagateTokens.space8),
          children: [
            if (loading)
              AppStateCard(icon: Icons.sync_rounded, message: strings.text('billingLoading'), loading: true)
            else if (error != null)
              AppStateCard(icon: Icons.lock_outline_rounded, message: error!, actionLabel: strings.text('billingRetry'), onAction: _load)
            else if (invoices.isEmpty && utilityCharges.isEmpty && (widget.activeUnitId == null || widget.activeUnitId!.isEmpty))
              AppStateCard(icon: Icons.receipt_long_outlined, message: strings.text('billingNoBills'))
            else ...[
              BillingExportButton(repository: widget.repository, unitId: widget.activeUnitId),
              _SummaryCard(
                outstanding: outstanding,
                summary: financeSummary,
                nextInvoice: outstanding.isEmpty ? null : outstanding.first,
                busy: outstanding.isNotEmpty &&
                    payingInvoiceId == outstanding.first['id']?.toString(),
                paymentLocked: payingInvoiceId != null,
                onPayNext: outstanding.isEmpty
                    ? null
                    : () => _preparePayment(outstanding.first),
              ),
              if (outstanding.isNotEmpty) ...[
                SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
                PremiumSectionHeader(
                  title: strings.text('billingOutstanding'),
                  supportingText: strings.languageCode == 'en'
                      ? '${outstanding.length} bill${outstanding.length == 1 ? '' : 's'} waiting for payment.'
                      : strings.format('billingOutstandingCount', {'count': outstanding.length}),
                ),
                const SizedBox(height: AaraagateTokens.space2),
                for (final invoice in outstanding) ...[
                  _InvoiceCard(
                    invoice: invoice,
                    busy: payingInvoiceId == invoice['id']?.toString(),
                    onPay: payingInvoiceId == null
                        ? () => _preparePayment(invoice)
                        : null,
                  ),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              ] else ...[
                SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
                AppStateCard(icon: Icons.check_circle_outline_rounded, message: strings.text('billingNoOutstanding')),
              ],
              if (widget.activeUnitId != null && widget.activeUnitId!.isNotEmpty) ...[
                const SizedBox(height: AaraagateTokens.space3),
                _AutopayPreferenceCard(
                  preference: autopayPreference,
                  busy: autopayBusy,
                  error: autopayError,
                  onChanged: _toggleAutopay,
                ),
              ],
              if (recoveryPayments.isNotEmpty) ...[
                SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
                PremiumSectionHeader(
                  title: strings.text('billingPaymentActivity'),
                  supportingText: strings.text('billingPaymentActivityNote'),
                ),
                const SizedBox(height: AaraagateTokens.space2),
                for (final payment in recoveryPayments) ...[
                  _PaymentRecoveryCard(payment: payment),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              ],
              SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
              PremiumSectionHeader(
                title: strings.text('billingHistory'),
                supportingText: strings.text(completedPayments.isEmpty ? 'billingHistoryEmpty' : 'billingHistoryReceipts'),
              ),
              const SizedBox(height: AaraagateTokens.space2),
              if (completedPayments.isEmpty)
                AppStateCard(icon: Icons.history_rounded, message: strings.text('billingNoCompleted'))
              else
                for (final payment in completedPayments) ...[
                  _PaymentCard(payment: payment, onReceipt: () => _showReceipt(payment)),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              Wrap(spacing:12,children:[
                if(_paymentPrevious.isNotEmpty) TextButton(onPressed:loading?null:(){_paymentBefore=_paymentPrevious.removeLast();_load();},child:Text(strings.text('historyNewer'))),
                if(_paymentNext!=null) TextButton(onPressed:loading?null:(){_paymentPrevious.add(_paymentBefore);_paymentBefore=_paymentNext;_load();},child:Text(strings.text('historyOlder'))),
              ]),
              if (utilityCharges.isNotEmpty) ...[
                SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
                PremiumSectionHeader(
                  title: strings.text('billingUtilityUsage'),
                  supportingText: strings.text('billingUtilityUsageNote'),
                  trailing: AaraagateStatusPill(label: '${utilityCharges.length}', tone: AaraagateStatusTone.neutral),
                ),
                const SizedBox(height: AaraagateTokens.space2),
                for (final charge in utilityCharges.take(6)) ...[
                  _UtilityChargeCard(charge: charge),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              ],
              if (utilityInsights != null) ...[
                SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
                _UtilityAttentionCard(insights: utilityInsights!),
              ],
              if (utilityUsage.isNotEmpty) ...[
                SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space5),
                const PremiumSectionHeader(
                  title: 'Recent meter readings',
                  supportingText: 'Consumption is derived from recorded readings; reset/replacement boundaries are not treated as normal usage.',
                ),
                const SizedBox(height: AaraagateTokens.space2),
                _UtilityUsageHistory(rows: utilityUsage),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _UtilityAttentionCard extends StatelessWidget {
  const _UtilityAttentionCard({required this.insights});
  final Map<String, dynamic> insights;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meters = insights['meters'] is List
        ? (insights['meters'] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false)
        : const <Map<String, dynamic>>[];
    final attention = (insights['attentionCount'] as num?)?.toInt() ?? 0;
    final linked = (insights['providerLinkedCount'] as num?)?.toInt() ?? 0;
    final prepaid = insights['prepaid'] is Map ? Map<String, dynamic>.from(insights['prepaid'] as Map) : const <String, dynamic>{};
    return PremiumSurface(
      padding: const EdgeInsets.all(AaraagateTokens.space4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(Icons.monitor_heart_outlined, color: theme.colorScheme.primary),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Utility attention', style: theme.textTheme.titleMedium),
            Text('Recent meter deltas compared with each meter’s own recent evidence.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ])),
        ]),
        const SizedBox(height: AaraagateTokens.space3),
        Wrap(spacing: AaraagateTokens.space2, runSpacing: AaraagateTokens.space2, children: [
          AaraagateStatusPill(label: attention > 0 ? '$attention NEED REVIEW' : 'NO HIGH-USAGE SIGNAL', tone: attention > 0 ? AaraagateStatusTone.warning : AaraagateStatusTone.success),
          AaraagateStatusPill(label: '$linked PROVIDER-LINKED', tone: AaraagateStatusTone.neutral),
        ]),
        if (meters.any((meter) => meter['attention'] == 'HIGHER_THAN_RECENT')) ...[
          const SizedBox(height: AaraagateTokens.space3),
          for (final meter in meters.where((meter) => meter['attention'] == 'HIGHER_THAN_RECENT').take(3))
            Padding(
              padding: const EdgeInsets.only(bottom: AaraagateTokens.space2),
              child: Text(
                '${meter['meterLabel'] ?? meter['meterCode'] ?? 'Meter'} · latest use is ${meter['changePercent'] ?? '?'}% above its recent baseline.',
                style: theme.textTheme.bodyMedium,
              ),
            ),
        ],
        const SizedBox(height: AaraagateTokens.space2),
        Text(insights['boundary']?.toString() ?? 'Usage attention is informational only.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.4)),
        const SizedBox(height: AaraagateTokens.space2),
        Text(prepaid['boundary']?.toString() ?? 'Prepaid balance and recharge require an authoritative provider adapter.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.4)),
      ]),
    );
  }
}

class _AutopayPreferenceCard extends StatelessWidget {
  const _AutopayPreferenceCard({
    required this.preference,
    required this.busy,
    required this.onChanged,
    this.error,
  });
  final Map<String, dynamic>? preference;
  final bool busy;
  final String? error;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = preference?['enabled'] == true;
    final automaticDebitAvailable = preference?['automaticDebitAvailable'] == true;
    final days = (preference?['debitDaysBefore'] as num?)?.toInt() ?? 1;
    final boundary = preference?['boundary']?.toString() ??
        'AutoPay preference is available for this property. Automatic debit remains inactive until a payment mandate provider is connected and confirmed.';
    return Semantics(
      container: true,
      label: 'AutoPay preference. ${enabled ? 'Enabled' : 'Disabled'}. Automatic debit ${automaticDebitAvailable ? 'available' : 'not active'}.',
      child: PremiumSurface(
        padding: const EdgeInsets.all(AaraagateTokens.space4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.autorenew_rounded, color: theme.colorScheme.primary),
            const SizedBox(width: AaraagateTokens.space3),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('AutoPay preference', style: theme.textTheme.titleMedium),
              Text('Plan recurring maintenance payments without hiding the mandate state.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ])),
            Switch(value: enabled, onChanged: busy ? null : onChanged),
          ]),
          const SizedBox(height: AaraagateTokens.space2),
          Wrap(spacing: AaraagateTokens.space2, runSpacing: AaraagateTokens.space2, children: [
            AaraagateStatusPill(label: automaticDebitAvailable ? 'MANDATE READY' : 'PREFERENCE ONLY', tone: automaticDebitAvailable ? AaraagateStatusTone.success : AaraagateStatusTone.warning),
            AaraagateStatusPill(label: '$days day${days == 1 ? '' : 's'} before due', tone: AaraagateStatusTone.neutral),
          ]),
          const SizedBox(height: AaraagateTokens.space2),
          Text(boundary, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.4)),
          if (error != null) ...[
            const SizedBox(height: AaraagateTokens.space2),
            Text(
              error!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
                height: 1.4,
              ),
            ),
          ],
          if (busy) ...[const SizedBox(height: AaraagateTokens.space2), const LinearProgressIndicator()],
        ]),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.outstanding,
    this.summary,
    this.nextInvoice,
    this.onPayNext,
    this.busy = false,
    this.paymentLocked = false,
  });
  final List<Map<String, dynamic>> outstanding;
  final Map<String, dynamic>? summary;
  final Map<String, dynamic>? nextInvoice;
  final VoidCallback? onPayNext;
  final bool busy;
  final bool paymentLocked;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final total = outstanding.fold<int>(
      0,
      (sum, invoice) => sum + ((invoice['amountPaise'] as num?)?.toInt() ?? 0),
    );
    final nextDue = outstanding
        .map((invoice) => DateTime.tryParse(invoice['dueDate']?.toString() ?? ''))
        .whereType<DateTime>()
        .fold<DateTime?>(
          null,
          (current, next) => current == null || next.isBefore(current) ? next : current,
        );
    final overduePaise = (summary?['overduePaise'] as num?)?.toInt() ?? 0;
    final overdueCount = (summary?['overdueInvoiceCount'] as num?)?.toInt() ?? 0;
    final recoveryCount = (summary?['paymentRecoveryCount'] as num?)?.toInt() ?? 0;
    final policy = summary?['checkoutPolicy'] is Map
        ? Map<String, dynamic>.from(summary!['checkoutPolicy'] as Map)
        : const <String, dynamic>{};
    final overdue = overdueCount > 0;
    final overdueAmountLabel = 'Overdue ${_money(overduePaise)}';
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;

    return PremiumSurface(
      elevated: true,
      color: scheme.surface,
      padding: EdgeInsets.all(compact ? AaraagateTokens.space4 : AaraagateTokens.space5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AaraagateTokens.space3,
            runSpacing: AaraagateTokens.space2,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                overdue ? 'Payment overdue' : 'Amount due',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: overdue ? scheme.error : scheme.onSurfaceVariant,
                ),
              ),
              Tooltip(
                message: policy['explanation']?.toString() ??
                    'Payments are verified by the server before a bill is marked paid.',
                child: AaraagateStatusPill(
                  label: outstanding.isEmpty ? 'Paid up' : '${outstanding.length} due',
                  tone: outstanding.isEmpty
                      ? AaraagateStatusTone.success
                      : overdue
                          ? AaraagateStatusTone.danger
                          : AaraagateStatusTone.warning,
                ),
              ),
            ],
          ),
          const SizedBox(height: AaraagateTokens.space2),
          Text(_money(total), style: theme.textTheme.headlineMedium),
          const SizedBox(height: AaraagateTokens.space1),
          Text(
            overdue
                ? '$overdueAmountLabel · $overdueCount bill${overdueCount == 1 ? '' : 's'}'
                : nextDue == null
                    ? 'Everything is up to date.'
                    : 'Next due ${_date(nextDue)}',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
          if (recoveryCount > 0) ...[
            const SizedBox(height: AaraagateTokens.space2),
            Text(
              '$recoveryCount payment follow-up${recoveryCount == 1 ? '' : 's'} need confirmation.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
          ],
          if (nextInvoice != null && onPayNext != null) ...[
            SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space4),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy || paymentLocked ? null : onPayNext,
                child: PremiumActionLabel(
                  label: overdue ? 'Pay overdue bill' : 'Pay next due',
                  icon: Icons.lock_outline_rounded,
                  busy: busy,
                ),
              ),
            ),
            const SizedBox(height: AaraagateTokens.space1),
            Text(
              'Pay the earliest due bill securely. Payment is confirmed by the gateway.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
                height: 1.35,
              ),
            ),
          ],
        ],
      ),
    );
  }
}


class _UtilityUsageHistory extends StatelessWidget {
  const _UtilityUsageHistory({required this.rows});
  final List<Map<String, dynamic>> rows;

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final row in rows) {
      final meterId = row['meterId']?.toString() ?? '';
      if (meterId.isEmpty) continue;
      groups.putIfAbsent(meterId, () => <Map<String, dynamic>>[]).add(row);
    }
    return Column(
      children: groups.entries.take(6).map((entry) {
        final readings = entry.value.where((row) => row['readingId'] != null).take(6).toList(growable: false);
        final first = entry.value.first;
        final label = first['meterLabel']?.toString().trim().isNotEmpty == true
            ? first['meterLabel'].toString()
            : first['meterCode']?.toString() ?? 'Utility meter';
        return Padding(
          padding: const EdgeInsets.only(bottom: AaraagateTokens.space2),
          child: PremiumSurface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.speed_outlined),
                  const SizedBox(width: AaraagateTokens.space2),
                  Expanded(child: Text(label, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800))),
                  Text(first['meterType']?.toString() ?? 'UTILITY', style: Theme.of(context).textTheme.labelSmall),
                ]),
                const SizedBox(height: AaraagateTokens.space2),
                if (readings.isEmpty)
                  const Text('No readings recorded yet.')
                else
                  ...readings.map((reading) {
                    final at = DateTime.tryParse(reading['readingAt']?.toString() ?? '');
                    final use = reading['consumptionSincePrevious']?.toString();
                    return ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(reading['readingKind'] == 'RESET' ? Icons.restart_alt_rounded : Icons.timeline_rounded),
                      title: Text('${reading['value'] ?? '—'} units'),
                      subtitle: Text(at == null ? 'Reading' : _date(at.toLocal())),
                      trailing: Text(use == null ? '—' : '+$use'),
                    );
                  }),
              ],
            ),
          ),
        );
      }).toList(growable: false),
    );
  }
}

class _UtilityChargeCard extends StatelessWidget {
  const _UtilityChargeCard({required this.charge});
  final Map<String, dynamic> charge;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final calculation = charge['calculationJson'] is Map ? Map<String, dynamic>.from(charge['calculationJson'] as Map) : const <String, dynamic>{};
    final slabs = calculation['breakdown'] is List ? (calculation['breakdown'] as List).whereType<Map>().toList(growable: false) : const <Map>[];
    final meterName = (charge['meterLabel']?.toString().trim().isNotEmpty ?? false) ? charge['meterLabel'].toString() : charge['meterCode']?.toString() ?? 'Utility meter';
    final periodStart = DateTime.tryParse(charge['periodStart']?.toString() ?? '');
    final periodEnd = DateTime.tryParse(charge['periodEnd']?.toString() ?? '');

    return PremiumSurface(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: AaraagateTokens.iconContainer, height: AaraagateTokens.iconContainer, decoration: BoxDecoration(color: scheme.tertiaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)), child: Icon(Icons.bolt_outlined, color: scheme.onTertiaryContainer)),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(meterName, style: theme.textTheme.titleSmall),
            Text('${charge['buildingName'] ?? 'Building'} · ${charge['unitNumber'] ?? 'Unit'} · ${charge['meterType'] ?? 'Utility'}', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
          ])),
          Text(_money((charge['totalPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.titleMedium),
        ]),
        const SizedBox(height: AaraagateTokens.space3),
        Wrap(spacing: AaraagateTokens.space2, runSpacing: AaraagateTokens.space2, children: [
          _MetricPill(label: 'Usage', value: '${charge['consumption'] ?? '0'} units'),
          _MetricPill(label: 'Opening', value: '${charge['openingReadingValue'] ?? '—'}'),
          _MetricPill(label: 'Closing', value: '${charge['closingReadingValue'] ?? '—'}'),
        ]),
        const SizedBox(height: AaraagateTokens.space3),
        Text(
          '${periodStart == null ? '' : _date(periodStart)}${periodStart != null && periodEnd != null ? ' – ' : ''}${periodEnd == null ? '' : _date(periodEnd)} · Tariff ${charge['tariffName'] ?? charge['tariffCode'] ?? '—'}',
          style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: AaraagateTokens.space2),
        Row(children: [
          Expanded(child: _ChargeLine(label: 'Usage charge', paise: (charge['variableChargePaise'] as num?)?.toInt() ?? 0)),
          const SizedBox(width: AaraagateTokens.space2),
          Expanded(child: _ChargeLine(label: 'Fixed charge', paise: (charge['fixedChargePaise'] as num?)?.toInt() ?? 0)),
        ]),
        if (slabs.isNotEmpty) ...[
          const SizedBox(height: AaraagateTokens.space2),
          Text('${slabs.length} tariff slab${slabs.length == 1 ? '' : 's'} applied · Invoice ${charge['invoiceNumber'] ?? ''}', style: theme.textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant)),
        ],
      ]),
    );
  }
}

class _MetricPill extends StatelessWidget {
  const _MetricPill({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(color: scheme.surfaceContainerHighest.withValues(alpha: .65), borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
      child: Text('$label · $value', style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700)),
    );
  }
}

class _ChargeLine extends StatelessWidget {
  const _ChargeLine({required this.label, required this.paise});
  final String label;
  final int paise;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
    const SizedBox(height: 4),
    Text(_money(paise), style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
  ]);
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice, this.busy = false, this.onPay});
  final Map<String, dynamic> invoice;
  final bool busy;
  final VoidCallback? onPay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final due = DateTime.tryParse(invoice['dueDate']?.toString() ?? '');
    final overdue = due != null && _isOverdueDate(due, DateTime.now());
    final description = invoice['description']?.toString() ?? '';
    final compact = MediaQuery.textScalerOf(context).scale(1) <= 1.15;

    return PremiumSurface(
      color: scheme.surface,
      padding: EdgeInsets.all(compact ? AaraagateTokens.space3 : AaraagateTokens.space4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        PremiumSectionHeader(
          title: '${invoice['buildingName'] ?? 'Building'} · ${invoice['unitNumber'] ?? 'Unit'}',
          trailing: AaraagateStatusPill(
            label: AaraagateStrings.device().text(overdue ? 'billingOverdue' : 'billingDue'),
            tone: overdue ? AaraagateStatusTone.danger : AaraagateStatusTone.warning,
          ),
        ),
        const SizedBox(height: AaraagateTokens.space2),
        Text(_money((invoice['amountPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.headlineSmall),
        const SizedBox(height: AaraagateTokens.space1),
        Text('${invoice['billingPeriod'] ?? ''}${due == null ? '' : ' · Due ${_date(due)}'}', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
        if (description.isNotEmpty) ...[
          const SizedBox(height: AaraagateTokens.space2),
          Text(description, style: theme.textTheme.bodyMedium),
        ],
        SizedBox(height: compact ? AaraagateTokens.space3 : AaraagateTokens.space4),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: busy ? null : onPay,
            child: PremiumActionLabel(
              label: AaraagateStrings.device().text('billingPaySecurely'),
              icon: Icons.lock_outline_rounded,
              busy: busy,
            ),
          ),
        ),
      ]),
    );
  }
}

class _PaymentRecoveryCard extends StatelessWidget {
  const _PaymentRecoveryCard({required this.payment});
  final Map<String, dynamic> payment;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final status = payment['status']?.toString() ?? 'CREATED';
    final failed = status == 'FAILED';
    final authorized = status == 'AUTHORIZED';
    final message = AaraagateStrings.device().text(failed ? 'billingPendingFailed' : authorized ? 'billingPendingAuthorized' : 'billingPendingCreated');
    return PremiumSurface(
      color: failed ? scheme.errorContainer.withValues(alpha: .45) : scheme.surfaceContainerLow,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(failed ? Icons.error_outline_rounded : Icons.schedule_rounded, color: failed ? scheme.error : scheme.primary),
        const SizedBox(width: AaraagateTokens.space3),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          PremiumSectionHeader(
            title: _money((payment['amountPaise'] as num?)?.toInt() ?? 0),
            trailing: AaraagateStatusPill(label: AaraagateStrings.device().text('status$status'), tone: failed ? AaraagateStatusTone.danger : AaraagateStatusTone.warning),
          ),
          const SizedBox(height: AaraagateTokens.space1),
          Text(message, style: theme.textTheme.bodySmall?.copyWith(color: failed ? scheme.onErrorContainer : scheme.onSurfaceVariant)),
        ])),
      ]),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.payment, required this.onReceipt});
  final Map<String, dynamic> payment;
  final VoidCallback onReceipt;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PremiumSurface(
      onTap: onReceipt,
      semanticLabel: AaraagateStrings.device().format('billingReceiptReference', {'reference':payment['invoiceNumber'] ?? ''}),
      color: scheme.surfaceContainerLow,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        PremiumIdentityHeader(
          icon: Icons.receipt_long_outlined,
          title: _money((payment['amountPaise'] as num?)?.toInt() ?? 0),
          supportingText: '${payment['buildingName']} · ${payment['unitNumber']}\nInvoice ${payment['invoiceNumber']}',
        ),
        const SizedBox(height: AaraagateTokens.space3),
        Row(children: [
          Text(AaraagateStrings.device().format('billingReceiptReference', {'reference':''}).trim(), style: Theme.of(context).textTheme.labelLarge?.copyWith(color: scheme.onSurface)),
          const SizedBox(width: AaraagateTokens.space1),
          Icon(Icons.chevron_right_rounded, color: scheme.onSurfaceVariant),
        ]),
      ]),
    );
  }
}

bool _isOverdueDate(DateTime due, DateTime now) {
  final dueDay = DateUtils.dateOnly(due);
  final today = DateUtils.dateOnly(now);
  return dueDay.isBefore(today);
}

String _money(int paise) {
  final rupees = paise / 100;
  return paise % 100 == 0 ? '₹${rupees.toStringAsFixed(0)}' : '₹${rupees.toStringAsFixed(2)}';
}
String _date(DateTime value) => '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
