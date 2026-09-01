import 'package:flutter/material.dart';

class ServicesScreen extends StatelessWidget {
  const ServicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const categories = [
      (Icons.plumbing_rounded, 'Plumbing'),
      (Icons.electrical_services_rounded, 'Electrical'),
      (Icons.ac_unit_rounded, 'AC service'),
      (Icons.cleaning_services_rounded, 'Cleaning'),
      (Icons.carpenter_rounded, 'Carpentry'),
      (Icons.pest_control_rounded, 'Pest control'),
    ];
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          Text('Home services', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Verified professionals. Gate access handled by AuraGate.', style: theme.textTheme.bodyLarge),
          const SizedBox(height: 18),
          const TextField(decoration: InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'What do you need help with?')),
          const SizedBox(height: 24),
          Text('Popular services', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.08,
            children: [for (final item in categories) _Category(icon: item.$1, label: item.$2)],
          ),
          const SizedBox(height: 24),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Recommended', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)), TextButton(onPressed: () {}, child: const Text('See all'))]),
          const SizedBox(height: 8),
          const _ProviderCard(name: 'FixRight Home Services', service: 'Plumbing · Electrical', rating: '4.8', price: 'From ₹299', verified: true),
          const SizedBox(height: 10),
          const _ProviderCard(name: 'CoolCare Experts', service: 'AC service · Repair', rating: '4.7', price: 'From ₹499', verified: true),
          const SizedBox(height: 24),
          Text('Your bookings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: const CircleAvatar(child: Icon(Icons.home_repair_service_outlined)),
              title: const Text('AC service', style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: const Text('Tomorrow · 11:00 AM\nEntry pass will activate automatically'),
              isThreeLine: true,
              trailing: FilledButton.tonal(onPressed: () {}, child: const Text('View')),
            ),
          ),
        ],
      ),
    );
  }
}

class _Category extends StatelessWidget {
  const _Category({required this.icon, required this.label});
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) => Card(child: InkWell(borderRadius: BorderRadius.circular(22), onTap: () {}, child: Padding(padding: const EdgeInsets.all(12), child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(icon, color: Theme.of(context).colorScheme.primary), const SizedBox(height: 8), Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))]))));
}

class _ProviderCard extends StatelessWidget {
  const _ProviderCard({required this.name, required this.service, required this.rating, required this.price, required this.verified});
  final String name;
  final String service;
  final String rating;
  final String price;
  final bool verified;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [CircleAvatar(radius: 24, child: Text(name.substring(0, 1))), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Flexible(child: Text(name, style: const TextStyle(fontWeight: FontWeight.w800))), if (verified) ...[const SizedBox(width: 5), Icon(Icons.verified_rounded, size: 17, color: Theme.of(context).colorScheme.primary)]]), Text(service), const SizedBox(height: 4), Text('★ $rating · $price', style: const TextStyle(fontWeight: FontWeight.w600))])), FilledButton.tonal(onPressed: () {}, child: const Text('Book'))])));
}
