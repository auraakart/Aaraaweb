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
    required this.currentUnitId,
    required this.onSwitchProperty,
  });
  final ResidentDataController controller;
  final Future<void> Function() onSignOut;
  final bool canManageFamilyMembers;
  final List<SocietyMembershipOption> propertyContexts;
  final String? currentSocietyId;
  final String? currentUnitId;
  final Future<void> Function(SocietyMembershipOption membership, PropertySummary? property) onSwitchProperty;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final household = controller.activeHousehold;
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
            if (_propertyChoiceCount() > 1) ...[
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
              Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(children: [const Icon(Icons.cloud_off_outlined, size: 34), const SizedBox(height: 10), Text(controller.householdError!), TextButton(onPressed: controller.load, child: const Text('Retry'))])))
            else if (household == null)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No household profile is linked to the selected property.')))
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
                ListTile(
                  leading: const Icon(Icons.contact_emergency_outlined),
                  title: const Text('Emergency contacts'),
                  subtitle: Text('$contacts saved contacts'),
                ),
              ])),
            ],
            const SizedBox(height: 24),
            Text('Settings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Card(child: Column(children: [
              ListTile(
                leading: const Icon(Icons.notifications_outlined),
                title: const Text('Notifications'),
                subtitle: Text(controller.pushEnabled ? 'Enabled on this device' : 'Not enabled on this device'),
              ),
              const Divider(height: 1),
              const ListTile(
                leading: Icon(Icons.language_rounded),
                title: Text('Language'),
                subtitle: Text('English'),
              ),
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

  int _propertyChoiceCount() => propertyContexts.fold<int>(
        0,
        (count, membership) => count + (membership.properties.isEmpty ? 1 : membership.properties.length),
      );

  String _currentPropertyLabel() {
    final current = propertyContexts.where((item) => item.societyId == currentSocietyId).firstOrNull;
    if (current == null) return 'Switch society or property';
    final property = current.properties.where((item) => item.unitId == currentUnitId).firstOrNull;
    if (property == null) return current.name;
    return '${current.name} · ${property.buildingName} ${property.unitNumber}'.trim();
  }

  Future<void> _showPropertyPicker(BuildContext context) async {
    final selected = await showModalBottomSheet<_PropertyChoice>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          children: [
            Text('My Properties', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Choose the exact property you want to open.'),
            const SizedBox(height: 14),
            for (final membership in propertyContexts)
              if (membership.properties.isEmpty)
                _propertyChoiceTile(context, membership, null)
              else
                for (final property in membership.properties)
                  _propertyChoiceTile(context, membership, property),
          ],
        ),
      ),
    );
    if (selected != null) await onSwitchProperty(selected.membership, selected.property);
  }

  Widget _propertyChoiceTile(BuildContext context, SocietyMembershipOption membership, PropertySummary? property) {
    final isCurrent = membership.societyId == currentSocietyId && property?.unitId == currentUnitId;
    final title = property == null
        ? membership.name
        : '${membership.name} · ${property.buildingName} ${property.unitNumber}'.trim();
    final roles = (membership.roles.isEmpty ? [membership.role] : membership.roles)
        .map((role) => role.replaceAll('_', ' ').toLowerCase())
        .join(', ');
    final subtitle = [if (property != null) property.relationship.toLowerCase(), roles].join(' · ');
    return Card(
      child: ListTile(
        enabled: !isCurrent,
        leading: Icon(isCurrent ? Icons.check_circle_rounded : Icons.apartment_rounded),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(subtitle),
        trailing: isCurrent ? const Text('Current') : const Icon(Icons.chevron_right_rounded),
        onTap: isCurrent ? null : () => Navigator.pop(context, _PropertyChoice(membership, property)),
      ),
    );
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

class _PropertyChoice {
  const _PropertyChoice(this.membership, this.property);
  final SocietyMembershipOption membership;
  final PropertySummary? property;
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
