import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';
import 'community_polls_screen.dart';

class NoticesScreen extends StatelessWidget {
  const NoticesScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    final activeCount = controller.notices.length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notices'),
        actions: [
          IconButton(
            tooltip: 'Community polls',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => CommunityPollsScreen(repository: controller.repository),
              ),
            ),
            icon: const Icon(Icons.poll_outlined),
          ),
          const SizedBox(width: AaraagateTokens.space2),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.refreshNotices,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AaraagateTokens.pageGutter,
            AaraagateTokens.space3,
            AaraagateTokens.pageGutter,
            AaraagateTokens.space8,
          ),
          children: [
            PremiumSectionHeader(
              title: 'Society updates',
              supportingText: activeCount == 0
                  ? 'Important announcements from your current community appear here.'
                  : '$activeCount active update${activeCount == 1 ? '' : 's'} from your current community.',
            ),
            const SizedBox(height: AaraagateTokens.space4),
            if (controller.loading && controller.notices.isEmpty)
              const AppStateCard(
                icon: Icons.sync_rounded,
                message: 'Loading society notices…',
                loading: true,
              )
            else if (controller.noticesError != null)
              AppStateCard(
                icon: Icons.error_outline_rounded,
                message: 'Notices could not be loaded.',
                actionLabel: 'Retry',
                onAction: controller.refreshNotices,
              )
            else if (controller.notices.isEmpty)
              const AppStateCard(
                icon: Icons.campaign_outlined,
                message: 'No active notices right now.',
              )
            else
              for (final notice in controller.notices) ...[
                _NoticeCard(
                  notice: notice,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => NoticeDetailScreen(notice: notice)),
                  ),
                ),
                const SizedBox(height: AaraagateTokens.space3),
              ],
          ],
        ),
      ),
    );
  }
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({required this.notice, required this.onTap});
  final Map<String, dynamic> notice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final category = _label(notice['category']?.toString());
    final published = _formatDate(notice['publishedAt']?.toString());
    final body = notice['body']?.toString() ?? '';
    final urgent = _isUrgent(notice['category']?.toString(), notice['title']?.toString());
    final metadata = [if (category.isNotEmpty) category, if (published != null) published].join(' • ');

    return PremiumSurface(
      onTap: onTap,
      semanticLabel: '${notice['title'] ?? 'Society notice'}${urgent ? ', urgent' : ''}',
      color: urgent ? scheme.errorContainer.withValues(alpha: .28) : scheme.surfaceContainerLow,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: AaraagateTokens.iconContainer,
            height: AaraagateTokens.iconContainer,
            decoration: BoxDecoration(
              color: urgent ? scheme.errorContainer : scheme.primaryContainer,
              borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall),
            ),
            child: Icon(
              urgent ? Icons.warning_amber_rounded : Icons.campaign_outlined,
              color: urgent ? scheme.onErrorContainer : scheme.onPrimaryContainer,
            ),
          ),
          const SizedBox(width: AaraagateTokens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (metadata.isNotEmpty)
                  Text(
                    metadata,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: urgent ? scheme.error : scheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                if (metadata.isNotEmpty) const SizedBox(height: AaraagateTokens.space1),
                Text(
                  notice['title']?.toString() ?? 'Society notice',
                  style: theme.textTheme.titleMedium,
                ),
                if (body.isNotEmpty) ...[
                  const SizedBox(height: AaraagateTokens.space1),
                  Text(
                    body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      height: 1.4,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AaraagateTokens.space2),
          Padding(
            padding: const EdgeInsets.only(top: AaraagateTokens.space2),
            child: Icon(
              Icons.chevron_right_rounded,
              color: scheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class NoticeDetailScreen extends StatelessWidget {
  const NoticeDetailScreen({super.key, required this.notice});
  final Map<String, dynamic> notice;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final category = _label(notice['category']?.toString());
    final published = _formatDate(notice['publishedAt']?.toString());
    final expires = _formatDate(notice['expiresAt']?.toString());
    final urgent = _isUrgent(notice['category']?.toString(), notice['title']?.toString());
    final metadata = [if (category.isNotEmpty) category, if (published != null) published].join(' • ');

    return Scaffold(
      appBar: AppBar(title: const Text('Notice')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AaraagateTokens.pageGutter,
          AaraagateTokens.space4,
          AaraagateTokens.pageGutter,
          36,
        ),
        children: [
          Row(
            children: [
              Container(
                width: AaraagateTokens.iconContainer,
                height: AaraagateTokens.iconContainer,
                decoration: BoxDecoration(
                  color: urgent ? scheme.errorContainer : scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(AaraagateTokens.radiusControl),
                ),
                child: Icon(
                  urgent ? Icons.warning_amber_rounded : Icons.campaign_outlined,
                  color: urgent ? scheme.onErrorContainer : scheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(width: AaraagateTokens.space3),
              if (metadata.isNotEmpty)
                Expanded(
                  child: Text(
                    metadata,
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: urgent ? scheme.error : scheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AaraagateTokens.space5),
          Text(
            notice['title']?.toString() ?? 'Society notice',
            style: theme.textTheme.headlineSmall,
          ),
          if (expires != null) ...[
            const SizedBox(height: AaraagateTokens.space2),
            AaraagateStatusPill(
              label: 'Valid until $expires',
              tone: urgent ? AaraagateStatusTone.warning : AaraagateStatusTone.neutral,
            ),
          ],
          const SizedBox(height: AaraagateTokens.space6),
          Text(
            notice['body']?.toString() ?? '',
            style: theme.textTheme.bodyLarge?.copyWith(height: 1.6),
          ),
        ],
      ),
    );
  }
}

String _label(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '';
  return raw
      .toLowerCase()
      .split('_')
      .map((part) => part.isEmpty ? '' : '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

bool _isUrgent(String? category, String? title) {
  final value = '${category ?? ''} ${title ?? ''}'.toLowerCase();
  return value.contains('emergency') || value.contains('urgent') || value.contains('critical');
}

String? _formatDate(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final value = DateTime.tryParse(raw)?.toLocal();
  if (value == null) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${value.day} ${months[value.month - 1]} ${value.year}';
}
