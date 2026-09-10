import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../data/resident_repository.dart';
import '../widgets/app_state_card.dart';

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
      final scopedInvoices = selected == null ? result[0] : result[0].where((invoice) => invoice['unitId']?.toString() == selected).toList(growable: false);
      final invoiceIds = scopedInvoices.map((invoice) => invoice['id']?.toString()).whereType<String>().toSet();
      final scopedPayments = selected == null ? result[1] : result[1].where((payment) => invoiceIds.contains(payment['invoiceId']?.toString())).toList(growable: false);
      if (mounted) setState(() { invoices = scopedInvoices; payments = scopedPayments; });
    } on ApiException catch (exception) {
      if (mounted) setState(() => error = exception.statusCode == 403 ? 'Maintenance billing is available only to verified owners and current tenants.' : 'Your maintenance invoices could not be loaded.');
    } catch (_) {
      if (mounted) setState(() => error = 'Your maintenance invoices could not be loaded.');
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
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(width: 48, height: 48, decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(16)), child: Icon(Icons.receipt_long_outlined, color: theme.colorScheme.onPrimaryContainer)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Receipt ${receipt['receiptNumber'] ?? ''}', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                  Text('Server-verified payment', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                ])),
              ]),
              const SizedBox(height: 20),
              Text(_money((receipt['amountPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Text('${receipt['societyName']}\n${receipt['buildingName']} · ${receipt['unitNumber']}\nInvoice ${receipt['invoiceNumber']}\n${receipt['status']}', style: theme.textTheme.bodyMedium?.copyWith(height: 1.5)),
              const SizedBox(height: 20),
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
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 52, height: 52, decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(18)), child: Icon(Icons.verified_user_outlined, color: theme.colorScheme.onPrimaryContainer)),
              const SizedBox(height: 14),
              Text('Secure payment order ready', textAlign: TextAlign.center, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Text('Reference ${order['providerOrderId'] ?? order['id']}. No payment is marked successful until the gateway confirms it.', textAlign: TextAlign.center, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.45)),
              const SizedBox(height: 20),
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
    final theme = Theme.of(context);
    final outstanding = invoices.where((invoice) => invoice['status'] == 'ISSUED').toList();
    final completedPayments = payments.where((payment) => payment['status'] == 'CAPTURED' || payment['status'] == 'REFUNDED').toList();
    outstanding.sort((a, b) => (DateTime.tryParse(a['dueDate']?.toString() ?? '') ?? DateTime(9999)).compareTo(DateTime.tryParse(b['dueDate']?.toString() ?? '') ?? DateTime(9999)));

    return Scaffold(
      appBar: AppBar(title: const Text('Maintenance & payments')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            if (loading)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading maintenance and payment details…', loading: true)
            else if (error != null)
              AppStateCard(icon: Icons.lock_outline_rounded, message: error!, actionLabel: 'Retry', onAction: _load)
            else if (invoices.isEmpty)
              const AppStateCard(icon: Icons.receipt_long_outlined, message: 'No maintenance invoices are available for this property.')
            else ...[
              _SummaryCard(outstanding: outstanding),
              const SizedBox(height: 26),
              Text('Outstanding', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              if (outstanding.isEmpty)
                const AppStateCard(icon: Icons.check_circle_outline_rounded, message: 'You have no outstanding maintenance dues.')
              else
                for (final invoice in outstanding) ...[
                  _InvoiceCard(invoice: invoice, busy: payingInvoiceId == invoice['id']?.toString(), onPay: () => _preparePayment(invoice)),
                  const SizedBox(height: 10),
                ],
              const SizedBox(height: 24),
              Text('Payment history', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              if (completedPayments.isEmpty)
                const AppStateCard(icon: Icons.history_rounded, message: 'No completed payments yet.')
              else
                for (final payment in completedPayments) ...[
                  _PaymentCard(payment: payment, onReceipt: () => _showReceipt(payment)),
                  const SizedBox(height: 8),
                ],
            ],
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.outstanding});
  final List<Map<String, dynamic>> outstanding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final total = outstanding.fold<int>(0, (sum, invoice) => sum + ((invoice['amountPaise'] as num?)?.toInt() ?? 0));
    final nextDue = outstanding.map((invoice) => DateTime.tryParse(invoice['dueDate']?.toString() ?? '')).whereType<DateTime>().fold<DateTime?>(null, (current, next) => current == null || next.isBefore(current) ? next : current);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: scheme.primaryContainer.withOpacity(.55), borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Total outstanding', style: theme.textTheme.labelLarge?.copyWith(color: scheme.onPrimaryContainer, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(_money(total), style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -.6)),
        const SizedBox(height: 4),
        Text(
          outstanding.isEmpty
              ? 'All caught up'
              : '${outstanding.length} bill${outstanding.length == 1 ? '' : 's'} pending${nextDue == null ? '' : ' · Next due ${_date(nextDue)}'}',
          style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onPrimaryContainer.withOpacity(.8)),
        ),
      ]),
    );
  }
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
    final overdue = due != null && due.isBefore(DateTime.now());
    final description = invoice['description']?.toString() ?? '';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: scheme.surfaceContainerLow, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('${invoice['buildingName'] ?? 'Building'} · ${invoice['unitNumber'] ?? 'Unit'}', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800))),
          _DuePill(overdue: overdue),
        ]),
        const SizedBox(height: 10),
        Text(_money((invoice['amountPaise'] as num?)?.toInt() ?? 0), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 3),
        Text('${invoice['billingPeriod'] ?? ''}${due == null ? '' : ' · Due ${_date(due)}'}', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
        if (description.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(description, style: theme.textTheme.bodyMedium),
        ],
        const SizedBox(height: 16),
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

class _DuePill extends StatelessWidget {
  const _DuePill({required this.overdue});
  final bool overdue;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(color: overdue ? scheme.errorContainer : scheme.secondaryContainer, borderRadius: BorderRadius.circular(999)),
      child: Text(overdue ? 'OVERDUE' : 'DUE', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: overdue ? scheme.onErrorContainer : scheme.onSecondaryContainer, fontWeight: FontWeight.w900)),
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
    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(18),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: Container(width: 42, height: 42, decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(14)), child: Icon(Icons.check_rounded, color: scheme.onPrimaryContainer)),
        title: Text(_money((payment['amountPaise'] as num?)?.toInt() ?? 0), style: const TextStyle(fontWeight: FontWeight.w900)),
        subtitle: Text('${payment['buildingName']} · ${payment['unitNumber']}\nInvoice ${payment['invoiceNumber']}'),
        isThreeLine: true,
        trailing: TextButton(onPressed: onReceipt, child: const Text('Receipt')),
      ),
    );
  }
}

String _money(int paise) => '₹${(paise / 100).toStringAsFixed(2)}';
String _date(DateTime value) => '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
