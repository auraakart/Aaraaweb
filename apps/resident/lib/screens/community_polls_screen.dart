import 'package:flutter/material.dart';
import '../data/resident_error_message.dart';
import '../data/resident_repository.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class CommunityPollsScreen extends StatefulWidget {
  const CommunityPollsScreen({super.key, required this.repository});
  final ResidentRepository repository;

  @override
  State<CommunityPollsScreen> createState() => _CommunityPollsScreenState();
}

class _CommunityPollsScreenState extends State<CommunityPollsScreen> {
  List<Map<String, dynamic>> polls = const [];
  bool loading = true;
  String? error;
  String? busyPollId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { loading = true; error = null; });
    try {
      final value = await widget.repository.communityPolls();
      if (mounted) setState(() => polls = value);
    } catch (e) {
      if (mounted) setState(() => error = residentErrorMessage(e, fallback: 'Community polls could not be loaded. Check your connection and try again.'));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _respond(Map<String, dynamic> poll, Map<String, dynamic> option) async {
    final pollId = poll['id']?.toString();
    final optionId = option['id']?.toString();
    if (pollId == null || optionId == null || busyPollId != null) return;
    setState(() => busyPollId = pollId);
    try {
      await widget.repository.respondToCommunityPoll(pollId: pollId, optionId: optionId);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Response recorded.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(residentErrorMessage(e, fallback: 'Your poll response could not be recorded. Please try again.'))));
    } finally {
      if (mounted) setState(() => busyPollId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Community polls')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space4,
            AaraagateTokens.pageGutter,
            AaraagateTokens.space8,
          ),
          children: [
            Text('Share your preference', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text('These polls are advisory community feedback only. They are not statutory society voting or legal resolutions.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: AaraagateTokens.space5),
            if (loading && polls.isEmpty)
              const AppStateCard(icon: Icons.how_to_vote_outlined, message: 'Loading community polls…', loading: true)
            else if (error != null)
              AppStateCard(icon: Icons.error_outline_rounded, message: error!, actionLabel: 'Retry', onAction: _load)
            else if (polls.isEmpty)
              const AppStateCard(icon: Icons.how_to_vote_outlined, message: 'No open or recently closed community polls.')
            else
              for (final poll in polls) ...[
                _PollCard(poll: poll, busy: busyPollId == poll['id']?.toString(), onRespond: (option) => _respond(poll, option)),
                const SizedBox(height: 12),
              ],
          ],
        ),
      ),
    );
  }
}

class _PollCard extends StatelessWidget {
  const _PollCard({required this.poll, required this.busy, required this.onRespond});
  final Map<String, dynamic> poll;
  final bool busy;
  final ValueChanged<Map<String, dynamic>> onRespond;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = poll['status']?.toString() ?? 'CLOSED';
    final myOptionId = poll['myOptionId']?.toString();
    final options = (poll['options'] is List)
        ? (poll['options'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false)
        : const <Map<String, dynamic>>[];
    final open = status == 'OPEN';
    return PremiumSurface(
      elevated: open,
      padding: const EdgeInsets.all(AaraagateTokens.space4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(poll['title']?.toString() ?? 'Community poll', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900))),
            AaraagateStatusPill(
              label: status.toLowerCase(),
              tone: open ? AaraagateStatusTone.info : AaraagateStatusTone.neutral,
            ),
          ]),
          if ((poll['description']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(poll['description'].toString()),
          ],
          const SizedBox(height: 14),
          for (final option in options) ...[
            SizedBox(
              width: double.infinity,
              child: myOptionId == option['id']?.toString()
                  ? FilledButton.tonalIcon(onPressed: null, icon: const Icon(Icons.check_circle_outline), label: Text(option['label']?.toString() ?? 'Option'))
                  : OutlinedButton(
                      onPressed: open && myOptionId == null && !busy ? () => onRespond(option) : null,
                      child: Text(option['label']?.toString() ?? 'Option'),
                    ),
            ),
            const SizedBox(height: 8),
          ],
          if (myOptionId != null) Text('Your response has been recorded.', style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.primary)),
          if (!open && myOptionId == null) Text('This poll is closed.', style: theme.textTheme.bodySmall),
        ]),
    );
  }
}
