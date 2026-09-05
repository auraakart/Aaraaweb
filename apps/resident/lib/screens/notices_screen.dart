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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            Text('Society updates', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Important announcements and updates from your society.', style: theme.textTheme.bodyMedium),
            const SizedBox(height: 18),
            if (controller.loading && controller.notices.isEmpty)
              const AppStateCard(icon: Icons.sync_rounded, message: 'Loading society notices…', loading: true)
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
              for (final notice in controller.notices)
                _NoticeCard(
                  notice: notice,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => NoticeDetailScreen(notice: notice)),
                  ),
                ),
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
    final category = notice['category']?.toString();
    final published = _formatDate(notice['publishedAt']?.toString());
    final expires = _formatDate(notice['expiresAt']?.toString());
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const CircleAvatar(child: Icon(Icons.campaign_outlined)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      notice['title']?.toString() ?? 'Society notice',
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                notice['body']?.toString() ?? '',
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (category != null && category.isNotEmpty) Chip(label: Text(category)),
                  if (published != null) Chip(label: Text('Published $published')),
                  if (expires != null) Chip(label: Text('Until $expires')),
                ],
              ),
            ],
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
    final category = notice['category']?.toString();
    final published = _formatDate(notice['publishedAt']?.toString());
    final expires = _formatDate(notice['expiresAt']?.toString());
    return Scaffold(
      appBar: AppBar(title: const Text('Notice')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        children: [
          Text(notice['title']?.toString() ?? 'Society notice', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (category != null && category.isNotEmpty) Chip(label: Text(category)),
              if (published != null) Chip(label: Text('Published $published')),
              if (expires != null) Chip(label: Text('Valid until $expires')),
            ],
          ),
          const SizedBox(height: 20),
          Text(notice['body']?.toString() ?? '', style: theme.textTheme.bodyLarge?.copyWith(height: 1.55)),
        ],
      ),
    );
  }
}

String? _formatDate(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final value = DateTime.tryParse(raw)?.toLocal();
  if (value == null) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${value.day} ${months[value.month - 1]} ${value.year}';
}
