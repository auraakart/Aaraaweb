import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';

class HelpdeskScreen extends StatefulWidget {
  const HelpdeskScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  State<HelpdeskScreen> createState() => _HelpdeskScreenState();
}

class _HelpdeskScreenState extends State<HelpdeskScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _tickets = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final tickets = await widget.controller.repository.helpdeskTickets();
      if (mounted) setState(() => _tickets = tickets);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Helpdesk')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newTicket,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New complaint'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? ListView(children: const [SizedBox(height: 240), Center(child: CircularProgressIndicator())])
            : _error != null
                ? ListView(padding: const EdgeInsets.all(20), children: [
                    const Icon(Icons.error_outline_rounded, size: 42),
                    const SizedBox(height: 12),
                    Text('Unable to load complaints', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(_error!),
                    const SizedBox(height: 16),
                    FilledButton(onPressed: _load, child: const Text('Try again')),
                  ])
                : _tickets.isEmpty
                    ? ListView(padding: const EdgeInsets.all(24), children: [
                        const SizedBox(height: 120),
                        const Icon(Icons.task_alt_rounded, size: 54),
                        const SizedBox(height: 16),
                        Text('No open complaints', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 8),
                        const Text('Report a society issue and track every update here.', textAlign: TextAlign.center),
                      ])
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                        itemCount: _tickets.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, index) => _TicketCard(ticket: _tickets[index], onTap: () => _openTicket(_tickets[index])),
                      ),
      ),
    );
  }

  Future<void> _newTicket() async {
    final unitId = widget.controller.primaryUnitId;
    if (unitId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No household unit is available.')));
      return;
    }
    final title = TextEditingController();
    final description = TextEditingController();
    final category = TextEditingController();
    String priority = 'NORMAL';
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(builder: (context, setModalState) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
        child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('New complaint', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 16),
          TextField(controller: title, decoration: const InputDecoration(labelText: 'Issue title'), maxLength: 120),
          TextField(controller: category, decoration: const InputDecoration(labelText: 'Category (optional)')),
          TextField(controller: description, decoration: const InputDecoration(labelText: 'Describe the issue'), minLines: 4, maxLines: 6, maxLength: 2000),
          DropdownButtonFormField<String>(
            value: priority,
            decoration: const InputDecoration(labelText: 'Priority'),
            items: const [
              DropdownMenuItem(value: 'LOW', child: Text('Low')),
              DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
              DropdownMenuItem(value: 'HIGH', child: Text('High')),
              DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
            ],
            onChanged: (value) { if (value != null) setModalState(() => priority = value); },
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () async {
              if (title.text.trim().length < 3 || description.text.trim().length < 5) return;
              try {
                await widget.controller.repository.createHelpdeskTicket(
                  unitId: unitId,
                  title: title.text,
                  description: description.text,
                  category: category.text,
                  priority: priority,
                );
                if (context.mounted) Navigator.pop(context, true);
              } catch (e) {
                if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
              }
            },
            child: const Text('Submit complaint'),
          ),
        ])),
      )),
    );
    title.dispose(); description.dispose(); category.dispose();
    if (created == true) await _load();
  }

  Future<void> _openTicket(Map<String, dynamic> ticket) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _TicketDetail(controller: widget.controller, ticket: ticket)));
    await _load();
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.onTap});
  final Map<String, dynamic> ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = ticket['status']?.toString() ?? 'OPEN';
    final priority = ticket['priority']?.toString() ?? 'NORMAL';
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(ticket['title']?.toString() ?? 'Complaint', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
              const Icon(Icons.chevron_right_rounded),
            ]),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              Chip(label: Text(status.replaceAll('_', ' '))),
              Chip(label: Text(priority)),
              if ((ticket['category']?.toString() ?? '').isNotEmpty) Chip(label: Text(ticket['category'].toString())),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _TicketDetail extends StatefulWidget {
  const _TicketDetail({required this.controller, required this.ticket});
  final ResidentDataController controller;
  final Map<String, dynamic> ticket;

  @override
  State<_TicketDetail> createState() => _TicketDetailState();
}

class _TicketDetailState extends State<_TicketDetail> {
  bool loading = true;
  List<Map<String, dynamic>> activities = const [];
  final comment = TextEditingController();

  @override
  void initState() { super.initState(); load(); }

  Future<void> load() async {
    try {
      activities = await widget.controller.repository.helpdeskActivities(widget.ticket['id'].toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void dispose() { comment.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Complaint details')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(widget.ticket['title']?.toString() ?? 'Complaint', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        Text(widget.ticket['description']?.toString() ?? ''),
        const SizedBox(height: 20),
        Text('Activity', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        if (loading) const Center(child: CircularProgressIndicator())
        else ...activities.map((item) => ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const CircleAvatar(child: Icon(Icons.history_rounded)),
          title: Text(item['message']?.toString().isNotEmpty == true ? item['message'].toString() : item['type']?.toString().replaceAll('_', ' ') ?? 'Update'),
          subtitle: Text([item['actorName'], item['toStatus']].where((v) => v != null && v.toString().isNotEmpty).join(' · ')),
        )),
        const Divider(height: 32),
        TextField(controller: comment, decoration: const InputDecoration(labelText: 'Add a comment'), maxLength: 1000, minLines: 2, maxLines: 4),
        FilledButton.icon(
          onPressed: () async {
            if (comment.text.trim().isEmpty) return;
            await widget.controller.repository.addHelpdeskComment(widget.ticket['id'].toString(), comment.text);
            comment.clear();
            setState(() => loading = true);
            await load();
          },
          icon: const Icon(Icons.send_rounded),
          label: const Text('Send comment'),
        ),
      ]),
    );
  }
}
