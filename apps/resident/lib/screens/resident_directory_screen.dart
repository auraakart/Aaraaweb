import 'package:flutter/material.dart';
import '../data/resident_repository.dart';

class ResidentDirectoryScreen extends StatefulWidget {
  const ResidentDirectoryScreen({super.key, required this.repository});
  final ResidentRepository repository;

  @override
  State<ResidentDirectoryScreen> createState() => _ResidentDirectoryScreenState();
}

class _ResidentDirectoryScreenState extends State<ResidentDirectoryScreen> {
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Map<String, dynamic> _profile = const {};
  List<Map<String, dynamic>> _directory = const [];
  List<Map<String, dynamic>> _requests = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        widget.repository.residentDirectoryProfile(),
        widget.repository.residentDirectory(),
        widget.repository.residentDirectoryContactRequests(),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = Map<String, dynamic>.from(results[0] as Map);
        _directory = (results[1] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
        _requests = (results[2] as List).whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Resident directory could not be loaded.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _editProfile() async {
    final name = TextEditingController(text: _profile['displayName']?.toString() ?? '');
    final bio = TextEditingController(text: _profile['bio']?.toString() ?? '');
    final rawInterests = _profile['interests'];
    final interests = TextEditingController(text: rawInterests is List ? rawInterests.join(', ') : '');
    var visible = _profile['visible'] == true;
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Directory profile'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Visible in resident directory'),
                subtitle: const Text('Phone, email and unit number are never shown here.'),
                value: visible,
                onChanged: (value) => setDialogState(() => visible = value),
              ),
              TextField(controller: name, maxLength: 80, decoration: const InputDecoration(labelText: 'Display name')),
              TextField(controller: bio, maxLength: 280, maxLines: 3, decoration: const InputDecoration(labelText: 'Short introduction')),
              TextField(controller: interests, decoration: const InputDecoration(labelText: 'Interests', hintText: 'Walking, chess, gardening')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(context, {
                'visible': visible,
                'displayName': name.text.trim(),
                'bio': bio.text.trim(),
                'interests': interests.text.split(',').map((value) => value.trim()).where((value) => value.isNotEmpty).take(8).toList(),
              }),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    bio.dispose();
    interests.dispose();
    if (!mounted || result == null || result['displayName']?.toString().trim().isEmpty == true) return;
    await _run(() => widget.repository.updateResidentDirectoryProfile(
      visible: result['visible'] == true,
      displayName: result['displayName'].toString(),
      bio: result['bio']?.toString(),
      interests: (result['interests'] as List?)?.map((item) => item.toString()).toList() ?? const [],
    ));
  }

  Future<void> _requestContact(Map<String, dynamic> resident) async {
    final userId = resident['userId']?.toString();
    if (userId == null || resident['mine'] == true) return;
    final message = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Contact ${resident['displayName'] ?? 'resident'}?'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Send an introduction request. Aaraagate will not reveal phone numbers or email addresses.'),
          const SizedBox(height: 12),
          TextField(controller: message, maxLength: 500, maxLines: 3, decoration: const InputDecoration(labelText: 'Message (optional)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send request')),
        ],
      ),
    );
    final note = message.text.trim();
    message.dispose();
    if (!mounted || confirmed != true) return;
    await _run(() => widget.repository.requestResidentDirectoryContact(userId, message: note));
  }

  Future<void> _respond(Map<String, dynamic> request, String status) async {
    final id = request['id']?.toString();
    if (id == null) return;
    await _run(() => widget.repository.respondResidentDirectoryContact(id, status: status));
  }

  Future<void> _withdraw(Map<String, dynamic> request) async {
    final id = request['id']?.toString();
    if (id == null) return;
    await _run(() => widget.repository.withdrawResidentDirectoryContact(id));
  }

  Future<void> _run(Future<dynamic> Function() action) async {
    if (!mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await action();
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final incoming = _requests.where((request) => request['outgoing'] != true).toList(growable: false);
    final outgoing = _requests.where((request) => request['outgoing'] == true).toList(growable: false);
    return Scaffold(
      appBar: AppBar(title: const Text('Resident directory')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Row(children: [Icon(Icons.privacy_tip_outlined), SizedBox(width: 10), Expanded(child: Text('Opt-in and privacy-safe', style: TextStyle(fontWeight: FontWeight.w800)))]),
                  const SizedBox(height: 8),
                  const Text('Only residents who opt in appear here. Directory results never expose phone, email or unit number. Contact requests carry only resident-authored notes.'),
                  const SizedBox(height: 12),
                  FilledButton.icon(onPressed: _busy ? null : _editProfile, icon: const Icon(Icons.manage_accounts_outlined), label: Text(_profile['visible'] == true ? 'Edit visible profile' : 'Set up profile')),
                ]),
              ),
            ),
            if (_loading) const Padding(padding: EdgeInsets.symmetric(vertical: 20), child: LinearProgressIndicator()),
            if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: 14),
            Text('Residents', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (_directory.isEmpty && !_loading)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No residents have opted into the directory yet.')))
            else
              for (final resident in _directory) _residentCard(resident),
            const SizedBox(height: 18),
            Text('Contact requests', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (incoming.isEmpty && outgoing.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No contact requests yet.')))
            else ...[
              for (final request in incoming) _requestCard(request, incoming: true),
              for (final request in outgoing) _requestCard(request, incoming: false),
            ],
          ],
        ),
      ),
    );
  }

  Widget _residentCard(Map<String, dynamic> resident) {
    final raw = resident['interests'];
    final interests = raw is List ? raw.map((item) => item.toString()).where((item) => item.isNotEmpty).toList() : const <String>[];
    final mine = resident['mine'] == true;
    final status = resident['latestContactStatus']?.toString();
    return Card(
      child: ListTile(
        leading: CircleAvatar(child: Text((resident['displayName']?.toString().trim().isNotEmpty == true ? resident['displayName'].toString().trim()[0] : 'R').toUpperCase())),
        title: Text(resident['displayName']?.toString() ?? 'Resident'),
        subtitle: Text([
          if (resident['bio']?.toString().trim().isNotEmpty == true) resident['bio'].toString().trim(),
          if (interests.isNotEmpty) interests.join(' · '),
          if (status != null) 'Latest request: ${status.replaceAll('_', ' ').toLowerCase()}',
        ].join('\n')),
        isThreeLine: resident['bio']?.toString().trim().isNotEmpty == true && interests.isNotEmpty,
        trailing: mine ? const Chip(label: Text('You')) : TextButton(onPressed: _busy || status == 'PENDING' ? null : () => _requestContact(resident), child: const Text('Connect')),
      ),
    );
  }

  Widget _requestCard(Map<String, dynamic> request, {required bool incoming}) {
    final status = request['status']?.toString() ?? 'PENDING';
    final name = incoming ? request['requesterName'] : request['recipientName'];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('${incoming ? 'From' : 'To'} ${name ?? 'Resident'}', style: const TextStyle(fontWeight: FontWeight.w800))),
            Chip(label: Text(status.replaceAll('_', ' '))),
          ]),
          if (request['message']?.toString().trim().isNotEmpty == true) Text(request['message'].toString()),
          if (request['responseNote']?.toString().trim().isNotEmpty == true) ...[
            const SizedBox(height: 6),
            Text('Response: ${request['responseNote']}'),
          ],
          if (status == 'PENDING') ...[
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: incoming
                ? [
                    FilledButton(onPressed: _busy ? null : () => _respond(request, 'ACCEPTED'), child: const Text('Accept')),
                    OutlinedButton(onPressed: _busy ? null : () => _respond(request, 'DECLINED'), child: const Text('Decline')),
                  ]
                : [OutlinedButton(onPressed: _busy ? null : () => _withdraw(request), child: const Text('Withdraw'))]),
          ],
          if (status == 'ACCEPTED') const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Accepted. Contact details remain private; coordinate through society/community channels unless you choose to share them yourself.', style: TextStyle(fontSize: 12)),
          ),
        ]),
      ),
    );
  }
}
