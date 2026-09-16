import 'package:flutter/material.dart';
import '../auth/auth_repository.dart';
import '../data/demo_household_state.dart';
import '../data/resident_data_controller.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';
import 'emergency_contacts_screen.dart';
import 'family_members_screen.dart';
import 'occupancy_lifecycle_screen.dart';
import 'privacy_data_screen.dart';
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
    final scheme = theme.colorScheme;
    final household = controller.activeHousehold;
    final householdId = household?['id']?.toString();
    final demo = householdId?.startsWith('demo-') == true;
    final vehicles = demo && householdId != null
        ? DemoHouseholdState.vehiclesFor(householdId).length
        : (household?['vehicles'] is List ? (household!['vehicles'] as List).length : 0);
    final contacts = demo && householdId != null
        ? DemoHouseholdState.contactsFor(householdId).length
        : (household?['emergencyContacts'] is List ? (household!['emergencyContacts'] as List).length : 0);
    final occupancies = household?['unit'] is Map && (household!['unit'] as Map)['occupancies'] is List
        ? (((household['unit'] as Map)['occupancies']) as List)
        : const [];
    final residents = occupancies.isNotEmpty
        ? occupancies.length
        : (demo && householdId != null ? 1 + DemoHouseholdState.familyFor(householdId).length : 0);
    final canManageSelectedProperty = canManageFamilyMembers && _activePropertyIsOwned();

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space4,
            AaraagateTokens.pageGutter,
            AaraagateTokens.space8,
          ),
          children: [
            Text('Home & profile', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: AaraagateTokens.space1),
            Text('Manage your selected property, household and account preferences.', style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant)),
            if (_propertyChoiceCount() > 1) ...[
              const SizedBox(height: AaraagateTokens.space5),
              PremiumSurface(
                onTap: () => _showPropertyPicker(context),
                semanticLabel: 'Switch property. Current property: ${_currentPropertyLabel()}',
                child: Row(children: [
                  Container(
                    width: AaraagateTokens.iconContainer,
                    height: AaraagateTokens.iconContainer,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                    child: Icon(Icons.swap_horiz_rounded, color: scheme.onPrimaryContainer),
                  ),
                  const SizedBox(width: AaraagateTokens.space3),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('My Properties', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: AaraagateTokens.space1),
                    Text(_currentPropertyLabel(), style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                  ])),
                  const Icon(Icons.chevron_right_rounded),
                ]),
              ),
            ],
            const SizedBox(height: AaraagateTokens.space5),
            if (controller.loading && household == null)
              const Center(child: Padding(padding: EdgeInsets.all(AaraagateTokens.space6), child: CircularProgressIndicator()))
            else if (controller.householdError != null)
              AppStateCard(icon: Icons.cloud_off_outlined, message: controller.householdError!, actionLabel: 'Retry', onAction: controller.load)
            else if (household == null)
              const AppStateCard(icon: Icons.home_outlined, message: 'No household profile is linked to the selected property.')
            else ...[
              PremiumSurface(
                elevated: true,
                child: Row(children: [
                  Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl)),
                    child: Icon(Icons.home_rounded, size: 30, color: scheme.onPrimaryContainer),
                  ),
                  const SizedBox(width: AaraagateTokens.space4),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(household['displayName']?.toString() ?? household['societyName']?.toString() ?? 'Your household', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: AaraagateTokens.space1),
                    Text(_unitLabel(household), style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                  ])),
                ]),
              ),
              const SizedBox(height: AaraagateTokens.space6),
              const PremiumSectionHeader(title: 'Your household', supportingText: 'People, vehicles and property lifecycle for the selected home.'),
              const SizedBox(height: AaraagateTokens.space3),
              PremiumSurface(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  _ProfileTile(
                    icon: Icons.group_outlined,
                    title: 'Family members',
                    subtitle: '$residents active occupants',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => FamilyMembersScreen(
                        controller: controller,
                        householdId: household['id'].toString(),
                        canManage: canManageSelectedProperty,
                      ),
                    )),
                  ),
                  Divider(height: 1, color: scheme.outlineVariant),
                  _ProfileTile(
                    icon: Icons.move_up_rounded,
                    title: 'Move-in & move-out',
                    subtitle: 'Request a move and track society readiness',
                    enabled: !demo,
                    onTap: demo ? null : () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => OccupancyLifecycleScreen(api: controller.repository.api, activeUnitId: currentUnitId),
                    )),
                  ),
                  Divider(height: 1, color: scheme.outlineVariant),
                  _ProfileTile(
                    icon: Icons.directions_car_outlined,
                    title: 'Vehicles',
                    subtitle: '$vehicles registered vehicles',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => VehiclesScreen(controller: controller, householdId: household['id'].toString()),
                    )),
                  ),
                  Divider(height: 1, color: scheme.outlineVariant),
                  _ProfileTile(
                    icon: Icons.contact_emergency_outlined,
                    title: 'Emergency contacts',
                    subtitle: '$contacts saved contacts',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => EmergencyContactsScreen(controller: controller, householdId: household['id'].toString()),
                    )),
                  ),
                ]),
              ),
            ],
            const SizedBox(height: AaraagateTokens.space6),
            const PremiumSectionHeader(title: 'Settings', supportingText: 'Device preferences, privacy and account access.'),
            const SizedBox(height: AaraagateTokens.space3),
            PremiumSurface(
              padding: EdgeInsets.zero,
              child: Column(children: [
                _ProfileTile(
                  icon: Icons.notifications_outlined,
                  title: 'Notifications',
                  subtitle: controller.pushEnabled ? 'Enabled on this device' : 'Not enabled on this device',
                  trailing: AaraagateStatusPill(
                    label: controller.pushEnabled ? 'On' : 'Off',
                    tone: controller.pushEnabled ? AaraagateStatusTone.success : AaraagateStatusTone.neutral,
                  ),
                ),
                Divider(height: 1, color: scheme.outlineVariant),
                const _ProfileTile(icon: Icons.language_rounded, title: 'Language', subtitle: 'English'),
                Divider(height: 1, color: scheme.outlineVariant),
                _ProfileTile(
                  icon: Icons.privacy_tip_outlined,
                  title: 'Privacy & data use',
                  subtitle: 'See how current app features use your information',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PrivacyDataScreen())),
                ),
                Divider(height: 1, color: scheme.outlineVariant),
                _ProfileTile(
                  icon: Icons.logout_rounded,
                  iconColor: scheme.error,
                  title: 'Sign out',
                  subtitle: 'End this session on this device',
                  titleColor: scheme.error,
                  showChevron: false,
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
              ]),
            ),
          ],
        ),
      ),
    );
  }

  int _propertyChoiceCount() => propertyContexts.fold<int>(
        0,
        (count, membership) => count + (membership.properties.isEmpty ? 1 : membership.properties.length),
      );

  PropertySummary? _activeProperty() {
    final membership = propertyContexts.where((item) => item.societyId == currentSocietyId).firstOrNull;
    if (membership == null) return null;
    return membership.properties.where((item) => item.unitId == currentUnitId).firstOrNull;
  }

  bool _activePropertyIsOwned() => _activeProperty()?.relationship.trim().toUpperCase() == 'OWNER';

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
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.space4, 0, AaraagateTokens.space4, AaraagateTokens.space5),
          children: [
            Text('My Properties', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: AaraagateTokens.space1),
            const Text('Choose the exact property you want to open.'),
            const SizedBox(height: AaraagateTokens.space4),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: AaraagateTokens.space2),
      child: PremiumSurface(
        onTap: isCurrent ? null : () => Navigator.pop(context, _PropertyChoice(membership, property)),
        child: Row(children: [
          Icon(isCurrent ? Icons.check_circle_rounded : Icons.apartment_rounded),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: AaraagateTokens.space1),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
          ])),
          if (isCurrent)
            const AaraagateStatusPill(label: 'Current', tone: AaraagateStatusTone.success)
          else
            const Icon(Icons.chevron_right_rounded),
        ]),
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

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.enabled = true,
    this.trailing,
    this.iconColor,
    this.titleColor,
    this.showChevron = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool enabled;
  final Widget? trailing;
  final Color? iconColor;
  final Color? titleColor;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      minTileHeight: AaraagateTokens.minTouchTarget,
      contentPadding: const EdgeInsets.symmetric(horizontal: AaraagateTokens.space4, vertical: AaraagateTokens.space1),
      enabled: enabled,
      leading: Icon(icon, color: iconColor),
      title: Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: titleColor)),
      subtitle: Text(subtitle),
      trailing: trailing ?? (showChevron && onTap != null ? const Icon(Icons.chevron_right_rounded) : null),
      onTap: enabled ? onTap : null,
    );
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
