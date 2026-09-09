import 'package:flutter/material.dart';

class PrivacyDataScreen extends StatelessWidget {
  const PrivacyDataScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy & data use')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          Text(
            'How Aaraagate uses your information',
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          const Text(
            'Aaraagate uses account, property and activity information to provide society, gate, billing and household-service features. This screen explains the current product behaviour; it does not replace the formal privacy notice or society policy.',
          ),
          const SizedBox(height: 20),
          const _PrivacySection(
            icon: Icons.person_outline_rounded,
            title: 'Account & property context',
            body: 'Your verified mobile account and selected society/property context are used to show only the features and records available for that context.',
          ),
          const _PrivacySection(
            icon: Icons.shield_outlined,
            title: 'Gate & visitor activity',
            body: 'Visitor, delivery, cab and access records are used for entry approval, gate operations and related audit history. Share visitor pass codes only with the intended visitor.',
          ),
          const _PrivacySection(
            icon: Icons.notifications_none_rounded,
            title: 'Notifications',
            body: 'If notifications are enabled on this device, Aaraagate may register the device for society and property-related alerts. Device notification permission remains under your phone settings.',
          ),
          const _PrivacySection(
            icon: Icons.payments_outlined,
            title: 'Payments',
            body: 'Maintenance payment orders and their status are recorded so dues and receipts can be reconciled. A payment is not shown as successful until the configured payment gateway confirms it.',
          ),
          const _PrivacySection(
            icon: Icons.home_repair_service_outlined,
            title: 'Household services & staff',
            body: 'Bookings, provider assignments, domestic-help activity and ratings are used to operate the services you request for the selected property.',
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.manage_accounts_outlined),
                      SizedBox(width: 10),
                      Expanded(child: Text('Your data requests', style: TextStyle(fontWeight: FontWeight.w900))),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'A dedicated in-app workflow for access, correction or deletion requests is not implemented yet. Until that workflow is available, requests must be handled through the society/platform support process defined for your deployment.',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Aaraagate does not make a data-retention or regulatory-compliance claim on this screen. Those commitments must come from the formal policy and configured deployment process.',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _PrivacySection extends StatelessWidget {
  const _PrivacySection({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(child: Icon(icon)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.w900)),
                    const SizedBox(height: 5),
                    Text(body),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}
