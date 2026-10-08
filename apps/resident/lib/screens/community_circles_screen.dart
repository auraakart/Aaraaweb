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
  List<Map<String, dynamic>> requests = const [];
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
      final values = await Future.wait([widget.repository.communityCircles(), widget.repository.communityCircleRequests()]);
      if (mounted) setState(() { circles = values[0]; requests = values[1]; });
    } catch (_) {
      if (mounted) setState(() => error = 'Community circles could not be loaded.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _request() async {
    final submitted = await showDialog<bool>(context: context, builder: (_) => _CircleActionDialog(repository: widget.repository));
    if (submitted == true && mounted) await _load();
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
      builder: (_) => _CirclePostsSheet(repository: widget.repository, circleId: id, name: circle['name']?.toString() ?? 'Community circle', closed: circle['status'] == 'CLOSED', expiresAt: circle['expiresAt']?.toString()),
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
            Text('Opt-in resident circles', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AaraagateTokens.space1),
            Text('Join the society-managed groups you want. Sender names and flat numbers are visible only to joined circle members.', style: theme.textTheme.bodyMedium),
            const SizedBox(height: AaraagateTokens.space4),
            OutlinedButton.icon(onPressed: loading ? null : _request, icon: const Icon(Icons.add_circle_outline), label: const Text('Request a circle')),
            if (requests.isNotEmpty) ...[
              const SizedBox(height: AaraagateTokens.space2),
              Text('Your circle requests', style: theme.textTheme.titleMedium),
              for (final request in requests)
                ListTile(contentPadding: EdgeInsets.zero, title: Text(request['name']?.toString() ?? 'Circle request'),
                  subtitle: Text('${request['status'] ?? 'PENDING'}${request['reviewNote'] == null ? '' : ' · ${request['reviewNote']}'}')),
              const SizedBox(height: AaraagateTokens.space3),
            ],
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
                        PremiumIdentityHeader(
                          icon: Icons.groups_2_outlined,
                          title: circle['name']?.toString() ?? 'Community circle',
                          supportingText: '${circle['memberCount'] ?? 0} joined · ${circle['postCount'] ?? 0} posts',
                          status: closed ? const AaraagateStatusPill(label: 'Closed') : null,
                        ),
                        if (circle['expiresAt'] != null) ...[
                          const SizedBox(height: AaraagateTokens.space2),
                          Text('Deletes automatically: ${circleDeletionLabel(circle['expiresAt'].toString())}', style: theme.textTheme.bodySmall),
                        ],
                        if ((circle['description']?.toString() ?? '').isNotEmpty) ...[
                          const SizedBox(height: AaraagateTokens.space3),
                          Text(circle['description'].toString()),
                        ],
                        const SizedBox(height: AaraagateTokens.space3),
                        PremiumActionGroup(
                          primary: joined
                            ? FilledButton.tonalIcon(
                                onPressed: () => _open(circle),
                                icon: const Icon(Icons.forum_outlined),
                                label: const Text('OPEN CIRCLE'),
                              )
                            : FilledButton.icon(
                                onPressed: closed || busyCircleId == id ? null : () => _membership(circle, true),
                                icon: const Icon(Icons.group_add_outlined),
                                label: Text(busyCircleId == id ? 'JOINING…' : 'JOIN'),
                              ),
                          secondary: joined ? OutlinedButton(
                            onPressed: busyCircleId == id ? null : () => _membership(circle, false),
                            child: Text(busyCircleId == id ? 'LEAVING…' : 'LEAVE'),
                          ) : null,
                        ),
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
  const _CirclePostsSheet({required this.repository, required this.circleId, required this.name, required this.closed, this.expiresAt});
  final ResidentRepository repository;
  final String circleId;
  final String name;
  final bool closed;
  final String? expiresAt;

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
    final introduction = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(widget.closed ? 'This circle is closed and read-only.' : 'Sender names and flat numbers are visible to joined circle members. Report inappropriate messages for manager review.', style: theme.textTheme.bodySmall),
      if (widget.expiresAt != null) Text('This circle and its messages delete on ${circleDeletionLabel(widget.expiresAt!)}.'),
      const SizedBox(height: AaraagateTokens.space3),
    ]);
    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: .9,
        child: Padding(
          padding: EdgeInsets.fromLTRB(AaraagateTokens.pageGutter, AaraagateTokens.space4, AaraagateTokens.pageGutter, MediaQuery.viewInsetsOf(context).bottom + AaraagateTokens.space4),
          child: LayoutBuilder(builder: (context, constraints) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: constraints.maxHeight * .2),
                child: SingleChildScrollView(child: Text(widget.name, style: theme.textTheme.titleLarge)),
              ),
              const SizedBox(height: AaraagateTokens.space2),
              Expanded(
                child: ListView.builder(
                  controller: _messagesScrollController,
                  itemCount: 1 + (loading || error != null || posts.isEmpty ? 1 : posts.length),
                  itemBuilder: (context, index) {
                    if (index == 0) return introduction;
                    if (loading) return const AppStateCard(icon: Icons.sync_rounded, message: 'Loading circle messages…', loading: true);
                    if (error != null) return AppStateCard(icon: Icons.cloud_off_outlined, message: error!, actionLabel: 'Retry', onAction: _load);
                    if (posts.isEmpty) return const AppStateCard(icon: Icons.forum_outlined, message: 'No messages yet.');
                    final post = posts[index - 1];
                    final mine = post['mine'] == true;
                    final at = DateTime.tryParse(post['createdAt']?.toString() ?? '')?.toLocal();
                    return Padding(
                      padding: const EdgeInsets.only(bottom: AaraagateTokens.space3),
                      child: PremiumSurface(
                        color: mine ? theme.colorScheme.primaryContainer : theme.colorScheme.surfaceContainerLow,
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(post['body']?.toString() ?? '', style: theme.textTheme.bodyLarge?.copyWith(
                            color: mine ? theme.colorScheme.onPrimaryContainer : theme.colorScheme.onSurface,
                          )),
                          const SizedBox(height: AaraagateTokens.space2),
                          Text('${circleSenderLabel(post)}${at == null ? '' : ' · ${at.day}/${at.month} ${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}'}', style: theme.textTheme.bodySmall?.copyWith(
                            color: mine ? theme.colorScheme.onPrimaryContainer : theme.colorScheme.onSurfaceVariant,
                          )),
                          Align(alignment: Alignment.centerRight, child: IconButton(
                            tooltip: 'Report message', icon: const Icon(Icons.flag_outlined),
                            onPressed: () => showDialog<bool>(context: context, builder: (_) => _CircleActionDialog(repository: widget.repository, circleId: widget.circleId, postId: post['id'].toString())),
                          )),
                        ]),
                      ),
                    );
                  },
                ),
              ),
              if (!widget.closed)
                ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: constraints.maxHeight * .45),
                  child: SingleChildScrollView(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Divider(),
                    TextField(
                      controller: _body, enabled: !busy, minLines: 1, maxLines: 4, maxLength: 1000,
                      decoration: const InputDecoration(labelText: 'Post to circle'),
                    ),
                    FilledButton.icon(onPressed: busy ? null : _post, icon: const Icon(Icons.send_outlined), label: Text(busy ? 'POSTING…' : 'POST')),
                  ])),
                ),
            ],
          )),
        ),
      ),
    );
  }
}

String circleSenderLabel(Map<String, dynamic> post) {
  final name = post['senderName']?.toString() ?? 'Former member';
  final flat = post['senderFlat']?.toString() ?? 'Flat unavailable';
  return '${post['mine'] == true ? 'You ($name)' : name} · $flat';
}

String circleDeletionLabel(String raw) {
  final date = DateTime.tryParse(raw)?.toLocal();
  if (date == null) return raw;
  return '${date.day}/${date.month}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
}

class _CircleActionDialog extends StatefulWidget {
  const _CircleActionDialog({required this.repository, this.circleId, this.postId});
  final ResidentRepository repository;
  final String? circleId;
  final String? postId;
  @override
  State<_CircleActionDialog> createState() => _CircleActionDialogState();
}

class _CircleActionDialogState extends State<_CircleActionDialog> {
  final primary = TextEditingController();
  final description = TextEditingController();
  bool busy = false;
  bool submitted = false;
  String? error;
  bool get reporting => widget.postId != null;
  @override
  void dispose() { primary.dispose(); description.dispose(); super.dispose(); }
  Future<void> submit() async {
    if (busy) return;
    if (primary.text.trim().length < 3) { setState(() => error = 'Enter at least 3 characters.'); return; }
    setState(() { busy = true; error = null; });
    try {
      if (reporting) {
        await widget.repository.reportCommunityCirclePost(circleId: widget.circleId!, postId: widget.postId!, reason: primary.text);
      } else {
        await widget.repository.requestCommunityCircle(name: primary.text, description: description.text);
      }
      if (mounted) setState(() { busy = false; submitted = true; });
    } catch (e) {
      if (mounted) setState(() { busy = false; error = e.toString(); });
    }
  }
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(reporting ? 'Report message' : 'Request a circle'),
    content: submitted ? Text(reporting ? 'Report sent to the society managers for review.' : 'Request submitted. Your circle will be published after manager approval.') : SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
      if (!reporting) const Text('Your request needs society manager approval before anyone can join.'),
      TextField(controller: primary, enabled: !busy, maxLength: reporting ? 500 : 80, maxLines: reporting ? 3 : 1,
        decoration: InputDecoration(labelText: reporting ? 'Reason' : 'Circle name')),
      if (!reporting) TextField(controller: description, enabled: !busy, maxLength: 500, maxLines: 3,
        decoration: const InputDecoration(labelText: 'Purpose / description')),
      if (error != null) Text(error!),
    ])),
    actions: submitted ? [TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Done'))] : [
      TextButton(onPressed: busy ? null : () => Navigator.pop(context), child: const Text('Cancel')),
      FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Submitting…' : reporting ? 'Send report' : 'Submit request'))],
  );
}
