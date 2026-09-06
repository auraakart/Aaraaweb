import 'package:flutter/material.dart';
import '../auth/auth_repository.dart';
import '../data/resident_data_controller.dart';
import 'family_members_screen.dart';
import 'vehicles_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({
    super.key,
    required this.controller,
    required this.onSignOut,
    required this.canManageFamilyMembers,
    required this.propertyContexts,
    required this.currentSocietyId,
    required this.onSwitchProperty,
  });
  final ResidentDataController controller;
  final Future<void> Function() onSignOut;
  final bool canManageFamilyMembers;
  final List<SocietyMembershipOption> propertyContexts;
  final String? currentSocietyId;
  final Future<void> Function(SocietyMembershipOption membership) onSwitchProperty;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final household = controller.households.isEmpty ? null : controller.households.first;
    final vehicles = household?['vehicles'] is List ? (household!['vehicles'] as List).length : 0;
    final contacts = household?['emergencyContacts'] is List ? (household!['emergencyContacts'] as List).length : 0;
    final occupancies = household?['unit'] is Map && (household!['unit'] as Map)['occupancies'] is List
        ? (((household['unit'] as Map)['occupancies']) as List)
        : const [];
    final residents = occupancies.isNotEmpty ? occupancies.length : (household?['id']?.toString().startsWith('demo-') == true ? 4 : 0);

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            Text('Home & profile', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            if (propertyContexts.length > 1) ...[
              Card(
                child: ListTile(
                  leading: const Icon(Icons.swap_horiz_rounded),
                  title: const Text('My Properties', style: TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(_currentPropertyLabel()),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _showPropertyPicker(context),
                ),
              ),
              const SizedBox(height: 16),
            ],
            if (controller.loading && household == null)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else if (controller.householdError != null)
              Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [const Icon(Icons.cloud_off_outlined, size: 34), const SizedBox(height: 10), const Text('Could not load your household.'), TextButton(onPressed: controller.load, child: const Text('Retry'))])))
            else if (household == null)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No household profile is linked to this resident yet.')))
            else ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(children: [
                    const CircleAvatar(radius: 28, child: Icon(Icons.home_rounded, size: 30)),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(household['displayName']?.toString() ?? household['societyName']?.toString() ?? 'Your household', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 3),
                      Text(_unitLabel(household)),
                    ])),
                  ]),
                ),
              ),
              const SizedBox(height: 24),
              Text('Your household', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              Card(child: Column(children: [
                ListTile(
                  leading: const Icon(Icons.group_outlined),
                  title: const Text('Family members'),
                  subtitle: Text('$residents active occupants'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => FamilyMembersScreen(
                      controller: controller,
                      householdId: household['id'].toString(),
                      canManage: canManageFamilyMembers,
                    ),
                  )),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.directions_car_outlined),
                  title: const Text('Vehicles'),
                  subtitle: Text('$vehicles registered vehicles'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => VehiclesScreen(controller: controller, householdId: household['id'].toString()),
                  )),
                ),
                const Divider(height: 1),
                ListTile(leading: const Icon(Icons.contact_emergency_outlined), title: const Text('Emergency contacts'), subtitle: Text('$contacts contacts'), trailing: const Icon(Icons.chevron_right)),
                const Divider(height: 1),
                const ListTile(leading: Icon(Icons.tune_rounded), title: Text('Access preferences'), subtitle: Text('Delivery and frequent visitor rules'), trailing: Icon(Icons.chevron_right)),
              ])),
            ],
            const SizedBox(height: 24),
            Text('Settings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Card(child: Column(children: [
              const ListTile(leading: Icon(Icons.notifications_outlined), title: Text('Notifications'), trailing: Icon(Icons.chevron_right)),
              const Divider(height: 1),
              const ListTile(leading: Icon(Icons.language_rounded), title: Text('Language'), subtitle: Text('English'), trailing: Icon(Icons.chevron_right)),
              const Divider(height: 1),
              const ListTile(leading: Icon(Icons.shield_outlined), title: Text('Privacy & security'), trailing: Icon(Icons.chevron_right)),
              const Divider(height: 1),
              ListTile(
                leading: Icon(Icons.logout_rounded, color: theme.colorScheme.error),
                title: Text('Sign out', style: TextStyle(color: theme.colorScheme.error, fontWeight: FontWeight.w700)),
                onTap: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Sign out?'),
                      content: const Text('You’ll need to verify your mobile number again to access Aaraagate.'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                        FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
                      ],
                    ),
                  );
                  if (confirmed == true) await onSignOut();
                },
              ),
            ])),
          ],
        ),
      ),
    );
  }

  String _currentPropertyLabel() {
    final current = propertyContexts.where((item) => item.societyId == currentSocietyId).firstOrNull;
    if (current == null) return 'Switch society or property';
    final property = current.properties.isEmpty ? null : current.properties.first;
    if (property == null) return current.name;
    return '${current.name} · ${property.buildingName} ${property.unitNumber}'.trim();
  }

  Future<void> _showPropertyPicker(BuildContext context) async {
    final selected = await showModalBottomSheet<SocietyMembershipOption>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          children: [
            Text('My Properties', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Choose the society/property you want to open.'),
            const SizedBox(height: 14),
            for (final item in propertyContexts)
              Card(
                child: ListTile(
                  enabled: item.societyId != currentSocietyId,
                  leading: Icon(item.societyId == currentSocietyId ? Icons.check_circle_rounded : Icons.apartment_rounded),
                  title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(_propertyContextLabel(item)),
                  trailing: item.societyId == currentSocietyId ? const Text('Current') : const Icon(Icons.chevron_right_rounded),
                  onTap: item.societyId == currentSocietyId ? null : () => Navigator.pop(context, item),
                ),
              ),
          ],
        ),
      ),
    );
    if (selected != null) await onSwitchProperty(selected);
  }

  String _propertyContextLabel(SocietyMembershipOption membership) {
    final properties = membership.properties
        .map((property) => '${property.buildingName} ${property.unitNumber} (${property.relationship.toLowerCase()})'.trim())
        .join(' · ');
    final roles = (membership.roles.isEmpty ? [membership.role] : membership.roles)
        .map((role) => role.replaceAll('_', ' ').toLowerCase())
        .join(', ');
    return [if (properties.isNotEmpty) properties, roles].join(' · ');
  }

  String _unitLabel(Map<String, dynamic> household) {
    final unit = household['unit'];
    if (unit is Map) {
      final number = unit['number']?.toString();
      final building = unit['building'];
      final buildingName = building is Map ? building['name']?.toString() : null;
      if (number != null && buildingName != null) return '$buildingName · Unit $number';
      if (number != null) return 'Unit $number';
    }
    final number = household['unitNumber']?.toString();
    final buildingName = household['buildingName']?.toString();
    if (number != null && buildingName != null) return '$buildingName · Unit $number';
    return 'Unit ${household['unitId'] ?? ''}';
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
