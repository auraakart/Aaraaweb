import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';

class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Text('Home services', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('Verified professionals. Gate access handled by AuraGate.', style: theme.textTheme.bodyLarge),
            const SizedBox(height: 18),
            const TextField(decoration: InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'What do you need help with?')),
            const SizedBox(height: 24),
            if (controller.loading && controller.serviceCategories.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (controller.servicesError != null)
              Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [const Icon(Icons.lock_outline_rounded, size: 34), const SizedBox(height: 10), const Text('Services are unavailable for this society or could not be loaded.', textAlign: TextAlign.center), const SizedBox(height: 8), TextButton(onPressed: controller.load, child: const Text('Retry'))])))
            else ...[
              Text('Categories', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.serviceCategories.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No service categories are available yet.')))
              else
                Wrap(spacing: 8, runSpacing: 8, children: [for (final category in controller.serviceCategories) Chip(label: Text(category['name']?.toString() ?? 'Service'))]),
              const SizedBox(height: 24),
              Text('Available services', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.serviceOfferings.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No approved provider offerings are available yet.')))
              else
                ...controller.serviceOfferings.map((offering) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(16),
                          leading: const CircleAvatar(child: Icon(Icons.home_repair_service_outlined)),
                          title: Text(offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text(offering['description']?.toString() ?? 'Verified service provider'),
                          trailing: Text(_price(offering['pricePaise']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                      ),
                    )),
              const SizedBox(height: 24),
              Text('Your bookings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (controller.bookings.isEmpty)
                const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('You have no service bookings yet.')))
              else
                ...controller.bookings.map((booking) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(16),
                          leading: const CircleAvatar(child: Icon(Icons.event_available_outlined)),
                          title: Text(booking['status']?.toString() ?? 'Booking', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('Scheduled ${booking['scheduledFrom'] ?? ''}\nGate access is linked after confirmation.'),
                          isThreeLine: true,
                        ),
                      ),
                    )),
            ],
          ],
        ),
      ),
    );
  }

  static String _price(dynamic paise) {
    final amount = paise is num ? paise / 100 : 0;
    return '₹${amount.toStringAsFixed(amount.truncateToDouble() == amount ? 0 : 2)}';
  }
}
