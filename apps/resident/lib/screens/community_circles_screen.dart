import 'package:flutter/material.dart';
import '../data/resident_repository.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

List<Map<String, dynamic>> orderCommunityCirclePostsForDisplay(Iterable<Map<String, dynamic>> source) {
  final ordered = source.map((post) => Map<String, dynamic>.from(post)).toList(growable: false);
  ordered.sort((a, b) {
    final aAt = DateTime.tryParse(a['createdAt']?.toString() ?? '');
    final bAt = DateTime.tryParse(b['createdAt']?.toString() ?? '');
    if (aAt == null && bAt == null) return 0;
    if (aAt == null) return -1;
    if (bAt == null) return 1;
    final byTime = aAt.compareTo(bAt);
    if (byTime != 0) return byTime;
    return (a['id']?.toString() ?? '').compareTo(b['id']?.toString() ?? '');
  });
  return ordered;
}

class CommunityCirclesScreen extends StatefulWidget {
  const CommunityCirclesScreen({super.key, required this.repository});
  final ResidentRepository repository;

  @override
  State<CommunityCirclesScreen> createState() => _CommunityCirclesScreenState();
}

class _CommunityCirclesScreenState extends State<CommunityCirclesScreen> {
  List<Map<String, dynamic>> circles = const [];
  bool loading = true;
  String? error;
  String? busyCircleId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final value = await widget.repository.communityCircles();
      if (mounted) setState(() => circles = value);
    } catch (_) {
      if (mounted) setState(() => error = 'Community circles could not be loaded.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _membership(Map<String, dynamic> circle, bool join) async {
    final id = circle['id']?.toString();
    if (id == null || id.isEmpty || busyCircleId != null) return;
    setState(() => busyCircleId = id);
    try {
      if (join) {
        await widget.repository.joinCommunityCircle(id);
      } else {
        await widget.repository.leaveCommunityCircle(id);
      }
      await _load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString())));
    } finally {
      if (mounted) setState(() => busyCircleId = null);
    }
  }

  Future<void> _open(Map<String, dynamic> circle) async {
    final id = circle['id']?.toString();
    if (id == null || id.isEmpty || circle['joined'] != true) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CirclePostsSheet(repository: widget.repository, circleId: id, name: circle['name']?.toString() ?? 'Community circle', closed: circle['status'] == 'CLOSED'),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Community circles')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space4, AaraagateTokens.pageGutter, AaraagateTokens.space8),
          children: [
            Text('Opt-in resident circles', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: AaraagateTokens.space1),
            Text('Join only the society-managed groups you want. Member identities are not exposed as a resident directory.', style: theme.textTheme.bodyMedium),
            const SizedBox(height: AaraagateTokens.space4),
            if (loading)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading community circles…', loading: true)
            else if (error != null)
              AppStateCard(icon: Icons.error_outline_rounded, message: error!, actionLabel: 'Retry', onAction: _load)
            else if (circles.isEmpty)
              const AppStateCard(icon: Icons.groups_outlined, message: 'No community circles are available yet.')
            else
              ...circles.map((circle) {
                final joined = circle['joined'] == true;
                final closed = circle['status'] == 'CLOSED';
                final id = circle['id']?.toString() ?? '';
                return Padding(
                  padding: const EdgeInsets.only(bottom: AaraagateTokens.space3),
                  child: PremiumSurface(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Container(
                            width: AaraagateTokens.iconContainer,
                            height: AaraagateTokens.iconContainer,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: theme.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                            child: Icon(Icons.groups_2_outlined, color: theme.colorScheme.onPrimaryContainer),
                          ),
                          const SizedBox(width: AaraagateTokens.space3),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(circle['name']?.toString() ?? 'Community circle', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                            Text('${circle['memberCount'] ?? 0} joined · ${circle['postCount'] ?? 0} posts${closed ? ' · Closed' : ''}', style: theme.textTheme.bodySmall),
                          ])),
                        ]),
                        if ((circle['description']?.toString() ?? '').isNotEmpty) ...[
                          const SizedBox(height: AaraagateTokens.space3),
                          Text(circle['description'].toString()),
                        ],
                        const SizedBox(height: AaraagateTokens.space3),
                        Row(children: [
                          if (joined)
                            Expanded(child: FilledButton.tonalIcon(
                              onPressed: () => _open(circle),
                              icon: const Icon(Icons.forum_outlined),
                              label: const Text('OPEN CIRCLE'),
                            ))
                          else
                            Expanded(child: FilledButton.icon(
                              onPressed: closed || busyCircleId == id ? null : () => _membership(circle, true),
                              icon: const Icon(Icons.group_add_outlined),
                              label: Text(busyCircleId == id ? 'JOINING…' : 'JOIN'),
                            )),
                          if (joined) ...[
                            const SizedBox(width: AaraagateTokens.space2),
                            OutlinedButton(
                              onPressed: busyCircleId == id ? null : () => _membership(circle, false),
                              child: Text(busyCircleId == id ? 'LEAVING…' : 'LEAVE'),
                            ),
                          ],
                        ]),
                      ],
                    ),
                  ),
                );
              }),
            const SizedBox(height: AaraagateTokens.space2),
            Text(
              'Circles are for community coordination, not statutory voting, emergency communication, society notices or commercial promotion. Those remain in their dedicated Aaraagate workflows.',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _CirclePostsSheet extends StatefulWidget {
  const _CirclePostsSheet({required this.repository, required this.circleId, required this.name, required this.closed});
  final ResidentRepository repository;
  final String circleId;
  final String name;
  final bool closed;

  @override
  State<_CirclePostsSheet> createState() => _CirclePostsSheetState();
}

class _CirclePostsSheetState extends State<_CirclePostsSheet> {
  final _body = TextEditingController();
  final _messagesScrollController = ScrollController();
  List<Map<String, dynamic>> posts = const [];
  bool loading = true;
  bool busy = false;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _body.dispose();
    _messagesScrollController.dispose();
    super.dispose();
  }

  void _scrollToNewest() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_messagesScrollController.hasClients) return;
      _messagesScrollController.jumpTo(_messagesScrollController.position.maxScrollExtent);
    });
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final value = await widget.repository.communityCirclePosts(widget.circleId);
      if (mounted) setState(() => posts = orderCommunityCirclePostsForDisplay(value));
    } catch (_) {
      if (mounted) setState(() => error = 'Circle messages could not be loaded.');
    } finally {
      if (mounted) {
        setState(() => loading = false);
        if (error == null) _scrollToNewest();
      }
    }
  }

  Future<void> _post() async {
    final body = _body.text.trim();
    if (body.isEmpty || busy) return;
    setState(() => busy = true);
    try {
      await widget.repository.createCommunityCirclePost(circleId: widget.circleId, body: body);
      _body.clear();
      await _load();
    } catch (exception) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(exception.toString())));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: .9,
        child: Padding(
          padding: EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space4, AaraagateTokens.pageGutter, MediaQuery.viewInsetsOf(context).bottom + AaraagateTokens.space4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.name, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: AaraagateTokens.space1),
              Text(widget.closed ? 'This circle is closed and read-only.' : 'Messages show content and whether a post is yours; resident identities are not exposed.', style: theme.textTheme.bodySmall),
              const SizedBox(height: AaraagateTokens.space3),
              Expanded(
                child: loading
                    ? const Center(child: CircularProgressIndicator())
                    : error != null
                        ? Center(child: Text(error!))
                        : posts.isEmpty
                            ? const Center(child: Text('No messages yet.'))
                            : ListView.builder(
                                controller: _messagesScrollController,
                                itemCount: posts.length,
                                itemBuilder: (context, index) {
                                  final post = posts[index];
                                  final mine = post['mine'] == true;
                                  final at = DateTime.tryParse(post['createdAt']?.toString() ?? '')?.toLocal();
                                  return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: Icon(mine ? Icons.person_outline : Icons.groups_outlined),
                                    title: Text(post['body']?.toString() ?? ''),
                                    subtitle: Text('${mine ? 'You' : 'Circle member'}${at == null ? '' : ' · ${at.day}/${at.month} ${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}'}'),
                                  );
                                },
                              ),
              ),
              if (!widget.closed) ...[
                const Divider(),
                TextField(
                  controller: _body,
                  enabled: !busy,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: 1000,
                  decoration: const InputDecoration(labelText: 'Post to circle', border: OutlineInputBorder()),
                ),
                FilledButton.icon(onPressed: busy ? null : _post, icon: const Icon(Icons.send_outlined), label: Text(busy ? 'POSTING…' : 'POST')),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
