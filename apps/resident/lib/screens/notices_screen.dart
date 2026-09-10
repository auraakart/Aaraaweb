import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../widgets/app_state_card.dart';

class NoticesScreen extends StatelessWidget {
  const NoticesScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Notices')),
      body: RefreshIndicator(
        onRefresh: controller.refreshNotices,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Text('Society updates', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -.3)),
            const SizedBox(height: 6),
            Text('Announcements that matter to your current community.', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 20),
            if (controller.loading && controller.notices.isEmpty)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading society notices…', loading: true)
            else if (controller.noticesError != null)
              AppStateCard(icon: Icons.error_outline_rounded, message: 'Notices could not be loaded.', actionLabel: 'Retry', onAction: controller.refreshNotices)
            else if (controller.notices.isEmpty)
              const AppStateCard(icon: Icons.campaign_outlined, message: 'No active notices right now.')
            else
              for (final notice in controller.notices) ...[
                _NoticeCard(
                  notice: notice,
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => NoticeDetailScreen(notice: notice))),
                ),
                const SizedBox(height: 10),
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

    return Semantics(
      button: true,
      label: '${notice['title'] ?? 'Society notice'}${urgent ? ', urgent' : ''}',
      child: Material(
        color: urgent ? scheme.errorContainer.withOpacity(.35) : scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: urgent ? scheme.errorContainer : scheme.primaryContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(urgent ? Icons.warning_amber_rounded : Icons.campaign_outlined, color: urgent ? scheme.onErrorContainer : scheme.onPrimaryContainer),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        [if (category.isNotEmpty) category, if (published != null) published].join(' • '),
                        style: theme.textTheme.labelMedium?.copyWith(color: urgent ? scheme.error : scheme.primary, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 6),
                      Text(notice['title']?.toString() ?? 'Society notice', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                      if (body.isNotEmpty) ...[
                        const SizedBox(height: 5),
                        Text(body, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium?.copyWith(height: 1.4, color: scheme.onSurfaceVariant)),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Padding(padding: EdgeInsets.only(top: 10), child: Icon(Icons.chevron_right_rounded)),
              ],
            ),
          ),
        ),
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

    return Scaffold(
      appBar: AppBar(title: const Text('Notice')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 36),
        children: [
          Row(children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(color: urgent ? scheme.errorContainer : scheme.primaryContainer, borderRadius: BorderRadius.circular(16)),
              child: Icon(urgent ? Icons.warning_amber_rounded : Icons.campaign_outlined, color: urgent ? scheme.onErrorContainer : scheme.onPrimaryContainer),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                [if (category.isNotEmpty) category, if (published != null) published].join(' • '),
                style: theme.textTheme.labelLarge?.copyWith(color: urgent ? scheme.error : scheme.primary, fontWeight: FontWeight.w800),
              ),
            ),
          ]),
          const SizedBox(height: 18),
          Text(notice['title']?.toString() ?? 'Society notice', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -.3)),
          if (expires != null) ...[
            const SizedBox(height: 8),
            Text('Valid until $expires', style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
          ],
          const SizedBox(height: 22),
          Text(notice['body']?.toString() ?? '', style: theme.textTheme.bodyLarge?.copyWith(height: 1.6)),
        ],
      ),
    );
  }
}

String _label(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '';
  return raw.toLowerCase().split('_').map((part) => part.isEmpty ? '' : '${part[0].toUpperCase()}${part.substring(1)}').join(' ');
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
