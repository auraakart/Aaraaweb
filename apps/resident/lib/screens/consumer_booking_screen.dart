import 'package:flutter/material.dart';
import '../data/api_client.dart';

class ConsumerBookingScreen extends StatefulWidget {
  const ConsumerBookingScreen({super.key, required this.apiClient, required this.offering});

  final ApiClient apiClient;
  final Map<String, dynamic> offering;

  @override
  State<ConsumerBookingScreen> createState() => _ConsumerBookingScreenState();
}

class _ConsumerBookingScreenState extends State<ConsumerBookingScreen> {
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _homes = const [];
  String? _homeId;
  DateTime? _scheduledFrom;

  @override
  void initState() {
    super.initState();
    _loadHomes();
  }

  Future<void> _loadHomes() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final raw = await widget.apiClient.get('/api/v1/consumer/homes');
      if (!mounted) return;
      final homes = (raw as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
      setState(() {
        _homes = homes;
        if (_homeId == null && homes.isNotEmpty) _homeId = homes.first['id']?.toString();
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addHome() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _AddHomeDialog(),
    );
    if (result == null) return;
    setState(() => _submitting = true);
    try {
      final created = await widget.apiClient.post('/api/v1/consumer/homes', result) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _homes = [created, ..._homes];
        _homeId = created['id']?.toString();
      });
    } catch (e) {
      if (mounted) _showError(e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _pickSchedule() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 90)),
      initialDate: now.add(const Duration(days: 1)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 10, minute: 0));
    if (time == null) return;
    final selected = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    if (!selected.isAfter(now)) {
      _showError('Please select a future time.');
      return;
    }
    setState(() => _scheduledFrom = selected);
  }

  Future<void> _requestBooking() async {
    final homeId = _homeId;
    final from = _scheduledFrom;
    final offeringId = widget.offering['id']?.toString();
    if (homeId == null || from == null || offeringId == null) {
      _showError('Select a home and schedule before requesting the service.');
      return;
    }
    final durationMinutes = widget.offering['durationMinutes'] as int? ?? 60;
    final until = from.add(Duration(minutes: durationMinutes > 0 ? durationMinutes : 60));
    setState(() => _submitting = true);
    try {
      await widget.apiClient.post('/api/v1/consumer/services/bookings', {
        'homeId': homeId,
        'offeringId': offeringId,
        'scheduledFrom': from.toUtc().toIso8601String(),
        'scheduledUntil': until.toUtc().toIso8601String(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Service request created.')));
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) _showError(e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final provider = widget.offering['provider'] as Map<String, dynamic>? ?? const {};
    final pricePaise = widget.offering['pricePaise'] as int? ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Request Service')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: const CircleAvatar(child: Icon(Icons.handyman_rounded)),
              title: Text(widget.offering['name']?.toString() ?? 'Service', style: const TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text(provider['businessName']?.toString() ?? 'Verified provider'),
              trailing: Text('₹${(pricePaise / 100).toStringAsFixed(pricePaise % 100 == 0 ? 0 : 2)}', style: const TextStyle(fontWeight: FontWeight.w900)),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: Text('Service address', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
              TextButton.icon(onPressed: _submitting ? null : _addHome, icon: const Icon(Icons.add_home_rounded), label: const Text('Add home')),
            ],
          ),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_error != null)
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(_error!)))
          else if (_homes.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Add your home address to continue.')))
          else
            for (final home in _homes)
              RadioListTile<String>(
                value: home['id']?.toString() ?? '',
                groupValue: _homeId,
                onChanged: _submitting ? null : (value) => setState(() => _homeId = value),
                title: Text(home['label']?.toString() ?? 'Home', style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text('${home['addressLine1'] ?? ''}, ${home['locality'] ?? ''}, ${home['city'] ?? ''}'),
              ),
          const SizedBox(height: 18),
          Text('Schedule', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _submitting ? null : _pickSchedule,
            icon: const Icon(Icons.schedule_rounded),
            label: Text(_scheduledFrom == null ? 'Choose date & time' : MaterialLocalizations.of(context).formatFullDate(_scheduledFrom!)),
          ),
          if (_scheduledFrom != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Time: ${TimeOfDay.fromDateTime(_scheduledFrom!).format(context)}', textAlign: TextAlign.center),
            ),
          const SizedBox(height: 28),
          FilledButton.icon(
            onPressed: _submitting || _homeId == null || _scheduledFrom == null ? null : _requestBooking,
            icon: const Icon(Icons.check_circle_outline_rounded),
            label: Text(_submitting ? 'Requesting…' : 'Request service'),
          ),
        ],
      ),
    );
  }
}

class _AddHomeDialog extends StatefulWidget {
  const _AddHomeDialog();

  @override
  State<_AddHomeDialog> createState() => _AddHomeDialogState();
}

class _AddHomeDialogState extends State<_AddHomeDialog> {
  final _label = TextEditingController(text: 'Home');
  final _line1 = TextEditingController();
  final _line2 = TextEditingController();
  final _locality = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postalCode = TextEditingController();

  @override
  void dispose() {
    for (final controller in [_label, _line1, _line2, _locality, _city, _state, _postalCode]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _save() {
    if ([_label, _line1, _locality, _city, _state, _postalCode].any((controller) => controller.text.trim().isEmpty)) return;
    Navigator.of(context).pop({
      'label': _label.text.trim(),
      'addressLine1': _line1.text.trim(),
      if (_line2.text.trim().isNotEmpty) 'addressLine2': _line2.text.trim(),
      'locality': _locality.text.trim(),
      'city': _city.text.trim(),
      'state': _state.text.trim(),
      'postalCode': _postalCode.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add home address'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: _label, decoration: const InputDecoration(labelText: 'Label')),
            TextField(controller: _line1, decoration: const InputDecoration(labelText: 'Address line 1')),
            TextField(controller: _line2, decoration: const InputDecoration(labelText: 'Address line 2 (optional)')),
            TextField(controller: _locality, decoration: const InputDecoration(labelText: 'Locality')),
            TextField(controller: _city, decoration: const InputDecoration(labelText: 'City')),
            TextField(controller: _state, decoration: const InputDecoration(labelText: 'State')),
            TextField(controller: _postalCode, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: 'PIN code')),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: _save, child: const Text('Save')),
      ],
    );
  }
}
