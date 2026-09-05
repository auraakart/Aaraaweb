import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../data/vehicle_actions.dart';

class VehiclesScreen extends StatelessWidget {
  const VehiclesScreen({super.key, required this.controller, required this.householdId});

  final ResidentDataController controller;
  final String householdId;

  Map<String, dynamic>? get _household {
    final households = controller.households.where((item) => item['id']?.toString() == householdId);
    return households.isEmpty ? null : households.first;
  }

  List<Map<String, dynamic>> get _vehicles {
    final raw = _household?['vehicles'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

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
    final parkingSlot = TextEditingController();
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
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: type,
                decoration: const InputDecoration(labelText: 'Vehicle type'),
                items: const [
                  DropdownMenuItem(value: 'CAR', child: Text('Car')),
                  DropdownMenuItem(value: 'TWO_WHEELER', child: Text('Two-wheeler')),
                  DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                ],
                onChanged: (value) => value == null ? null : setState(() => type = value),
              ),
              const SizedBox(height: 12),
              TextField(controller: make, decoration: const InputDecoration(labelText: 'Make (optional)', hintText: 'Maruti Suzuki')),
              const SizedBox(height: 12),
              TextField(controller: model, decoration: const InputDecoration(labelText: 'Model (optional)', hintText: 'Baleno')),
              const SizedBox(height: 12),
              TextField(controller: color, decoration: const InputDecoration(labelText: 'Colour (optional)')),
              const SizedBox(height: 12),
              TextField(
                controller: parkingSlot,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Parking slot (optional)', hintText: 'B2-18'),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Register')),
          ],
        ),
      ),
    );
    if (submit != true || plate.text.trim().isEmpty || !context.mounted) return;
    try {
      await controller.repository.addVehicle(
        householdId: householdId,
        plateNumber: plate.text,
        vehicleType: type,
        make: make.text,
        model: model.text,
        color: color.text,
        parkingSlot: parkingSlot.text,
      );
      await controller.load();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle registered')));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _editParking(BuildContext context, Map<String, dynamic> vehicle) async {
    final vehicleId = vehicle['id']?.toString();
    if (vehicleId == null || vehicleId.isEmpty) return;
    final parkingSlot = TextEditingController(text: _parkingSlots[vehicleId] ?? '');
    final submit = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Parking slot'),
        content: TextField(
          controller: parkingSlot,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'Slot / bay label', hintText: 'B2-18', helperText: 'Leave blank to clear the parking label.'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Save')),
        ],
      ),
    );
    if (submit != true || !context.mounted) return;
    try {
      await controller.repository.updateVehicleParkingSlot(
        householdId: householdId,
        vehicleId: vehicleId,
        parkingSlot: parkingSlot.text,
      );
      await controller.load();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Parking slot updated')));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _remove(BuildContext context, Map<String, dynamic> vehicle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Remove vehicle?'),
        content: Text('${vehicle['plateNumber'] ?? 'This vehicle'} will no longer be active for this household.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await controller.repository.deactivateVehicle(householdId: householdId, vehicleId: vehicle['id'].toString());
      await controller.load();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle removed')));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final vehicles = _vehicles;
    final parkingSlots = _parkingSlots;
    final demo = householdId.startsWith('demo-');
    return Scaffold(
      appBar: AppBar(title: const Text('Vehicles & parking', style: TextStyle(fontWeight: FontWeight.w900))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: demo ? null : () => _add(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add vehicle'),
      ),
      body: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            Text('Registered vehicles', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Keep vehicle details and your basic parking bay label current for society operations.'),
            const SizedBox(height: 18),
            if (vehicles.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No active vehicles registered for this household.')))
            else
              ...vehicles.map((vehicle) {
                final vehicleId = vehicle['id']?.toString() ?? '';
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(child: Icon(vehicle['vehicleType'] == 'TWO_WHEELER' ? Icons.two_wheeler_rounded : Icons.directions_car_rounded)),
                    title: Text(vehicle['plateNumber']?.toString() ?? 'Vehicle', style: const TextStyle(fontWeight: FontWeight.w900)),
                    subtitle: Text(_details(vehicle, parkingSlots[vehicleId])),
                    trailing: demo
                        ? null
                        : SizedBox(
                            width: 96,
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              IconButton(icon: const Icon(Icons.local_parking_rounded), tooltip: 'Edit parking slot', onPressed: () => _editParking(context, vehicle)),
                              IconButton(icon: const Icon(Icons.delete_outline_rounded), tooltip: 'Remove vehicle', onPressed: () => _remove(context, vehicle)),
                            ]),
                          ),
                  ),
                );
              }),
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
