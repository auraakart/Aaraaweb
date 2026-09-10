import 'package:flutter/material.dart';
import '../data/demo_household_profile_store.dart';
import '../data/household_profile_actions.dart';
import '../data/resident_data_controller.dart';
import '../data/vehicle_actions.dart';

class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({super.key, required this.controller, required this.householdId});

  final ResidentDataController controller;
  final String householdId;

  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  bool _busy = false;
  String? _error;
  List<Map<String, dynamic>> _pendingRequests = const [];
  late final bool _demo = widget.householdId.startsWith('demo-');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refreshPending());
  }

  Map<String, dynamic>? get _household {
    final households = widget.controller.households.where((item) => item['id']?.toString() == widget.householdId);
    return households.isEmpty ? null : households.first;
  }

  List<Map<String, dynamic>> get _vehicles {
    if (_demo) return DemoHouseholdProfileStore.vehicles(widget.householdId);
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

  List<Map<String, dynamic>> get _vehiclePending => _pendingRequests
      .where((item) => item['householdId']?.toString() == widget.householdId &&
          {'VEHICLE_ADD', 'VEHICLE_UPDATE', 'VEHICLE_REMOVE'}.contains(item['type']?.toString()) &&
          item['status']?.toString() == 'PENDING')
      .toList(growable: false);

  bool _pendingFor(String vehicleId, String type) => _vehiclePending.any((request) =>
      request['type'] == type && request['targetId']?.toString() == vehicleId);

  Future<void> _refreshPending() async {
    if (!mounted) return;
    if (_demo) {
      setState(() => _pendingRequests = List<Map<String, dynamic>>.from(
            DemoHouseholdProfileStore.pendingRequests(widget.householdId),
          ));
      return;
    }
    try {
      final rows = await widget.controller.repository.householdChangeRequests();
      if (mounted) setState(() => _pendingRequests = rows);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _add() async {
    final result = await showDialog<_VehicleFormResult>(
      context: context,
      builder: (_) => const _VehicleDialog(),
    );
    if (!mounted || result == null) return;
    await _run(() async {
      if (_demo) {
        DemoHouseholdProfileStore.requestVehicleAdd(
          householdId: widget.householdId,
          plateNumber: result.plateNumber,
          vehicleType: result.vehicleType,
          make: result.make,
          model: result.model,
          color: result.color,
        );
      } else {
        await widget.controller.repository.addVehicle(
          householdId: widget.householdId,
          plateNumber: result.plateNumber,
          vehicleType: result.vehicleType,
          make: result.make,
          model: result.model,
          color: result.color,
        );
        await widget.controller.load();
      }
      await _refreshPending();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle request sent for society admin approval.')));
    });
  }

  Future<void> _edit(Map<String, dynamic> vehicle) async {
    final vehicleId = vehicle['id']?.toString() ?? '';
    if (vehicleId.isEmpty || _pendingFor(vehicleId, 'VEHICLE_UPDATE') || _pendingFor(vehicleId, 'VEHICLE_REMOVE')) return;
    final result = await showDialog<_VehicleFormResult>(
      context: context,
      builder: (_) => _VehicleDialog(initialVehicle: vehicle),
    );
    if (!mounted || result == null) return;
    await _run(() async {
      if (_demo) {
        DemoHouseholdProfileStore.requestVehicleUpdate(
          householdId: widget.householdId,
          vehicleId: vehicleId,
          plateNumber: result.plateNumber,
          vehicleType: result.vehicleType,
          make: result.make,
          model: result.model,
          color: result.color,
        );
      } else {
        await widget.controller.repository.updateVehicle(
          householdId: widget.householdId,
          vehicleId: vehicleId,
          plateNumber: result.plateNumber,
          vehicleType: result.vehicleType,
          make: result.make,
          model: result.model,
          color: result.color,
        );
        await widget.controller.load();
      }
      await _refreshPending();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle update sent for society admin approval.')));
    });
  }

  Future<void> _remove(Map<String, dynamic> vehicle) async {
    final vehicleId = vehicle['id']?.toString() ?? '';
    if (vehicleId.isEmpty || _pendingFor(vehicleId, 'VEHICLE_REMOVE')) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Request vehicle removal?'),
        content: Text('${vehicle['plateNumber'] ?? 'This vehicle'} will remain active until society administration approves the removal.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Send request')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(() async {
      if (_demo) {
        DemoHouseholdProfileStore.requestVehicleRemove(householdId: widget.householdId, vehicle: vehicle);
      } else {
        await widget.controller.repository.deactivateVehicle(householdId: widget.householdId, vehicleId: vehicleId);
        await widget.controller.load();
      }
      await _refreshPending();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehicle removal request sent for society admin approval.')));
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (!mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vehicles = _vehicles;
    final parkingSlots = _parkingSlots;
    final pending = _vehiclePending;
    return Scaffold(
      appBar: AppBar(title: const Text('Vehicles & parking', style: TextStyle(fontWeight: FontWeight.w900))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _add,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add vehicle'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await widget.controller.load();
          await _refreshPending();
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            Text('Registered vehicles', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            const Text('Adding, editing or removing a vehicle requires society admin approval. Parking bay assignments remain society-managed.'),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            if (pending.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text('Pending society approval', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              for (final request in pending) _PendingVehicleRequestCard(request: request),
            ],
            const SizedBox(height: 18),
            if (_busy) const LinearProgressIndicator(),
            if (vehicles.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('No active vehicles registered for this household.')))
            else
              ...vehicles.map((vehicle) {
                final vehicleId = vehicle['id']?.toString() ?? '';
                final updatePending = _pendingFor(vehicleId, 'VEHICLE_UPDATE');
                final removalPending = _pendingFor(vehicleId, 'VEHICLE_REMOVE');
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(child: Icon(vehicle['vehicleType'] == 'TWO_WHEELER' ? Icons.two_wheeler_rounded : Icons.directions_car_rounded)),
                    title: Text(vehicle['plateNumber']?.toString() ?? 'Vehicle', style: const TextStyle(fontWeight: FontWeight.w900)),
                    subtitle: Text([
                      _details(vehicle, parkingSlots[vehicleId]),
                      if (updatePending) 'Update pending admin approval',
                      if (removalPending) 'Removal pending admin approval',
                    ].where((value) => value.isNotEmpty).join('\n')),
                    trailing: PopupMenuButton<String>(
                      enabled: !_busy,
                      onSelected: (value) => value == 'edit' ? _edit(vehicle) : _remove(vehicle),
                      itemBuilder: (_) => [
                        PopupMenuItem(value: 'edit', enabled: !updatePending && !removalPending, child: Text(updatePending ? 'Update pending approval' : 'Edit vehicle')),
                        PopupMenuItem(value: 'remove', enabled: !removalPending, child: Text(removalPending ? 'Removal pending approval' : 'Request removal')),
                      ],
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

class _PendingVehicleRequestCard extends StatelessWidget {
  const _PendingVehicleRequestCard({required this.request});
  final Map<String, dynamic> request;

  @override
  Widget build(BuildContext context) {
    final payload = request['payload'] is Map ? request['payload'] as Map : const {};
    final type = request['type']?.toString();
    final subtitle = switch (type) {
      'VEHICLE_ADD' => 'Registration pending admin approval',
      'VEHICLE_UPDATE' => 'Update pending admin approval',
      _ => 'Removal pending admin approval',
    };
    return Card(
      child: ListTile(
        leading: const Icon(Icons.schedule_rounded),
        title: Text(payload['plateNumber']?.toString() ?? 'Vehicle'),
        subtitle: Text(subtitle),
        trailing: const Chip(label: Text('Pending')),
      ),
    );
  }
}

class _VehicleDialog extends StatefulWidget {
  const _VehicleDialog({this.initialVehicle});
  final Map<String, dynamic>? initialVehicle;

  @override
  State<_VehicleDialog> createState() => _VehicleDialogState();
}

class _VehicleDialogState extends State<_VehicleDialog> {
  late final TextEditingController _plate;
  late final TextEditingController _make;
  late final TextEditingController _model;
  late final TextEditingController _color;
  late String _type;
  String? _error;

  bool get _editing => widget.initialVehicle != null;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialVehicle ?? const <String, dynamic>{};
    _plate = TextEditingController(text: initial['plateNumber']?.toString() ?? '');
    _make = TextEditingController(text: initial['make']?.toString() ?? '');
    _model = TextEditingController(text: initial['model']?.toString() ?? '');
    _color = TextEditingController(text: initial['color']?.toString() ?? '');
    _type = initial['vehicleType']?.toString() ?? 'CAR';
  }

  @override
  void dispose() {
    _plate.dispose();
    _make.dispose();
    _model.dispose();
    _color.dispose();
    super.dispose();
  }

  void _submit() {
    if (_plate.text.trim().isEmpty) {
      setState(() => _error = 'Enter the vehicle registration number.');
      return;
    }
    Navigator.of(context).pop(_VehicleFormResult(
      plateNumber: _plate.text.trim(),
      vehicleType: _type,
      make: _make.text.trim(),
      model: _model.text.trim(),
      color: _color.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(_editing ? 'Edit vehicle' : 'Register vehicle'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(
            controller: _plate,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'Registration number', hintText: 'KA01AB1234'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _type,
            decoration: const InputDecoration(labelText: 'Vehicle type'),
            items: const [
              DropdownMenuItem(value: 'CAR', child: Text('Car')),
              DropdownMenuItem(value: 'TWO_WHEELER', child: Text('Two-wheeler')),
              DropdownMenuItem(value: 'OTHER', child: Text('Other')),
            ],
            onChanged: (value) => value == null ? null : setState(() => _type = value),
          ),
          const SizedBox(height: 12),
          TextField(controller: _make, decoration: const InputDecoration(labelText: 'Make (optional)', hintText: 'Maruti Suzuki')),
          const SizedBox(height: 12),
          TextField(controller: _model, decoration: const InputDecoration(labelText: 'Model (optional)', hintText: 'Baleno')),
          const SizedBox(height: 12),
          TextField(controller: _color, decoration: const InputDecoration(labelText: 'Colour (optional)')),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 8),
          Text(_editing
              ? 'Changes become active only after society admin approval.'
              : 'The vehicle becomes active only after society admin approval.', style: const TextStyle(fontSize: 12)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: _submit, child: const Text('Send for approval')),
      ],
    );
  }
}

class _VehicleFormResult {
  const _VehicleFormResult({
    required this.plateNumber,
    required this.vehicleType,
    required this.make,
    required this.model,
    required this.color,
  });
  final String plateNumber;
  final String vehicleType;
  final String make;
  final String model;
  final String color;
}
