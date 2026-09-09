import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../widgets/app_state_card.dart';

class UpdatesScreen extends StatelessWidget {
  const UpdatesScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final items = _items();
        return Scaffold(
          appBar: AppBar(title: const Text('Updates')),
          body: RefreshIndicator(
            onRefresh: controller.load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                Text('Your society and home activity in one place.', style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 16),
                if (_hasErrors())
                  const AppStateCard(
                    icon: Icons.sync_problem_outlined,
                    message: 'Some updates could not be refreshed. Pull down to try again.',
                  ),
                if (_hasErrors()) const SizedBox(height: 12),
                if (controller.loading && items.isEmpty)
                  const AppStateCard(icon: Icons.sync_rounded, message: 'Loading updates…', loading: true)
                else if (items.isEmpty)
                  const AppStateCard(icon: Icons.notifications_none_rounded, message: 'No updates for this property yet.')
                else
                  for (final item in items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          leading: CircleAvatar(child: Icon(item.icon)),
                          title: Text(item.title, style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text(item.subtitle),
                          trailing: item.when == null ? null : Text(_dateLabel(item.when!), style: Theme.of(context).textTheme.labelSmall),
                        ),
                      ),
                    ),
              ],
            ),
          ),
        );
      },
    );
  }

  bool _hasErrors() => controller.noticesError != null || controller.accessError != null || controller.servicesError != null || controller.billingError != null;

  List<_UpdateItem> _items() {
    final items = <_UpdateItem>[];

    if (controller.hasFeature('NOTICES')) {
      for (final notice in controller.notices) {
        items.add(_UpdateItem(
          icon: Icons.campaign_outlined,
          title: notice['title']?.toString() ?? 'Society notice',
          subtitle: _firstText([notice['category'], notice['body'], 'Society update']),
          when: _date(notice, ['publishedAt', 'createdAt', 'startsAt']),
        ));
      }
    }

    if (controller.hasActiveProperty) {
      for (final request in controller.accessRequests) {
        final type = _friendly(request['subjectType']?.toString() ?? 'Access');
        final name = request['subjectName']?.toString() ?? type;
        final status = _friendly(request['status']?.toString() ?? 'Updated');
        items.add(_UpdateItem(
          icon: _accessIcon(request['subjectType']?.toString()),
          title: '$name · $status',
          subtitle: '$type access',
          when: _date(request, ['updatedAt', 'createdAt', 'validFrom']),
        ));
      }

      if (controller.hasFeature('HOUSEHOLD_SERVICES')) {
        for (final booking in controller.bookings) {
          final offering = booking['offering'];
          final service = offering is Map ? offering['name']?.toString() : null;
          items.add(_UpdateItem(
            icon: Icons.home_repair_service_outlined,
            title: service?.isNotEmpty == true ? service! : 'Home service',
            subtitle: 'Booking ${_friendly(booking['status']?.toString() ?? 'updated').toLowerCase()}',
            when: _date(booking, ['updatedAt', 'createdAt', 'scheduledStart']),
          ));
        }
      }

      if (controller.hasFeature('MAINTENANCE_BILLING')) {
        for (final invoice in controller.maintenanceInvoices) {
          final amount = _amount(invoice);
          final due = _date(invoice, ['dueDate', 'dueAt']);
          items.add(_UpdateItem(
            icon: Icons.receipt_long_outlined,
            title: 'Maintenance due${amount == null ? '' : ' · $amount'}',
            subtitle: due == null ? 'Payment pending for this property' : 'Due ${_dateLabel(due)}',
            when: _date(invoice, ['issuedAt', 'createdAt', 'dueDate']),
          ));
        }
      }
    }

    items.sort((a, b) {
      if (a.when == null && b.when == null) return 0;
      if (a.when == null) return 1;
      if (b.when == null) return -1;
      return b.when!.compareTo(a.when!);
    });
    return items;
  }

  static DateTime? _date(Map<String, dynamic> row, List<String> keys) {
    for (final key in keys) {
      final value = row[key]?.toString();
      if (value == null || value.isEmpty) continue;
      final parsed = DateTime.tryParse(value);
      if (parsed != null) return parsed.toLocal();
    }
    return null;
  }

  static String _firstText(List<Object?> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty) return _friendly(text);
    }
    return 'Update';
  }

  static String _friendly(String value) {
    final words = value.replaceAll('_', ' ').trim().toLowerCase().split(RegExp(r'\s+'));
    return words.where((word) => word.isNotEmpty).map((word) => '${word[0].toUpperCase()}${word.substring(1)}').join(' ');
  }

  static String _dateLabel(DateTime value) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(value.year, value.month, value.day);
    if (day == today) return 'Today';
    if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
    return '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
  }

  static String? _amount(Map<String, dynamic> invoice) {
    final paise = invoice['amountPaise'] ?? invoice['totalPaise'] ?? invoice['balancePaise'];
    if (paise is num) return '₹${(paise / 100).toStringAsFixed(2)}';
    return null;
  }

  static IconData _accessIcon(String? type) {
    switch (type) {
      case 'DELIVERY': return Icons.local_shipping_outlined;
      case 'CAB': return Icons.local_taxi_outlined;
      case 'DOMESTIC_HELP': return Icons.cleaning_services_outlined;
      case 'SERVICE_PROVIDER': return Icons.handyman_outlined;
      default: return Icons.shield_outlined;
    }
  }
}

class _UpdateItem {
  const _UpdateItem({required this.icon, required this.title, required this.subtitle, required this.when});
  final IconData icon;
  final String title;
  final String subtitle;
  final DateTime? when;
}
