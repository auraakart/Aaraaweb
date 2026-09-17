import 'package:flutter/material.dart';
import '../guard_controller.dart';

class GuardSchoolTransportScreen extends StatefulWidget {
  const GuardSchoolTransportScreen({super.key, required this.controller});
  final GuardController controller;

  @override
  State<GuardSchoolTransportScreen> createState() => _GuardSchoolTransportScreenState();
}

class _GuardSchoolTransportScreenState extends State<GuardSchoolTransportScreen> {
  final name = TextEditingController();
  final phone = TextEditingController();
  final vehicle = TextEditingController();
  final note = TextEditingController();
  String direction = 'PICKUP';
  String? unitId;
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    unitId = widget.controller.units.isEmpty ? null : widget.controller.units.first['id']?.toString();
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    vehicle.dispose();
    note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final units = widget.controller.units;
    return Scaffold(
      appBar: AppBar(title: const Text('School transport')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('School bus arrival', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text('Send a short resident approval request for configured school pickup or drop.', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 18),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'PICKUP', label: Text('Pickup'), icon: Icon(Icons.directions_bus_rounded)),
                ButtonSegment(value: 'DROP', label: Text('Drop'), icon: Icon(Icons.school_outlined)),
              ],
              selected: {direction},
              onSelectionChanged: busy ? null : (value) => setState(() => direction = value.first),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: unitId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Destination', prefixIcon: Icon(Icons.apartment_rounded)),
              items: units.map((unit) => DropdownMenuItem(value: unit['id']?.toString(), child: Text(_unitLabel(unit), overflow: TextOverflow.ellipsis))).toList(),
              onChanged: busy ? null : (value) => setState(() => unitId = value),
            ),
            const SizedBox(height: 12),
            TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'School / bus / attendant', prefixIcon: Icon(Icons.badge_outlined))),
            const SizedBox(height: 12),
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone (optional)', prefixIcon: Icon(Icons.phone_outlined))),
            const SizedBox(height: 12),
            TextField(controller: vehicle, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Bus / vehicle number (optional)', prefixIcon: Icon(Icons.directions_bus_outlined))),
            const SizedBox(height: 12),
            TextField(controller: note, maxLines: 2, decoration: const InputDecoration(labelText: 'Note (optional)', prefixIcon: Icon(Icons.notes_outlined))),
            if (error != null) ...[
              const SizedBox(height: 12),
              Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: busy || unitId == null || name.text.trim().isEmpty ? null : _submit,
              icon: const Icon(Icons.send_rounded),
              label: Text(busy ? 'SENDING…' : 'REQUEST APPROVAL'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final selectedUnit = unitId;
    if (selectedUnit == null || name.text.trim().isEmpty) return;
    setState(() { busy = true; error = null; });
    await widget.controller.createGateArrival(
      unitId: selectedUnit,
      subjectType: 'OTHER',
      name: name.text.trim(),
      provider: 'SCHOOL_TRANSPORT',
      phone: phone.text.trim(),
      vehicleNumber: vehicle.text.trim(),
      note: '${direction == 'PICKUP' ? 'Pickup' : 'Drop'}${note.text.trim().isEmpty ? '' : ' · ${note.text.trim()}'}',
    );
    if (!mounted) return;
    final controllerError = widget.controller.error;
    if (controllerError != null) {
      setState(() { busy = false; error = controllerError; });
      return;
    }
    Navigator.pop(context);
  }
}

String _unitLabel(Map<String, dynamic> unit) {
  final building = unit['building'] is Map ? Map<String, dynamic>.from(unit['building'] as Map) : const <String, dynamic>{};
  return '${building['name'] ?? building['code'] ?? 'Building'} · ${unit['number'] ?? 'Unit'}';
}
