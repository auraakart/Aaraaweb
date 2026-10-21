import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../localization/aaraagate_strings.dart';
import '../screens/helpdesk_asset_scanner.dart';

class HelpdeskAssetEntry extends StatefulWidget {
  const HelpdeskAssetEntry({super.key, required this.controller, required this.unitId, required this.onChanged, required this.onBusyChanged, this.disabled = false});
  final ResidentDataController controller;
  final String unitId;
  final ValueChanged<Map<String, dynamic>?> onChanged;
  final ValueChanged<bool> onBusyChanged;
  final bool disabled;
  @override
  State<HelpdeskAssetEntry> createState() => _HelpdeskAssetEntryState();
}

class _HelpdeskAssetEntryState extends State<HelpdeskAssetEntry> {
  final code = TextEditingController();
  Map<String, dynamic>? asset;
  bool busy = false;
  String? error;
  int generation = 0;
  bool get current => mounted && widget.controller.primaryUnitId == widget.unitId;
  @override
  void dispose() { generation++; code.dispose(); super.dispose(); }

  Future<void> resolve() async {
    if (!current || busy || widget.disabled || code.text.trim().isEmpty) return;
    final run = ++generation, repository = widget.controller.repository;
    setState(() { busy = true; error = null; asset = null; }); widget.onChanged(null); widget.onBusyChanged(true);
    try {
      final result = await repository.resolveHelpdeskAsset(widget.unitId, code.text.trim());
      if (current && run == generation && identical(repository, widget.controller.repository)) { setState(() => asset = result); widget.onChanged(result); }
    } catch (_) { if (current && run == generation) setState(() => error = AaraagateStrings.device().text('helpdeskAssetUnavailable')); }
    finally { if (current && run == generation) { setState(() => busy = false); widget.onBusyChanged(false); } }
  }

  Future<void> scan() async {
    if (!current || busy || widget.disabled) return;
    final result = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => const HelpdeskAssetScanner()));
    if (current && result != null) { code.text = result; await resolve(); }
  }

  @override
  Widget build(BuildContext context) {
    final copy = AaraagateStrings.device();
    return ExpansionTile(tilePadding: EdgeInsets.zero, title: Text(copy.text('helpdeskRelatedAsset')), children: [
      TextField(controller: code, enabled: !widget.disabled && !busy, maxLength: 180,
        decoration: InputDecoration(labelText: copy.text('helpdeskAssetCode')),
        onChanged: (_) { generation++; setState(() { asset = null; error = null; }); widget.onChanged(null); }),
      Wrap(spacing: 8, children: [
        TextButton(onPressed: widget.disabled || busy ? null : resolve, child: Text(copy.text('helpdeskFindAsset'))),
        TextButton.icon(onPressed: widget.disabled || busy ? null : scan, icon: const Icon(Icons.qr_code_scanner_rounded), label: Text(copy.text('helpdeskScanAsset'))),
      ]),
      if (busy) const LinearProgressIndicator(),
      if (error != null) Semantics(liveRegion: true, child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
      if (asset != null) ListTile(contentPadding: EdgeInsets.zero, title: Text(asset!['name'].toString()), subtitle: Text([asset!['code'],asset!['location']].whereType<String>().join(' · '))),
    ]);
  }
}
