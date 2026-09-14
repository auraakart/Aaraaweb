import 'package:flutter/material.dart';
import '../data/parcel_actions.dart';
import '../data/resident_repository.dart';

class ParcelsScreen extends StatefulWidget {
  const ParcelsScreen({super.key, required this.repository, this.demoMode = false});
  final ResidentRepository repository;
  final bool demoMode;

  @override
  State<ParcelsScreen> createState() => _ParcelsScreenState();
}

class _ParcelsScreenState extends State<ParcelsScreen> {
  List<Map<String, dynamic>> _parcels = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final value = widget.demoMode ? _demoParcels() : await widget.repository.parcels();
      if (!mounted) return;
      setState(() => _parcels = value);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickupCode(Map<String, dynamic> parcel) async {
    try {
      final result = widget.demoMode
          ? {'code': '482731', 'expiresAt': DateTime.now().add(const Duration(minutes: 10)).toIso8601String()}
          : await widget.repository.issueParcelPickupCode(parcel['id'].toString());
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.pin_rounded),
          title: const Text('Parcel pickup code'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            SelectableText(result['code']?.toString() ?? '', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, letterSpacing: 6)),
            const SizedBox(height: 12),
            const Text('Show this code to security when collecting the parcel. It expires in 10 minutes.', textAlign: TextAlign.center),
          ]),
          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
        ),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _confirmCollection(Map<String, dynamic> parcel) async {
    try {
      if (!widget.demoMode) await widget.repository.confirmParcelCollection(parcel['id'].toString());
      if (widget.demoMode) {
        setState(() {
          _parcels = _parcels.map((item) => item['id'] == parcel['id'] ? {...item, 'status': 'COLLECTED', 'overdue': false} : item).toList(growable: false);
        });
      } else {
        await _load();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Parcels')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading && _parcels.isEmpty
            ? const ListView(children: [SizedBox(height: 220), Center(child: CircularProgressIndicator())])
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null) ...[
                    Card(child: ListTile(leading: const Icon(Icons.error_outline_rounded), title: const Text('Parcels could not be loaded'), subtitle: Text(_error!), trailing: IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)))),
                    const SizedBox(height: 12),
                  ],
                  if (_parcels.isEmpty && _error == null)
                    const Card(child: Padding(padding: EdgeInsets.all(24), child: Column(children: [Icon(Icons.inventory_2_outlined, size: 42), SizedBox(height: 10), Text('No parcels yet', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(height: 4), Text('Parcels received at the gate will appear here.', textAlign: TextAlign.center)])))
                  else
                    for (final parcel in _parcels) ...[
                      _ParcelCard(parcel: parcel, onPickupCode: () => _pickupCode(parcel), onConfirm: () => _confirmCollection(parcel)),
                      const SizedBox(height: 12),
                    ],
                  if (_loading && _parcels.isNotEmpty) const LinearProgressIndicator(),
                  const SizedBox(height: 24),
                  Text('Pickup codes are short-lived. Security verifies the code before handing over the parcel.', style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                ],
              ),
      ),
    );
  }

  List<Map<String, dynamic>> _demoParcels() => [
        {
          'id': 'demo-parcel-1',
          'courierName': 'Amazon',
          'trackingReference': 'AMZ-77421',
          'status': 'RECEIVED',
          'receivedAt': DateTime.now().subtract(const Duration(hours: 2)).toIso8601String(),
          'overdue': false,
        },
        {
          'id': 'demo-parcel-2',
          'courierName': 'BlueDart',
          'trackingReference': 'BD-209184',
          'status': 'RECEIVED',
          'receivedAt': DateTime.now().subtract(const Duration(hours: 30)).toIso8601String(),
          'overdue': true,
        },
        {
          'id': 'demo-parcel-3',
          'courierName': 'India Post',
          'trackingReference': 'INP-55108',
          'status': 'COLLECTED',
          'receivedAt': DateTime.now().subtract(const Duration(days: 2)).toIso8601String(),
          'overdue': false,
        },
      ];
}

class _ParcelCard extends StatelessWidget {
  const _ParcelCard({required this.parcel, required this.onPickupCode, required this.onConfirm});
  final Map<String, dynamic> parcel;
  final VoidCallback onPickupCode;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = parcel['status']?.toString() ?? 'RECEIVED';
    final received = DateTime.tryParse(parcel['receivedAt']?.toString() ?? '');
    final overdue = parcel['overdue'] == true;
    final active = status == 'RECEIVED';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(child: Icon(active ? Icons.inventory_2_outlined : Icons.check_rounded)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(parcel['courierName']?.toString() ?? 'Parcel', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
              if (parcel['trackingReference'] != null) Text(parcel['trackingReference'].toString(), style: theme.textTheme.bodySmall),
            ])),
            Chip(label: Text(overdue && active ? 'OVERDUE' : status)),
          ]),
          if (received != null) ...[
            const SizedBox(height: 12),
            Text('Received ${_friendly(received)}', style: theme.textTheme.bodyMedium),
          ],
          if (active) ...[
            const SizedBox(height: 16),
            Row(children: [
              Expanded(child: FilledButton.icon(onPressed: onPickupCode, icon: const Icon(Icons.pin_outlined), label: const Text('Pickup code'))),
              const SizedBox(width: 10),
              Expanded(child: OutlinedButton(onPressed: onConfirm, child: const Text('I collected it'))),
            ]),
          ],
        ]),
      ),
    );
  }

  static String _friendly(DateTime value) {
    final local = value.toLocal();
    return '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
