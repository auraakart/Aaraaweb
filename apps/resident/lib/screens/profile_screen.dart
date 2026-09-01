import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          Text('Home & profile', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(children: [
                const CircleAvatar(radius: 28, child: Icon(Icons.person_rounded, size: 30)),
                const SizedBox(width: 14),
                const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Resident', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)), SizedBox(height: 3), Text('A-1204 · Green Heights'), Text('Owner')])),
                IconButton(onPressed: () {}, icon: const Icon(Icons.edit_outlined)),
              ]),
            ),
          ),
          const SizedBox(height: 24),
          Text('Your household', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const Card(child: Column(children: [
            ListTile(leading: Icon(Icons.group_outlined), title: Text('Family members'), subtitle: Text('3 active members'), trailing: Icon(Icons.chevron_right)),
            Divider(height: 1),
            ListTile(leading: Icon(Icons.directions_car_outlined), title: Text('Vehicles'), subtitle: Text('2 registered vehicles'), trailing: Icon(Icons.chevron_right)),
            Divider(height: 1),
            ListTile(leading: Icon(Icons.contact_emergency_outlined), title: Text('Emergency contacts'), subtitle: Text('2 contacts'), trailing: Icon(Icons.chevron_right)),
            Divider(height: 1),
            ListTile(leading: Icon(Icons.tune_rounded), title: Text('Access preferences'), subtitle: Text('Delivery and frequent visitor rules'), trailing: Icon(Icons.chevron_right)),
          ])),
          const SizedBox(height: 24),
          Text('Settings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const Card(child: Column(children: [
            ListTile(leading: Icon(Icons.notifications_outlined), title: Text('Notifications'), trailing: Icon(Icons.chevron_right)),
            Divider(height: 1),
            ListTile(leading: Icon(Icons.language_rounded), title: Text('Language'), subtitle: Text('English'), trailing: Icon(Icons.chevron_right)),
            Divider(height: 1),
            ListTile(leading: Icon(Icons.shield_outlined), title: Text('Privacy & security'), trailing: Icon(Icons.chevron_right)),
          ])),
        ],
      ),
    );
  }
}
