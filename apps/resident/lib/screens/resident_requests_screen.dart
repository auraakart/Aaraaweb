import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class ResidentRequestsScreen extends StatefulWidget {
  const ResidentRequestsScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  State<ResidentRequestsScreen> createState() => _ResidentRequestsScreenState();
}

class _ResidentRequestsScreenState extends State<ResidentRequestsScreen> {
  static const _types = <String, String>{
    'NOC': 'No-objection certificate',
    'NO_DUES': 'No-dues certificate',
    'ADDRESS_PROOF': 'Address proof letter',
    'MOVE_OUT': 'Move-out letter',
    'PARKING_PERMISSION': 'Parking permission',
  };

  String _kind = 'NOC';
  final _details = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get _requests => widget.controller.helpdeskTickets
      .where((ticket) => (ticket['category']?.toString() ?? '').startsWith('RESIDENT_REQUEST:'))
      .toList(growable: false);

  Future<void> _submit() async {
    final unitId = widget.controller.primaryUnitId;
    if (unitId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a property before creating a request.')));
      return;
    }
    final detail = _details.text.trim();
    if (detail.length < 5) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add a short reason or supporting detail.')));
      return;
    }
    setState(() => _busy = true);
    final label = _types[_kind]!;
    try {
      await widget.controller.repository.createHelpdeskTicket(
        unitId: unitId,
        idempotencyKey: 'resident-request-${_kind.toLowerCase()}-${DateTime.now().microsecondsSinceEpoch}',
        title: label,
        description: detail,
        category: 'RESIDENT_REQUEST:$_kind',
        priority: 'NORMAL',
      );
      await widget.controller.load();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _details.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Resident request submitted for society review.')));
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: widget.controller.load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space4, AaraagateTokens.pageGutter, AaraagateTokens.space8),
          children: [
            const PremiumPageIntro(
              icon: Icons.description_outlined,
              title: 'Resident requests',
              supportingText: 'Request society-issued letters or permissions and follow their review in Helpdesk.',
            ),
            const SizedBox(height: AaraagateTokens.space4),
            PremiumSurface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('New request', style: theme.textTheme.titleMedium),
                  const SizedBox(height: AaraagateTokens.space3),
                  DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: _kind,
                    decoration: const InputDecoration(labelText: 'Request type', border: OutlineInputBorder()),
                    items: _types.entries.map((entry) => DropdownMenuItem(value: entry.key, child: Text(entry.value))).toList(),
                    onChanged: _busy ? null : (value) => setState(() => _kind = value ?? 'NOC'),
                  ),
                  const SizedBox(height: AaraagateTokens.space3),
                  TextField(
                    controller: _details,
                    enabled: !_busy,
                    minLines: 3,
                    maxLines: 6,
                    maxLength: 1000,
                    decoration: const InputDecoration(
                      labelText: 'Reason / details',
                      hintText: 'Explain what you need and any date/reference the society should know.',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: PremiumActionLabel(
                      label: 'Submit request',
                      icon: Icons.description_outlined,
                      busy: _busy,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AaraagateTokens.space5),
            const PremiumSectionHeader(
              title: 'Your requests',
              supportingText: 'Status is the authoritative Helpdesk status; request creation does not itself issue a certificate.',
            ),
            const SizedBox(height: AaraagateTokens.space3),
            if (_requests.isEmpty)
              const AppStateCard(icon: Icons.description_outlined, message: 'No resident certificate or permission requests yet.')
            else
              PremiumSurface(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var index = 0; index < _requests.length; index++) ...[
                      Padding(
                        padding: const EdgeInsets.all(AaraagateTokens.space4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _requests[index]['title']?.toString() ?? 'Resident request',
                              style: theme.textTheme.titleMedium,
                            ),
                            const SizedBox(height: AaraagateTokens.space2),
                            AaraagateStatusPill(
                              label: (_requests[index]['status']?.toString() ?? 'OPEN').replaceAll('_', ' '),
                            ),
                            if ((_requests[index]['description']?.toString() ?? '').trim().isNotEmpty) ...[
                              const SizedBox(height: AaraagateTokens.space2),
                              Text(
                                _requests[index]['description'].toString(),
                                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (index < _requests.length - 1) const Divider(height: 1),
                    ],
                  ],
                ),
              ),
            const SizedBox(height: AaraagateTokens.space4),
            Text(
              'Boundary: NOC/no-dues/address-proof validity remains a society decision. Aaraagate records the request, review and status; it does not declare legal validity.',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
