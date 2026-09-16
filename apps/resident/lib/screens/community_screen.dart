import 'package:flutter/material.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/premium_ui.dart';

class CommunityScreen extends StatelessWidget {
  const CommunityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          AaraagateTokens.pageGutter,
          AaraagateTokens.space4,
          AaraagateTokens.pageGutter,
          AaraagateTokens.space8,
        ),
        children: [
          Text('Community', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: AaraagateTokens.space1),
          Text('Notices, helpdesk and society updates in one place.', style: theme.textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(height: AaraagateTokens.space5),
          Row(children: [
            Expanded(
              child: SizedBox(
                height: AaraagateTokens.primaryActionHeight,
                child: FilledButton.tonalIcon(onPressed: () {}, icon: const Icon(Icons.support_agent_outlined), label: const Text('Helpdesk')),
              ),
            ),
            const SizedBox(width: AaraagateTokens.space3),
            Expanded(
              child: SizedBox(
                height: AaraagateTokens.primaryActionHeight,
                child: FilledButton.tonalIcon(onPressed: () {}, icon: const Icon(Icons.event_outlined), label: const Text('Events')),
              ),
            ),
          ]),
          const SizedBox(height: AaraagateTokens.space6),
          const PremiumSectionHeader(title: 'Latest notices', supportingText: 'Recent updates from your society.'),
          const SizedBox(height: AaraagateTokens.space3),
          PremiumSurface(
            padding: EdgeInsets.zero,
            child: Column(children: [
              _CommunityTile(icon: Icons.water_drop_outlined, title: 'Water shutdown tomorrow', subtitle: 'Block A · 10:00 AM–1:00 PM'),
              Divider(height: 1, color: scheme.outlineVariant),
              _CommunityTile(icon: Icons.celebration_outlined, title: 'Ganesh Chaturthi gathering', subtitle: 'Clubhouse · Saturday 6:00 PM'),
            ]),
          ),
          const SizedBox(height: AaraagateTokens.space6),
          const PremiumSectionHeader(title: 'Open helpdesk', supportingText: 'Issues currently being worked on for your community.'),
          const SizedBox(height: AaraagateTokens.space3),
          PremiumSurface(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: AaraagateTokens.iconContainer,
                  height: AaraagateTokens.iconContainer,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
                  child: Icon(Icons.build_outlined, color: scheme.onPrimaryContainer),
                ),
                const SizedBox(width: AaraagateTokens.space3),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Lift noise near 12th floor', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: AaraagateTokens.space1),
                    Text('Assigned to Facility Team · Updated 40 min ago', style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                    const SizedBox(height: AaraagateTokens.space3),
                    const AaraagateStatusPill(label: 'In progress', tone: AaraagateStatusTone.info),
                  ]),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CommunityTile extends StatelessWidget {
  const _CommunityTile({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return ListTile(
      minTileHeight: AaraagateTokens.minTouchTarget,
      contentPadding: const EdgeInsets.symmetric(horizontal: AaraagateTokens.space4, vertical: AaraagateTokens.space2),
      leading: Container(
        width: AaraagateTokens.iconContainer,
        height: AaraagateTokens.iconContainer,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(AaraagateTokens.radiusSmall)),
        child: Icon(icon, color: scheme.primary),
      ),
      title: Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right_rounded),
    );
  }
}
