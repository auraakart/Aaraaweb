import 'package:flutter/material.dart';
import '../data/api_client.dart';

/// An optional request only; provider/platform dispatch stays authoritative.
class ConsumerTechnicianPreferencePanel extends StatefulWidget {
  const ConsumerTechnicianPreferencePanel({
    super.key,
    required this.apiClient,
    required this.bookingId,
  });

  final ApiClient apiClient;
  final String bookingId;

  @override
  State<ConsumerTechnicianPreferencePanel> createState() =>
      _ConsumerTechnicianPreferencePanelState();
}

class _ConsumerTechnicianPreferencePanelState
    extends State<ConsumerTechnicianPreferencePanel> {
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _savedId;
  String? _selectedId;
  String? _savedName;
  bool _savedRecordActive = false;
  List<Map<String, dynamic>> _candidates = const [];
  int _generation = 0;

  String get _base => '/api/v1/consumer/services/bookings/${widget.bookingId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ConsumerTechnicianPreferencePanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.bookingId != widget.bookingId ||
        oldWidget.apiClient != widget.apiClient) {
      _load();
    }
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _savedId = null;
      _selectedId = null;
      _savedName = null;
      _candidates = const [];
    });
    try {
      final results = await Future.wait<dynamic>([
        widget.apiClient.get('$_base/technician-candidates'),
        widget.apiClient.get('$_base/technician-preference'),
      ]);
      if (!mounted || generation != _generation) return;
      final candidates = results[0] as Map<String, dynamic>;
      final preference = results[1] as Map<String, dynamic>;
      setState(() {
        _candidates = (candidates['candidates'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .toList();
        _savedId = preference['agentId']?.toString();
        _savedName = preference['displayName']?.toString();
        _savedRecordActive = preference['technicianRecordActive'] == true;
        _selectedId = _savedId;
      });
    } catch (_) {
      if (mounted && generation == _generation) {
        setState(() => _error = 'Technician choices could not be loaded. Please retry.');
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    if (_saving || _loading || _selectedId == _savedId) return;
    final chosenId = _selectedId;
    setState(() => _saving = true);
    try {
      await widget.apiClient.put('$_base/technician-preference', {
        'agentId': chosenId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(chosenId == null
            ? 'Technician request cleared.'
            : 'Technician requested. Assignment is not guaranteed.'),
      ));
      await _load(); // Never treat a local choice as proof the server accepted it.
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Technician request could not be saved. Check the booking and retry.'),
        ));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasChange = _selectedId != _savedId;
    final savedIsListed = _candidates.any((row) => row['agentId']?.toString() == _savedId);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Request a familiar technician',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(
              'Optional preference from your completed visits. The provider decides who is assigned; availability and assignment are not guaranteed.',
              style: theme.textTheme.bodySmall,
            ),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              TextButton(onPressed: _load, child: const Text('Retry technician choices')),
            ] else ...[
              if (_savedId != null && !savedIsListed) ...[
                const SizedBox(height: 8),
                Text(
                  'Previously requested: ${_savedName?.isNotEmpty == true ? _savedName : 'Technician'}'
                  '${_savedRecordActive ? '' : ' (no longer active)'}',
                  style: theme.textTheme.bodyMedium,
                ),
              ],
              if (_candidates.isEmpty) ...[
                const SizedBox(height: 10),
                const Text('No technician from your completed visits is currently eligible for this booking.'),
              ] else ...[
                const SizedBox(height: 12),
                for (final candidate in _candidates)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: ChoiceChip(
                      label: Text(
                        '${candidate['displayName'] ?? 'Technician'}'
                        ' · ${candidate['completedVisits'] ?? 0} past completed visit(s)',
                      ),
                      selected: _selectedId == candidate['agentId']?.toString(),
                      onSelected: _saving
                          ? null
                          : (_) => setState(() => _selectedId = candidate['agentId']?.toString()),
                    ),
                  ),
              ],
              if (_savedId != null || _selectedId != null) ...[
                const SizedBox(height: 4),
                TextButton.icon(
                  onPressed: _saving ? null : () => setState(() => _selectedId = null),
                  icon: const Icon(Icons.close_rounded),
                  label: const Text('No technician preference'),
                ),
              ],
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _saving || !hasChange ? null : _save,
                child: Text(_saving ? 'Saving request…' : 'Save technician request'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
