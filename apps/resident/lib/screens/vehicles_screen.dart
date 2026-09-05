import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../data/vehicle_actions.dart';

class VehiclesScreen extends StatelessWidget {
  const VehiclesScreen({super.key, required this.controller, required this.householdId});

  final ResidentDataController controller;
  final String householdId;

  List<Map<String, dynamic>> get _vehicles {
    final households = controller.households.where((item) => item['id']?.toString() == householdId);
    if (households.isEmpty) return const [];
    final raw = households.first['vehicles'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
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
      );
      await controller.load();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle registered')));
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
    return Scaffold(
      appBar: AppBar(title: const Text('Vehicles', style: TextStyle(fontWeight: FontWeight.w900))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: householdId.startsWith('demo-') ? null : () => _add(context),
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
            const Text('Keep household vehicle details current for society and future parking/access workflows.'),
            const SizedBox(height: 18),
            if (vehicles.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No active vehicles registered for this household.')))
            else
              ...vehicles.map((vehicle) => Card(
                    child: ListTile(
                      leading: CircleAvatar(child: Icon(vehicle['vehicleType'] == 'TWO_WHEELER' ? Icons.two_wheeler_rounded : Icons.directions_car_rounded)),
                      title: Text(vehicle['plateNumber']?.toString() ?? 'Vehicle', style: const TextStyle(fontWeight: FontWeight.w900)),
                      subtitle: Text(_details(vehicle)),
                      trailing: householdId.startsWith('demo-')
                          ? null
                          : IconButton(icon: const Icon(Icons.delete_outline_rounded), tooltip: 'Remove vehicle', onPressed: () => _remove(context, vehicle)),
                    ),
                  )),
          ],
        ),
      ),
    );
  }

  String _details(Map<String, dynamic> vehicle) {
    final values = <String>[
      _typeLabel(vehicle['vehicleType']?.toString()),
      if (vehicle['make']?.toString().trim().isNotEmpty == true) vehicle['make'].toString().trim(),
      if (vehicle['model']?.toString().trim().isNotEmpty == true) vehicle['model'].toString().trim(),
      if (vehicle['color']?.toString().trim().isNotEmpty == true) vehicle['color'].toString().trim(),
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
