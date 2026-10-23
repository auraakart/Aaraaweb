import 'package:flutter/material.dart';
import '../guard_controller.dart';
import '../localization/guard_strings.dart';
import '../widgets/guard_operation_ui.dart';
import 'guard_field_operations_screen.dart';
import 'guard_school_transport_screen.dart';

class GuardToolsScreen extends StatefulWidget {
  const GuardToolsScreen({super.key, required this.controller, this.supportEmail, this.supportPhone});
  final GuardController controller;
  final String? supportEmail, supportPhone;

  @override
  State<GuardToolsScreen> createState() => _GuardToolsScreenState();
}

class _GuardToolsScreenState extends State<GuardToolsScreen> {
  final _search = TextEditingController();
  String query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get filteredUnits {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) return widget.controller.units;
    return widget.controller.units.where((unit) => _unitLabel(unit).toLowerCase().contains(normalized)).toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final strings = GuardStrings(c.languageCode);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final units = filteredUnits;

    return Scaffold(
      appBar: AppBar(title: Text(strings.get('tools'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            if (widget.supportEmail != null || widget.supportPhone != null)
              Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(children: [
                const Text('Support'),
                if (widget.supportEmail != null) SelectableText(widget.supportEmail!),
                if (widget.supportPhone != null) SelectableText(widget.supportPhone!),
              ]))),
            DropdownButtonFormField<String>(
              initialValue: c.languageCode,
              isExpanded: true,
              decoration: InputDecoration(labelText: strings.get('language'), prefixIcon: const Icon(Icons.translate_rounded)),
              selectedItemBuilder: (context) => guardLanguages.map((language) => Align(
                alignment: Alignment.centerLeft,
                child: Text(language.nativeLabel, maxLines: 1, overflow: TextOverflow.ellipsis),
              )).toList(),
              items: guardLanguages.map((language) => DropdownMenuItem(
                value: language.code,
                child: Text('${language.nativeLabel} · ${language.label}'),
              )).toList(),
              onChanged: (value) async { if (value == null) return; await c.setLanguage(value); if (mounted) setState(() {}); },
            ),
            const SizedBox(height: 12),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              value: c.voiceEnabled,
              onChanged: (enabled) async { await c.setVoiceEnabled(enabled); if (mounted) setState(() {}); },
              title: Text(strings.get('voiceCues')),
              subtitle: Text(strings.get('voiceCuesHelp')),
              secondary: const Icon(Icons.record_voice_over_rounded),
            ),
            const SizedBox(height: 18),
            Text(strings.get('operationsOverview'), style: theme.textTheme.titleLarge),
            const SizedBox(height: 10),
            GuardOperationSurface(
              child: Column(
                children: [
                  _StatusRow(icon: Icons.door_front_door_outlined, label: strings.get('activeGate'), value: c.gateName ?? strings.get('ready')),
                  const Divider(height: 24),
                  _StatusRow(icon: c.realtimeConnected ? Icons.wifi_rounded : Icons.wifi_off_rounded, label: strings.get('realtime'), value: strings.get(c.realtimeConnected ? 'connected' : 'disconnected')),
                  const Divider(height: 24),
                  _StatusRow(
                    icon: c.queuedActions > 0 ? Icons.cloud_off_outlined : Icons.cloud_done_outlined,
                    label: strings.get('offlineQueue'),
                    value: c.queuedActions == 0
                        ? strings.get('noQueuedActions')
                        : '${c.queuedActions} ${strings.get('pendingActions')} · ${c.oldestQueuedMinutes}m',
                  ),
                  const Divider(height: 24),
                  _StatusRow(
                    icon: c.reviewRequiredActions > 0
                        ? Icons.supervisor_account_outlined
                        : c.queuedActions > 0
                            ? Icons.sync_rounded
                            : Icons.check_circle_outline_rounded,
                    label: strings.get('nextAction'),
                    value: c.reviewRequiredActions > 0
                        ? strings.get('reviewRequired')
                        : c.queuedActions > 0
                            ? strings.get('retrySync')
                            : strings.get('onlineClear'),
                  ),
                  if (c.reviewRequiredActions > 0) ...[
                    const Divider(height: 24),
                    _StatusRow(icon: Icons.rule_folder_outlined, label: strings.get('reviewRequired'), value: '${c.reviewRequiredActions}'),
                  ],
                  if (c.deferredRetryActions > 0) ...[
                    const Divider(height: 24),
                    _StatusRow(icon: Icons.schedule_rounded, label: strings.get('retrySync'), value: '${c.deferredRetryActions}'),
                  ],
                  if (c.directoryFromCache) ...[
                    const Divider(height: 24),
                    _StatusRow(icon: Icons.offline_bolt_outlined, label: strings.get('cachedDirectory'), value: strings.get('cachedLookup')),
                  ],
                  if (c.queuedActions > c.reviewRequiredActions) ...[
                    const SizedBox(height: 12),
                    SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: c.busy ? null : c.retryQueuedActions, icon: const Icon(Icons.sync_rounded), label: Text(strings.get('retrySync')))),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardFieldOperationsScreen(controller: c))),
                      icon: const Icon(Icons.security_rounded),
                      label: Text(strings.get('fieldOperations').toUpperCase()),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: c.gateId == null || c.units.isEmpty ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GuardSchoolTransportScreen(controller: c))),
                      icon: const Icon(Icons.directions_bus_rounded),
                      label: Text(strings.get('schoolTransport').toUpperCase()),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            Text(strings.get('unitDirectory'), style: theme.textTheme.titleLarge),
            const SizedBox(height: 10),
            TextField(
              controller: _search,
              onChanged: (value) => setState(() => query = value),
              decoration: InputDecoration(
                hintText: strings.get('searchUnit'),
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: strings.get('clearSearch'),
                        icon: const Icon(Icons.close_rounded),
                        onPressed: () {
                          _search.clear();
                          setState(() => query = '');
                        },
                      ),
              ),
            ),
            const SizedBox(height: 10),
            if (units.isEmpty)
              Padding(padding: const EdgeInsets.symmetric(vertical: 28), child: Center(child: Text(strings.get('noUnits'), style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant))))
            else
              ...units.take(100).map((unit) => Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(leading: const Icon(Icons.apartment_rounded), title: Text(_unitLabel(unit), style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: unit['occupancyType'] == null ? null : Text(unit['occupancyType'].toString().replaceAll('_', ' '))),
                  )),
          ],
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final largeText = MediaQuery.textScalerOf(context).scale(1) > 1.3;
    final valueStyle = theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 26),
        const SizedBox(width: 12),
        Expanded(
          child: largeText
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 4),
                    Text(value, style: valueStyle),
                  ],
                )
              : Row(
                  children: [
                    Expanded(child: Text(label, style: theme.textTheme.titleSmall)),
                    const SizedBox(width: 8),
                    Flexible(child: Text(value, textAlign: TextAlign.end, style: valueStyle)),
                  ],
                ),
        ),
      ],
    );
  }
}

String _unitLabel(Map<String, dynamic> unit) {
  final building = unit['building'] is Map ? Map<String, dynamic>.from(unit['building'] as Map) : const <String, dynamic>{};
  final buildingName = (building['name'] ?? building['code'] ?? 'Building').toString();
  final unitNumber = (unit['number'] ?? 'Unit').toString();
  return '$buildingName · $unitNumber';
}
