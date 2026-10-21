import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../media/complaint_photo_picker.dart';
import '../localization/aaraagate_strings.dart';
import 'premium_ui.dart';

class HelpdeskPhotos extends StatefulWidget {
  const HelpdeskPhotos({super.key, required this.controller, required this.ticketId, required this.unitId, required this.closed, this.picker});
  final ResidentDataController controller;
  final String ticketId;
  final String unitId;
  final bool closed;
  final ComplaintPhotoPicker? picker;
  @override
  State<HelpdeskPhotos> createState() => _HelpdeskPhotosState();
}

class _HelpdeskPhotosState extends State<HelpdeskPhotos> {
  List<Map<String, dynamic>> photos = [];
  Uint8List? draft;
  bool busy = false, attempted = false, loaded = false;
  String kind = 'BEFORE', note = '', key = '', error = '';
  int generation = 0;
  bool get current => mounted && widget.controller.primaryUnitId == widget.unitId;
  AaraagateStrings get copy => AaraagateStrings.device();

  @override
  void didUpdateWidget(covariant HelpdeskPhotos oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller || oldWidget.ticketId != widget.ticketId || oldWidget.unitId != widget.unitId) {
      generation++; photos = []; draft = null; busy = false; attempted = false; loaded = false; error = ''; note = ''; kind = 'BEFORE';
    }
  }

  Future<void> load() async {
    if (!current || busy) return;
    final run = ++generation, repository = widget.controller.repository;
    setState(() { busy = true; error = ''; });
    try {
      final rows = await repository.helpdeskPhotos(widget.ticketId);
      if (current && run == generation && identical(repository, widget.controller.repository)) setState(() { photos = rows; loaded = true; });
    } catch (_) { if (current && run == generation) setState(() => error = copy.text('helpdeskPhotosUnavailable')); }
    finally { if (current && run == generation) setState(() => busy = false); }
  }

  Future<void> pick() async {
    if (!current || busy || widget.closed || attempted) return;
    final run = ++generation;
    setState(() { busy = true; error = ''; });
    try {
      final bytes = await (widget.picker ?? DeviceComplaintPhotoPicker()).pick();
      if (current && run == generation && bytes != null) setState(() { draft = bytes; key = 'helpdesk-photo-${widget.ticketId}-${DateTime.now().microsecondsSinceEpoch}'; });
    } catch (_) { if (current && run == generation) setState(() => error = copy.text('helpdeskPhotoSelectionFailed')); }
    finally { if (current && run == generation) setState(() => busy = false); }
  }

  Future<void> upload() async {
    if (!current || busy || draft == null || widget.closed) return;
    final run = ++generation, repository = widget.controller.repository;
    setState(() { busy = true; attempted = true; error = ''; });
    try {
      final photo = await repository.addHelpdeskPhoto(widget.ticketId, draft!, kind: kind, note: note, idempotencyKey: key);
      if (current && run == generation && identical(repository, widget.controller.repository)) {
        setState(() { photos = [...photos.where((p) => p['id'] != photo['id']), photo]; draft = null; attempted = false; note = ''; });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(copy.text('helpdeskPhotoAdded'))));
      }
    } catch (_) { if (current && run == generation) setState(() => error = copy.text('helpdeskPhotoUnconfirmed')); }
    finally { if (current && run == generation) setState(() => busy = false); }
  }

  Future<void> view(Map<String, dynamic> photo) async {
    if (!current || busy) return;
    final run = ++generation, repository = widget.controller.repository;
    setState(() { busy = true; error = ''; });
    try {
      final bytes = await repository.helpdeskPhotoBytes(widget.ticketId, photo['id'].toString());
      if (!current || run != generation || !identical(repository, widget.controller.repository)) return;
      await showDialog<void>(context: context, builder: (context) => Dialog(child: Padding(
        padding: const EdgeInsets.all(16), child: Column(mainAxisSize: MainAxisSize.min, children: [
          Flexible(child: Image.memory(bytes, semanticLabel: copy.text('helpdeskPhotoEvidence'), errorBuilder: (_,_,_) => Text(copy.text('helpdeskPhotosUnavailable')))),
          TextButton(onPressed: () => Navigator.pop(context), child: Text(copy.text('helpdeskClose'))),
        ]),
      )));
    } catch (_) { if (current && run == generation) setState(() => error = copy.text('helpdeskPhotosUnavailable')); }
    finally { if (current && run == generation) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) => PremiumSurface(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(copy.text('helpdeskPhotos'), style: Theme.of(context).textTheme.titleMedium),
    Text(copy.text('helpdeskPhotosPrivacy')),
    Wrap(spacing: 8, children: [
      TextButton.icon(onPressed: busy ? null : load, icon: const Icon(Icons.photo_library_outlined), label: Text(copy.text('helpdeskViewPhotos'))),
      if (!widget.closed && draft == null) TextButton.icon(onPressed: busy ? null : pick, icon: const Icon(Icons.add_photo_alternate_outlined), label: Text(copy.text('helpdeskAddPhoto'))),
    ]),
    if (busy) const LinearProgressIndicator(),
    if (error.isNotEmpty) Semantics(liveRegion: true, child: Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error))),
    if (loaded && photos.isEmpty) Text(copy.text('helpdeskNoPhotos')),
    for (final photo in photos) ListTile(contentPadding: EdgeInsets.zero,
      title: Text(copy.text(photo['kind'] == 'AFTER' ? 'helpdeskAfterPhoto' : 'helpdeskBeforePhoto')),
      subtitle: Text(photo['note']?.toString() ?? ''),
      trailing: IconButton(tooltip: copy.text('helpdeskViewPhoto'), onPressed: busy ? null : () => view(photo), icon: const Icon(Icons.image_outlined))),
    if (draft != null) ...[
      const SizedBox(height: 8),
      ConstrainedBox(constraints: const BoxConstraints(maxHeight: 180), child: Image.memory(draft!, semanticLabel: copy.text('helpdeskPhotoPreview'))),
      DropdownButtonFormField<String>(initialValue: kind, isExpanded: true, decoration: InputDecoration(labelText: copy.text('helpdeskPhotoStage')),
        items: [DropdownMenuItem(value: 'BEFORE', child: Text(copy.text('helpdeskBeforePhoto'))), DropdownMenuItem(value: 'AFTER', child: Text(copy.text('helpdeskAfterPhoto')))],
        onChanged: busy || attempted ? null : (value) => setState(() => kind = value ?? 'BEFORE')),
      TextField(decoration: InputDecoration(labelText: copy.text('helpdeskPhotoNote')), maxLength: 200, enabled: !busy && !attempted, onChanged: (value) => note = value),
      FilledButton(onPressed: busy ? null : upload, child: Text(copy.text(attempted ? 'helpdeskRetryPhoto' : 'helpdeskUploadPhoto'))),
      if (!attempted) TextButton(onPressed: busy ? null : () => setState(() => draft = null), child: Text(copy.text('helpdeskCancel'))),
    ],
  ]));
}
