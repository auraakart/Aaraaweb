import 'package:flutter/material.dart';
import '../data/api_client.dart';
import '../data/resident_repository.dart';
import '../widgets/app_state_card.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key, required this.repository});
  final ResidentRepository repository;

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
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final result = await Future.wait([
        widget.repository.maintenanceInvoices(),
        widget.repository.maintenancePayments(),
      ]);
      if (mounted) setState(() { invoices = result[0]; payments = result[1]; });
    } on ApiException catch (exception) {
      if (mounted) setState(() => error = exception.statusCode == 403
          ? 'Maintenance billing is available only to verified owners and current tenants.'
          : 'Your maintenance invoices could not be loaded.');
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
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.receipt_long_outlined),
          title: Text('Receipt ${receipt['receiptNumber']}'),
          content: Text('${receipt['societyName']}\n${receipt['buildingName']} · ${receipt['unitNumber']}\nInvoice ${receipt['invoiceNumber']}\n${_money((receipt['amountPaise'] as num?)?.toInt() ?? 0)} · ${receipt['status']}'),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
        ),
      );
    } catch (_) {
      if (mounted) setState(() => error = 'The verified receipt could not be loaded. Please retry.');
    }
  }

  Future<void> _preparePayment(Map<String, dynamic> invoice) async {
    final id = invoice['id'].toString();
    setState(() { payingInvoiceId = id; error = null; });
    try {
      final order = await widget.repository.createMaintenancePayment(
        invoiceId: id,
        idempotencyKey: 'resident-${DateTime.now().microsecondsSinceEpoch}-$id',
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.verified_user_outlined),
          title: const Text('Secure payment order ready'),
          content: Text('Reference ${order['providerOrderId'] ?? order['id']}. No payment is marked successful until the gateway confirms it.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
        ),
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
    final completedPayments = payments.where((payment) => payment['status'] == 'CAPTURED' || payment['status'] == 'REFUNDED').toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Maintenance & payments')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          children: [
            if (loading)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading maintenance and payment details…', loading: true)
            else if (error != null)
              AppStateCard(icon: Icons.lock_outline_rounded, message: error!, actionLabel: 'Retry', onAction: () { _load(); })
            else if (invoices.isEmpty)
              const AppStateCard(icon: Icons.receipt_long_outlined, message: 'No maintenance invoices are available.')
            else ...[
              _SummaryCard(outstanding: outstanding),
              const SizedBox(height: 22),
              Text('Outstanding', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              if (outstanding.isEmpty)
                const AppStateCard(icon: Icons.check_circle_outline_rounded, message: 'You have no outstanding maintenance dues.'),
              for (final invoice in outstanding) _InvoiceCard(invoice: invoice, busy: payingInvoiceId == invoice['id'], onPay: () => _preparePayment(invoice)),
              const SizedBox(height: 22),
              Text('Payment history', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              if (completedPayments.isEmpty)
                const AppStateCard(icon: Icons.history_rounded, message: 'No completed payments yet.'),
              for (final payment in completedPayments) _PaymentCard(payment: payment, onReceipt: () => _showReceipt(payment)),
            ],
          ],
        ),
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.payment, required this.onReceipt});
  final Map<String, dynamic> payment;
  final VoidCallback onReceipt;
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      title: Text(_money((payment['amountPaise'] as num?)?.toInt() ?? 0), style: const TextStyle(fontWeight: FontWeight.w900)),
      subtitle: Text('${payment['buildingName']} · ${payment['unitNumber']}\nInvoice ${payment['invoiceNumber']}'),
      isThreeLine: true,
      trailing: TextButton.icon(onPressed: onReceipt, icon: const Icon(Icons.receipt_long_outlined), label: const Text('Receipt')),
    ),
  );
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.outstanding});
  final List<Map<String, dynamic>> outstanding;
  @override
  Widget build(BuildContext context) {
    final total = outstanding.fold<int>(0, (sum, invoice) => sum + ((invoice['amountPaise'] as num?)?.toInt() ?? 0));
    return Card(child: Padding(padding: const EdgeInsets.all(20), child: Row(children: [CircleAvatar(radius: 25, child: const Icon(Icons.account_balance_wallet_outlined)), const SizedBox(width: 16), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('Total outstanding'), const SizedBox(height: 4), Text(_money(total), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)), Text('${outstanding.length} invoice${outstanding.length == 1 ? '' : 's'}')]))])));
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice, this.busy = false, this.onPay});
  final Map<String, dynamic> invoice;
  final bool busy;
  final VoidCallback? onPay;
  @override
  Widget build(BuildContext context) {
    final paid = invoice['status'] == 'PAID';
    final due = DateTime.tryParse(invoice['dueDate']?.toString() ?? '');
    return Card(margin: const EdgeInsets.only(bottom: 10), child: Padding(padding: const EdgeInsets.all(17), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Expanded(child: Text('${invoice['buildingName'] ?? 'Building'} · ${invoice['unitNumber'] ?? 'Unit'}', style: const TextStyle(fontWeight: FontWeight.w800))), Chip(label: Text(paid ? 'PAID' : 'DUE'))]), const SizedBox(height: 8), Text(_money((invoice['amountPaise'] as num?)?.toInt() ?? 0), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)), Text('${invoice['billingPeriod'] ?? ''} · ${paid ? 'Receipt' : 'Due'} ${due == null ? '' : _date(due)}'), if ((invoice['description']?.toString() ?? '').isNotEmpty) ...[const SizedBox(height: 7), Text(invoice['description'].toString())], const SizedBox(height: 12), if (paid) Text('Reference ${invoice['invoiceNumber']}', style: Theme.of(context).textTheme.labelMedium) else SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: busy ? null : onPay, icon: const Icon(Icons.lock_outline_rounded), label: Text(busy ? 'Preparing…' : 'Pay securely')))])));
  }
}

String _money(int paise) => '₹${(paise / 100).toStringAsFixed(2)}';
String _date(DateTime value) => '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
