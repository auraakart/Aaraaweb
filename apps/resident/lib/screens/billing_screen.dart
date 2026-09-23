import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../data/resident_repository.dart';
import '../data/utility_billing_repository_extension.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

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
  Map<String, dynamic>? financeSummary;
  bool loading = true;
  String? error;
  String? payingInvoiceId;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final result = await Future.wait([widget.repository.maintenanceInvoices(), widget.repository.maintenancePayments()]);
      final selected = widget.activeUnitId;
      Map<String, dynamic>? summaryResult;
      try {
        summaryResult = await widget.repository.maintenanceSummary(unitId: selected);
      } catch (_) {
        summaryResult = null;
      }
      List<Map<String, dynamic>> utilityResult = const [];
      try {
        utilityResult = await widget.repository.issuedUtilityCharges();
      } catch (_) {
        utilityResult = const [];
      }
      final scopedInvoices = selected == null ? result[0] : result[0].where((invoice) => invoice['unitId']?.toString() == selected).toList(growable: false);
      final invoiceIds = scopedInvoices.map((invoice) => invoice['id']?.toString()).whereType<String>().toSet();
      final scopedPayments = selected == null ? result[1] : result[1].where((payment) => invoiceIds.contains(payment['invoiceId']?.toString())).toList(growable: false);
      final scopedUtilityCharges = selected == null ? utilityResult : utilityResult.where((charge) => charge['unitId']?.toString() == selected).toList(growable: false);
      if (mounted) setState(() { invoices = scopedInvoices; payments = scopedPayments; utilityCharges = scopedUtilityCharges; financeSummary = summaryResult; });
    } on ApiException catch (exception) {
      if (mounted) setState(() => error = exception.statusCode == 403 ? 'Maintenance billing is available only to verified owners and current tenants.' : 'Your billing details could not be loaded.');
    } catch (_) {
      if (mounted) setState(() => error = 'Your billing details could not be loaded.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _showReceipt(Map<String, dynamic> payment) async {
    setState(() => error = null);
    try {
      final receipt = await widget.repository.maintenanceReceipt(payment['id'].toString());
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        useSafeArea: true,
        builder: (sheetContext) {
          final theme = Theme.of(sheetContext);
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space1, AaraagateTokens.pageGutter, AaraagateTokens.space6),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(width: AaraagateTokens.iconContainer, height: AaraagateTokens.iconContainer, decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl)), child: Icon(Icons.receipt_long_outlined, color: theme.colorScheme.onPrimaryContainer)),
                const SizedBox(width: AaraagateTokens.space3),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Receipt ${receipt['receiptNumber'] ?? ''}', style: theme.textTheme.titleLarge),
                  Text('Server-verified payment', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                ])),
              ]),
              const SizedBox(height: AaraagateTokens.space5),
              Text(_money((receipt['amountPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.headlineMedium),
              const SizedBox(height: AaraagateTokens.space2),
              Text('${receipt['societyName']}\n${receipt['buildingName']} · ${receipt['unitNumber']}\nInvoice ${receipt['invoiceNumber']}\n${receipt['status']}', style: theme.textTheme.bodyMedium?.copyWith(height: 1.5)),
              const SizedBox(height: AaraagateTokens.space5),
              SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(sheetContext), child: const Text('Done'))),
            ]),
          );
        },
      );
    } catch (_) {
      if (mounted) setState(() => error = 'The verified receipt could not be loaded. Please retry.');
    }
  }

  Future<void> _preparePayment(Map<String, dynamic> invoice) async {
    final id = invoice['id'].toString();
    if (widget.activeUnitId != null && invoice['unitId']?.toString() != widget.activeUnitId) {
      setState(() => error = 'This invoice is outside the active property context.');
      return;
    }
    setState(() { payingInvoiceId = id; error = null; });
    try {
      final order = await widget.repository.createMaintenancePayment(invoiceId: id, idempotencyKey: 'resident-${DateTime.now().microsecondsSinceEpoch}-$id');
      if (!mounted) return;
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
              Text('Secure payment order ready', textAlign: TextAlign.center, style: theme.textTheme.titleLarge),
              const SizedBox(height: AaraagateTokens.space2),
              Text('Reference ${order['providerOrderId'] ?? order['id']}. No payment is marked successful until the gateway confirms it.', textAlign: TextAlign.center, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.45)),
              const SizedBox(height: AaraagateTokens.space5),
              SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(sheetContext), child: const Text('Done'))),
            ]),
          );
        },
      );
      await _load();
    } catch (_) {
      if (mounted) setState(() => error = 'Payment preparation failed. Nothing was charged; please retry.');
    } finally {
      if (mounted) setState(() => payingInvoiceId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final outstanding = invoices.where((invoice) => invoice['status'] == 'ISSUED').toList();
    final recoveryPayments = payments.where((payment) { final status = payment['status']?.toString(); return status == 'CREATED' || status == 'AUTHORIZED' || status == 'FAILED'; }).toList();
    final completedPayments = payments.where((payment) => payment['status'] == 'CAPTURED' || payment['status'] == 'REFUNDED').toList();
    outstanding.sort((a, b) => (DateTime.tryParse(a['dueDate']?.toString() ?? '') ?? DateTime(9999)).compareTo(DateTime.tryParse(b['dueDate']?.toString() ?? '') ?? DateTime(9999)));

    return Scaffold(
      appBar: AppBar(title: const Text('Maintenance & payments')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space3, AaraagateTokens.pageGutter, AaraagateTokens.space8),
          children: [
            if (loading)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading billing and payment details…', loading: true)
            else if (error != null)
              AppStateCard(icon: Icons.lock_outline_rounded, message: error!, actionLabel: 'Retry', onAction: _load)
            else if (invoices.isEmpty && utilityCharges.isEmpty)
              const AppStateCard(icon: Icons.receipt_long_outlined, message: 'No bills are available for this property.')
            else ...[
              _SummaryCard(outstanding: outstanding, summary: financeSummary),
              if (outstanding.isNotEmpty) ...[
                const SizedBox(height: AaraagateTokens.space5),
                PremiumSectionHeader(
                  title: 'Outstanding',
                  supportingText: '${outstanding.length} bill${outstanding.length == 1 ? '' : 's'} waiting for payment.',
                ),
                const SizedBox(height: AaraagateTokens.space2),
                for (final invoice in outstanding) ...[
                  _InvoiceCard(invoice: invoice, busy: payingInvoiceId == invoice['id']?.toString(), onPay: () => _preparePayment(invoice)),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              ] else ...[
                const SizedBox(height: AaraagateTokens.space5),
                const AppStateCard(icon: Icons.check_circle_outline_rounded, message: 'You have no outstanding dues.'),
              ],
              if (recoveryPayments.isNotEmpty) ...[
                const SizedBox(height: AaraagateTokens.space5),
                const PremiumSectionHeader(
                  title: 'Payment activity',
                  supportingText: 'Pending and failed attempts remain visible until the gateway confirms the final state.',
                ),
                const SizedBox(height: AaraagateTokens.space2),
                for (final payment in recoveryPayments) ...[
                  _PaymentRecoveryCard(payment: payment),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              ],
              const SizedBox(height: AaraagateTokens.space5),
              PremiumSectionHeader(
                title: 'Payment history',
                supportingText: completedPayments.isEmpty ? 'Verified payments will appear here.' : 'Receipts are available for completed payments.',
              ),
              const SizedBox(height: AaraagateTokens.space2),
              if (completedPayments.isEmpty)
                const AppStateCard(icon: Icons.history_rounded, message: 'No completed payments yet.')
              else
                for (final payment in completedPayments) ...[
                  _PaymentCard(payment: payment, onReceipt: () => _showReceipt(payment)),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              if (utilityCharges.isNotEmpty) ...[
                const SizedBox(height: AaraagateTokens.space5),
                PremiumSectionHeader(
                  title: 'Utility usage',
                  supportingText: 'Issued meter-based charges for this property.',
                  trailing: AaraagateStatusPill(label: '${utilityCharges.length}', tone: AaraagateStatusTone.neutral),
                ),
                const SizedBox(height: AaraagateTokens.space2),
                for (final charge in utilityCharges.take(6)) ...[
                  _UtilityChargeCard(charge: charge),
                  const SizedBox(height: AaraagateTokens.space2),
                ],
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.outstanding, this.summary});
  final List<Map<String, dynamic>> outstanding;
  final Map<String, dynamic>? summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final total = outstanding.fold<int>(0, (sum, invoice) => sum + ((invoice['amountPaise'] as num?)?.toInt() ?? 0));
    final nextDue = outstanding.map((invoice) => DateTime.tryParse(invoice['dueDate']?.toString() ?? '')).whereType<DateTime>().fold<DateTime?>(null, (current, next) => current == null || next.isBefore(current) ? next : current);
    final overduePaise = (summary?['overduePaise'] as num?)?.toInt() ?? 0;
    final overdueCount = (summary?['overdueInvoiceCount'] as num?)?.toInt() ?? 0;
    final recoveryCount = (summary?['paymentRecoveryCount'] as num?)?.toInt() ?? 0;
    final policy = summary?['checkoutPolicy'] is Map ? Map<String, dynamic>.from(summary!['checkoutPolicy'] as Map) : const <String, dynamic>{};
    final detailParts=<String>[
      if(overdueCount>0) 'Overdue ${_money(overduePaise)}',
      if(nextDue!=null) 'Next due ${_date(nextDue)}',
      if(recoveryCount>0) '$recoveryCount payment follow-up${recoveryCount==1?'':'s'}',
      if(outstanding.isEmpty) 'All caught up',
    ];

    return PremiumSurface(
      elevated: true,
      color: scheme.primaryContainer.withOpacity(.55),
      padding: const EdgeInsets.all(AaraagateTokens.space5),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('Total outstanding', style: theme.textTheme.labelLarge?.copyWith(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w700))),
          Tooltip(
            message: policy['explanation']?.toString() ?? 'Payments are verified by the server before a bill is marked paid.',
            child:AaraagateStatusPill(
              label: outstanding.isEmpty ? 'Paid up' : '${outstanding.length} due',
              tone: outstanding.isEmpty ? AaraagateStatusTone.success : AaraagateStatusTone.warning,
            ),
          ),
        ]),
        const SizedBox(height: AaraagateTokens.space2),
        Text(_money(total), style: theme.textTheme.headlineMedium?.copyWith(color: scheme.onPrimaryContainer)),
        const SizedBox(height: AaraagateTokens.space1),
        Text(
          detailParts.join(' · '),
          maxLines:1,
          overflow:TextOverflow.ellipsis,
          style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onPrimaryContainer.withOpacity(.82)),
        ),
      ]),
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
      decoration: BoxDecoration(color: scheme.surfaceContainerHighest.withOpacity(.65), borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
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
    const SizedBox(height: 2),
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

    return PremiumSurface(
      color: scheme.surface,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('${invoice['buildingName'] ?? 'Building'} · ${invoice['unitNumber'] ?? 'Unit'}', style: theme.textTheme.titleSmall)),
          AaraagateStatusPill(
            label: overdue ? 'OVERDUE' : 'DUE',
            tone: overdue ? AaraagateStatusTone.danger : AaraagateStatusTone.warning,
          ),
        ]),
        const SizedBox(height: AaraagateTokens.space2),
        Text(_money((invoice['amountPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.headlineSmall),
        const SizedBox(height: AaraagateTokens.space1),
        Text('${invoice['billingPeriod'] ?? ''}${due == null ? '' : ' · Due ${_date(due)}'}', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
        if (description.isNotEmpty) ...[
          const SizedBox(height: AaraagateTokens.space2),
          Text(description, style: theme.textTheme.bodyMedium),
        ],
        const SizedBox(height: AaraagateTokens.space4),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: busy ? null : onPay,
            icon: Icon(busy ? Icons.hourglass_top_rounded : Icons.lock_outline_rounded),
            label: Text(busy ? 'Preparing payment…' : 'Pay securely'),
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
    final message = failed
        ? 'Payment was not confirmed. Retry from the outstanding bill; no successful receipt is available.'
        : authorized
            ? 'Gateway authorization received. Waiting for captured confirmation before marking the bill paid.'
            : 'Payment order created. Complete the gateway step; no amount is treated as paid yet.';
    return PremiumSurface(
      color: failed ? scheme.errorContainer.withOpacity(.45) : scheme.surfaceContainerLow,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(failed ? Icons.error_outline_rounded : Icons.schedule_rounded, color: failed ? scheme.error : scheme.primary),
        const SizedBox(width: AaraagateTokens.space3),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(_money((payment['amountPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.titleSmall)),
            AaraagateStatusPill(label: status, tone: failed ? AaraagateStatusTone.danger : AaraagateStatusTone.warning),
          ]),
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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return PremiumSurface(
      color: scheme.surfaceContainerLow,
      padding: EdgeInsets.zero,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: AaraagateTokens.space4, vertical: AaraagateTokens.space1),
        leading: Container(width: 42, height: 42, decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)), child: Icon(Icons.check_rounded, color: scheme.onPrimaryContainer)),
        title: Text(_money((payment['amountPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.titleSmall),
        subtitle: Text('${payment['buildingName']} · ${payment['unitNumber']}\nInvoice ${payment['invoiceNumber']}'),
        isThreeLine: true,
        trailing: TextButton(onPressed: onReceipt, child: const Text('Receipt')),
      ),
    );
  }
}

bool _isOverdueDate(DateTime due, DateTime now) {
  final dueDay = DateUtils.dateOnly(due);
  final today = DateUtils.dateOnly(now);
  return dueDay.isBefore(today);
}

String _money(int paise) => '₹${(paise / 100).toStringAsFixed(2)}';
String _date(DateTime value) => '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';