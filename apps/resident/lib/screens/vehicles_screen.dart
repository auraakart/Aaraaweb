import 'package:flutter/material.dart';
import '../data/demo_household_state.dart';
import '../data/demo_resident_repository.dart';
import '../data/resident_data_controller.dart';
import '../data/vehicle_actions.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class VehiclesScreen extends StatelessWidget {
  const VehiclesScreen({super.key, required this.controller, required this.householdId});

  final ResidentDataController controller;
  final String householdId;

  bool get _demo => controller.repository is DemoResidentRepository;

  Map<String, dynamic>? get _household {
    final households = controller.households.where((item) => item['id']?.toString() == householdId);
    return households.isEmpty ? null : households.first;
  }

  List<Map<String, dynamic>> get _vehicles {
    if (_demo) return DemoHouseholdState.vehiclesFor(householdId);
    final raw = _household?['vehicles'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  List<Map<String, dynamic>> get _pending => _demo
      ? DemoHouseholdState.pendingFor(householdId)
          .where((item) => item['status'] == 'PENDING' && item['type']?.toString().startsWith('VEHICLE_') == true)
          .toList(growable: false)
      : const [];

  Map<String, String> get _parkingSlots {
    final preferences = _household?['accessPreferences'];
    if (preferences is! Map) return const {};
    final raw = preferences['parkingSlots'];
    if (raw is! Map) return const {};
    return {
      for (final entry in raw.entries)
        if (entry.value is String && (entry.value as String).trim().isNotEmpty) entry.key.toString(): (entry.value as String).trim(),
    };
  }

  Future<void> _add(BuildContext context) async {
    final plate = TextEditingController();
    final make = TextEditingController();
    final model = TextEditingController();
    final color = TextEditingController();
    var type = 'CAR';
    final submit = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Register vehicle'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(
                controller: plate,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Registration number', hintText: 'KA01AB1234'),
              ),
              const SizedBox(height: AaraagateTokens.space3),
              DropdownButtonFormField<String>(
                initialValue: type,
                decoration: const InputDecoration(labelText: 'Vehicle type'),
                items: const [
                  DropdownMenuItem(value: 'CAR', child: Text('Car')),
                  DropdownMenuItem(value: 'TWO_WHEELER', child: Text('Two-wheeler')),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                ],
                onChanged: (value) => value == null ? null : setState(() => type = value),
              ),
              const SizedBox(height: AaraagateTokens.space3),
              TextField(controller: make, decoration: const InputDecoration(labelText: 'Make (optional)', hintText: 'Maruti Suzuki')),
              const SizedBox(height: AaraagateTokens.space3),
              TextField(controller: model, decoration: const InputDecoration(labelText: 'Model (optional)', hintText: 'Baleno')),
              const SizedBox(height: AaraagateTokens.space3),
              TextField(controller: color, decoration: const InputDecoration(labelText: 'Colour (optional)')),
              const SizedBox(height: AaraagateTokens.space3),
              const PremiumSurface(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.verified_user_outlined, size: 20),
                    SizedBox(width: AaraagateTokens.space2),
                    Expanded(child: Text('The vehicle becomes active only after Society Admin approval.')),
                  ],
                ),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Submit for approval')),
          ],
        ),
      ),
    );
    final plateNumber = plate.text.trim();
    final makeValue = make.text.trim();
    final modelValue = model.text.trim();
    final colorValue = color.text.trim();
    plate.dispose();
    make.dispose();
    model.dispose();
    color.dispose();
    if (submit != true || plateNumber.isEmpty || !context.mounted) return;
    try {
      if (_demo) {
        DemoHouseholdState.addPending(householdId, 'VEHICLE_ADD', {
          'plateNumber': plateNumber.toUpperCase().replaceAll(RegExp(r'[\s-]+'), ''),
          'vehicleType': type,
          'make': makeValue,
          'model': modelValue,
          'color': colorValue,
        });
      } else {
        await controller.repository.addVehicle(
          householdId: householdId,
          plateNumber: plateNumber,
          vehicleType: type,
          make: makeValue,
          model: modelValue,
          color: colorValue,
        );
        await controller.load();
      }
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle request submitted for society approval.')));
    } catch (_) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle request could not be submitted. Please try again.')));
    }
  }

  Future<void> _remove(BuildContext context, Map<String, dynamic> vehicle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove vehicle?'),
        content: Text('${vehicle['plateNumber'] ?? 'This vehicle'} will remain active until Society Admin approves the removal.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Submit removal')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      if (_demo) {
        DemoHouseholdState.addPending(householdId, 'VEHICLE_REMOVE', {
          'plateNumber': vehicle['plateNumber'],
        }, targetId: vehicle['id']?.toString());
      } else {
        await controller.repository.deactivateVehicle(householdId: householdId, vehicleId: vehicle['id'].toString());
        await controller.load();
      }
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle removal submitted for society approval.')));
    } catch (_) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle removal could not be submitted. Please try again.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final vehicles = _vehicles;
    final pending = _pending;
    final parkingSlots = _parkingSlots;
    return Scaffold(
      appBar: AppBar(title: const Text('Vehicles & parking')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add vehicle'),
      ),
      body: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space4,
            AaraagateTokens.pageGutter,
            100,
          ),
          children: [
            PremiumSectionHeader(
              title: 'Registered vehicles',
              supportingText: 'Vehicle additions and removals require Society Admin approval. Parking bay assignments are managed by society administration and appear here when assigned.',
              trailing: AaraagateStatusPill(label: '${vehicles.length} active', tone: vehicles.isEmpty ? AaraagateStatusTone.neutral : AaraagateStatusTone.success),
            ),
            const SizedBox(height: AaraagateTokens.space5),
            if (pending.isNotEmpty) ...[
              PremiumSectionHeader(
                title: 'Pending society approval',
                trailing: AaraagateStatusPill(label: '${pending.length}', tone: AaraagateStatusTone.warning),
              ),
              const SizedBox(height: AaraagateTokens.space3),
              for (final request in pending) ...[
                _PendingVehicleRequestCard(request: request),
                const SizedBox(height: AaraagateTokens.space3),
              ],
              const SizedBox(height: AaraagateTokens.space2),
            ],
            if (vehicles.isEmpty)
              const AppStateCard(icon: Icons.directions_car_outlined, message: 'No approved active vehicles registered for this household.')
            else
              for (final vehicle in vehicles) ...[
                Builder(builder: (context) {
                  final vehicleId = vehicle['id']?.toString() ?? '';
                  final twoWheeler = vehicle['vehicleType'] == 'TWO_WHEELER';
                  return PremiumSurface(
                    padding: const EdgeInsets.all(AaraagateTokens.space4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: AaraagateTokens.iconContainer,
                          height: AaraagateTokens.iconContainer,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                          child: Icon(twoWheeler ? Icons.two_wheeler_rounded : Icons.directions_car_rounded, color: scheme.onPrimaryContainer),
                        ),
                        const SizedBox(width: AaraagateTokens.space3),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(vehicle['plateNumber']?.toString() ?? 'Vehicle', style: theme.textTheme.titleMedium),
                            const SizedBox(height: AaraagateTokens.space1),
                            Text(_details(vehicle, parkingSlots[vehicleId]), style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                          ]),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline_rounded),
                          tooltip: 'Request vehicle removal',
                          onPressed: () => _remove(context, vehicle),
                        ),
                      ],
                    ),
                  );
                }),
                const SizedBox(height: AaraagateTokens.space3),
              ],
          ],
        ),
      ),
    );
  }

  String _details(Map<String, dynamic> vehicle, String? parkingSlot) {
    final values = <String>[
      _typeLabel(vehicle['vehicleType']?.toString()),
      if (vehicle['make']?.toString().trim().isNotEmpty == true) vehicle['make'].toString().trim(),
      if (vehicle['model']?.toString().trim().isNotEmpty == true) vehicle['model'].toString().trim(),
      if (vehicle['color']?.toString().trim().isNotEmpty == true) vehicle['color'].toString().trim(),
      if (parkingSlot?.trim().isNotEmpty == true) 'Parking: ${parkingSlot!.trim()}',
    ];
    return values.where((value) => value.isNotEmpty).join(' · ');
  }

  String _typeLabel(String? type) => switch (type) {
        'TWO_WHEELER' => 'Two-wheeler',
        'CAR' => 'Car',
        'OTHER' => 'Other',
        _ => '',
      };
}

class _PendingVehicleRequestCard extends StatelessWidget {
  const _PendingVehicleRequestCard({required this.request});
  final Map<String, dynamic> request;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final payload = request['payload'] is Map ? request['payload'] as Map : const {};
    final adding = request['type'] == 'VEHICLE_ADD';
    return PremiumSurface(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.schedule_rounded),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(payload['plateNumber']?.toString() ?? 'Vehicle change', style: theme.textTheme.titleSmall),
              const SizedBox(height: AaraagateTokens.space1),
              Text(adding ? 'Addition pending Society Admin approval' : 'Removal pending Society Admin approval', style: theme.textTheme.bodySmall),
            ]),
          ),
          const SizedBox(width: AaraagateTokens.space2),
          const AaraagateStatusPill(label: 'Pending', tone: AaraagateStatusTone.warning),
        ],
      ),
    );
  }
}
