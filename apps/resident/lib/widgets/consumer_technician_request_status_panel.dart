import 'package:flutter/material.dart';
import '../data/api_client.dart';

/// A read-only, owner-scoped snapshot. A request never proves its causal role
/// in the provider/platform technician assignment decision.
class ConsumerTechnicianRequestStatusPanel extends StatefulWidget {
  const ConsumerTechnicianRequestStatusPanel({
    super.key,
    required this.apiClient,
    required this.bookingId,
    this.onEditabilityChanged,
  });

  final ApiClient apiClient;
  final String bookingId;
  final ValueChanged<bool>? onEditabilityChanged;

  @override
  State<ConsumerTechnicianRequestStatusPanel> createState() =>
      _ConsumerTechnicianRequestStatusPanelState();
}

class _ConsumerTechnicianRequestStatusPanelState
    extends State<ConsumerTechnicianRequestStatusPanel> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _status;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant ConsumerTechnicianRequestStatusPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiClient != widget.apiClient ||
        oldWidget.bookingId != widget.bookingId) {
      _load();
    }
  }

  @override
  void dispose() {
    _generation++;
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _status = null;
    });
    try {
      final result = await widget.apiClient.get(
        '/api/v1/consumer/services/bookings/${widget.bookingId}/technician-request-status',
      );
      if (!mounted || generation != _generation) return;
      if (result is! Map<String, dynamic>) throw const FormatException('Invalid status');
      setState(() => _status = result);
      widget.onEditabilityChanged?.call(result['canChangeRequest'] == true);
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() => _error = 'Technician request status is unavailable. Try again.');
      widget.onEditabilityChanged?.call(false);
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_error!),
              TextButton(onPressed: _load, child: const Text('Retry technician status')),
            ],
          ),
        ),
      );
    }
    final status = _status;
    if (status == null) return const SizedBox.shrink();
    final state = status['requestStatus']?.toString() ?? 'UNKNOWN';
    final requested = status['requestedTechnicianName']?.toString();
    final assigned = status['assignedTechnicianName']?.toString();
    String headline;
    String explanation;
    switch (state) {
      case 'NO_REQUEST':
        headline = 'No technician requested';
        explanation = 'The provider will select an available service professional.';
      case 'AWAITING_ASSIGNMENT':
        headline = 'Waiting for technician assignment';
        explanation = 'Requested: ${requested?.isNotEmpty == true ? requested : 'a previous technician'}. This is not a confirmed assignment.';
      case 'REQUESTED_TECHNICIAN_ASSIGNED':
        headline = 'Requested technician assigned';
        explanation = '${assigned?.isNotEmpty == true ? assigned : 'The requested technician'} is currently assigned. The request does not prove how the assignment was decided.';
      case 'OTHER_TECHNICIAN_ASSIGNED':
        headline = 'Different technician assigned';
        explanation = 'Requested: ${requested?.isNotEmpty == true ? requested : 'your previous technician'}. '
            'Assigned: ${assigned?.isNotEmpty == true ? assigned : 'another technician'}. '
            'The provider selected another service professional.';
      case 'REQUEST_CLOSED':
        headline = 'Technician request closed';
        explanation = 'This booking is no longer accepting technician requests. '
            'The saved preference is historical, not an active assignment.';
      default:
        headline = 'Technician request status unavailable';
        explanation = 'Refresh this booking to confirm its latest technician status.';
    }
    return Card(
      child: ListTile(
        leading: const Icon(Icons.person_search_outlined),
        title: Text(headline),
        subtitle: Text(explanation),
        isThreeLine: true,
      ),
    );
  }
}
