import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../data/resident_data_controller.dart';
import '../data/resident_error_message.dart';
import '../localization/aaraagate_strings.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';
import '../widgets/visitor_pass_share_message.dart';

class GateScreen extends StatelessWidget {
  const GateScreen({super.key, required this.controller});
  final ResidentDataController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = AaraagateStrings.device();
    final requests = controller.accessRequests;
    final pending = requests.where((e) => e['status'] == 'PENDING').toList(growable: false);
    final inside = requests.where((e) => e['status'] == 'CHECKED_IN').length;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            LayoutBuilder(
              builder: (context, constraints) {
                final scale = MediaQuery.textScalerOf(context).scale(1);
                final stacked = constraints.maxWidth < 420 || scale > 1.3;
                final copy = Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      strings.text('gateTitle'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, letterSpacing: -.3),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      strings.text('gateSubtitle'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                );
                final action = IconButton.filledTonal(
                  tooltip: strings.text('inviteGuest'),
                  onPressed: () => _invite(context),
                  icon: const Icon(Icons.person_add_alt_1_rounded),
                );
                if (stacked) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      copy,
                      const SizedBox(height: 10),
                      Align(alignment: Alignment.centerRight, child: action),
                    ],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: copy),
                    const SizedBox(width: 12),
                    action,
                  ],
                );
              },
            ),
            const SizedBox(height: 20),
            _GateSummary(waiting: pending.length, inside: inside, total: requests.length, strings: strings),
            if (pending.isNotEmpty) ...[
              const SizedBox(height: 24),
              _SectionTitle(title: strings.text('needsAttention'), count: pending.length),
              const SizedBox(height: 12),
              for (final request in pending) ...[
                _AccessCard(
                  request: request,
                  strings: strings,
                  prominent: true,
                  onApprove: () => _approve(context, request),
                  onDeny: () => _deny(context, request),
                ),
                const SizedBox(height: 12),
              ],
            ],
            const SizedBox(height: 24),
            LayoutBuilder(
              builder: (context, constraints) {
                final scale = MediaQuery.textScalerOf(context).scale(1);
                final title = Text(strings.text('recentActivity'), style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800));
                final invite = TextButton.icon(onPressed: () => _invite(context), icon: const Icon(Icons.add_rounded), label: Text(strings.text('invite')));
                if (constraints.maxWidth < 420 || scale > 1.3) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      title,
                      const SizedBox(height: 6),
                      Align(alignment: Alignment.centerRight, child: invite),
                    ],
                  );
                }
                return Row(children: [Expanded(child: title), invite]);
              },
            ),
            const SizedBox(height: 8),
            if (controller.loading && requests.isEmpty)
              AppStateCard(icon: Icons.sync_rounded, message: strings.text('loadingActivity'), loading: true)
            else if (controller.accessError != null)
              AppStateCard(icon: Icons.cloud_off_outlined, message: strings.text('loadFailed'), actionLabel: strings.text('retry'), onAction: controller.load)
            else if (requests.isEmpty)
              AppStateCard(icon: Icons.shield_outlined, message: strings.text('emptyActivity'))
            else
              for (final request in requests.where((e) => e['status'] != 'PENDING')) ...[
                _AccessCard(
                  request: request,
                  strings: strings,
                  onCancel: request['status'] == 'APPROVED' && request['subjectType'] == 'VISITOR' ? () => _cancel(context, request) : null,
                ),
                const SizedBox(height: 10),
              ],
          ],
        ),
      ),
    );
  }

  Future<void> _invite(BuildContext context) async {
    final input = await showModalBottomSheet<_GuestInviteInput>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => const _GuestInviteSheet(),
    );

    try {
      if (input == null || !context.mounted) return;
      final pass = await controller.createGuest(
        name: input.name,
        phone: input.phone,
        purpose: input.purpose,
      );
      if (!context.mounted) return;
      await _showPass(context, pass);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(residentErrorMessage(e))));
    }
  }

  Future<void> _approve(BuildContext context, Map<String, dynamic> request) async {
    try {
      final result = await controller.approveAccess(request['id'].toString());
      final rawRequest = result['request'];
      final credential = result['credential']?.toString();
      if (!context.mounted) return;
      final strings = AaraagateStrings.device();
      final subjectType = rawRequest is Map ? rawRequest['subjectType']?.toString() : request['subjectType']?.toString();
      if (subjectType == 'VISITOR' && rawRequest is Map && credential != null && credential.isNotEmpty) {
        await _showPass(context, {'request': Map<String, dynamic>.from(rawRequest), 'credential': credential});
        return;
      }
      final label = subjectType == 'CAB' ? strings.text('cab') : subjectType == 'DELIVERY' ? strings.text('delivery') : strings.text('entry');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(strings.format('approvedSecurity', {'label': label}))));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(residentErrorMessage(e))));
    }
  }

  Future<void> _deny(BuildContext context, Map<String, dynamic> request) async {
    try {
      await controller.denyAccess(request['id'].toString());
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(residentErrorMessage(e))));
    }
  }

  Future<void> _cancel(BuildContext context, Map<String, dynamic> request) async {
    try {
      await controller.cancelAccess(request['id'].toString());
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(residentErrorMessage(e))));
    }
  }

  Future<void> _showPass(BuildContext context, Map<String, dynamic> pass) async {
    final strings = AaraagateStrings.device();
    final request = pass['request'];
    final visitor = request is Map ? request['subjectName']?.toString() ?? strings.text('visitor') : strings.text('visitor');
    final credential = pass['credential']?.toString() ?? '';
    final validUntil = request is Map ? DateTime.tryParse(request['validUntil']?.toString() ?? '') : null;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) {
        final theme = Theme.of(sheetContext);
        final scheme = theme.colorScheme;
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(16)),
                child: Icon(Icons.check_rounded, color: scheme.onPrimaryContainer),
              ),
              const SizedBox(height: 12),
              Text(strings.text('visitorPassReady'), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text(visitor, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                child: Semantics(label: strings.text('visitorQr'), child: QrImageView(data: credential, version: QrVersions.auto, size: 210)),
              ),
              const SizedBox(height: 14),
              SelectableText(credential, textAlign: TextAlign.center, style: theme.textTheme.titleSmall?.copyWith(fontFamily: 'monospace', fontWeight: FontWeight.w800, letterSpacing: 1.2)),
              if (validUntil != null) ...[
                const SizedBox(height: 8),
                Text(strings.format('validUntil', {'time': _formatDateTime(validUntil.toLocal())}), style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () async {
                    final message = VisitorPassShareMessage.build(visitorName: visitor, credential: credential, validUntil: validUntil);
                    await Share.share(message, subject: 'Aaraagate visitor pass for $visitor');
                  },
                  icon: const Icon(Icons.share_outlined),
                  label: Text(strings.text('sharePass')),
                ),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: credential));
                  if (sheetContext.mounted) ScaffoldMessenger.of(sheetContext).showSnackBar(SnackBar(content: Text(strings.text('passCopied'))));
                },
                icon: const Icon(Icons.copy_rounded),
                label: Text(strings.text('copyCredential')),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _GuestInviteInput {
  const _GuestInviteInput({required this.name, this.phone, this.purpose});

  final String name;
  final String? phone;
  final String? purpose;
}

class _GuestInviteSheet extends StatefulWidget {
  const _GuestInviteSheet();

  @override
  State<_GuestInviteSheet> createState() => _GuestInviteSheetState();
}

class _GuestInviteSheetState extends State<_GuestInviteSheet> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _purpose = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _purpose.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    Navigator.pop(
      context,
      _GuestInviteInput(
        name: _name.text.trim(),
        phone: _phone.text.trim().isEmpty ? null : _phone.text.trim(),
        purpose: _purpose.text.trim().isEmpty ? null : _purpose.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = AaraagateStrings.device();
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(strings.text('inviteTitle'), style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(strings.text('inviteSubtitle'), style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 20),
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.name],
              decoration: InputDecoration(labelText: strings.text('guestName'), prefixIcon: const Icon(Icons.person_outline_rounded)),
              validator: (value) => (value?.trim().isEmpty ?? true) ? strings.text('guestNameError') : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.telephoneNumber],
              decoration: InputDecoration(labelText: strings.text('phoneOptional'), prefixIcon: const Icon(Icons.phone_outlined)),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _purpose,
              textCapitalization: TextCapitalization.sentences,
              onFieldSubmitted: (_) => _submit(),
              decoration: InputDecoration(labelText: strings.text('purposeOptional'), prefixIcon: const Icon(Icons.notes_rounded)),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _submit,
                icon: const Icon(Icons.qr_code_2_rounded),
                label: Text(strings.text('createPass')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.count});
  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(children: [
      Expanded(child: Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
      Container(
        constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(color: theme.colorScheme.errorContainer, borderRadius: BorderRadius.circular(999)),
        child: Text('$count', style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onErrorContainer, fontWeight: FontWeight.w800)),
      ),
    ]);
  }
}

class _GateSummary extends StatelessWidget {
  const _GateSummary({required this.waiting, required this.inside, required this.total, required this.strings});
  final int waiting;
  final int inside;
  final int total;
  final AaraagateStrings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(color: scheme.surfaceContainerLow, borderRadius: BorderRadius.circular(20)),
      child: Row(children: [
        Expanded(child: _Metric(label: strings.text('waiting'), value: '$waiting')),
        _Divider(color: scheme.outlineVariant),
        Expanded(child: _Metric(label: strings.text('inside'), value: '$inside')),
        _Divider(color: scheme.outlineVariant),
        Expanded(child: _Metric(label: strings.text('today'), value: '$total')),
      ]),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider({required this.color});
  final Color color;
  @override
  Widget build(BuildContext context) => Container(width: 1, height: 34, color: color);
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      label: '$label $value',
      child: Column(children: [
        Text(value, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
        const SizedBox(height: 2),
        Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      ]),
    );
  }
}

class _AccessCard extends StatelessWidget {
  const _AccessCard({required this.request, required this.strings, this.onApprove, this.onDeny, this.onCancel, this.prominent = false});
  final Map<String, dynamic> request;
  final AaraagateStrings strings;
  final VoidCallback? onApprove;
  final VoidCallback? onDeny;
  final VoidCallback? onCancel;
  final bool prominent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final title = request['subjectName']?.toString() ?? 'Unknown';
    final rawType = request['subjectType']?.toString();
    final type = _label(rawType);
    final status = _label(request['status']?.toString());
    final metadata = request['metadata'] is Map ? Map<String, dynamic>.from(request['metadata'] as Map) : const <String, dynamic>{};
    final provider = metadata['provider']?.toString();
    final vehicleNumber = metadata['vehicleNumber']?.toString();
    final detail = [
      if (provider != null && provider.trim().isNotEmpty) provider.trim(),
      if (vehicleNumber != null && vehicleNumber.trim().isNotEmpty) vehicleNumber.trim(),
    ].join(' · ');
    final icon = switch (rawType) {
      'DELIVERY' => Icons.delivery_dining_rounded,
      'CAB' => Icons.local_taxi_rounded,
      'DOMESTIC_HELP' => Icons.cleaning_services_outlined,
      'SERVICE_PROVIDER' => Icons.home_repair_service_outlined,
      _ => Icons.person_outline_rounded,
    };
    final approvalHint = request['status'] == 'PENDING' && rawType == 'CAB'
        ? strings.text('allow15')
        : request['status'] == 'PENDING' && rawType == 'DELIVERY'
            ? strings.text('allow30')
            : null;

    return Semantics(
      container: true,
      label: '$title, $type, $status',
      child: PremiumSurface(
        elevated: prominent,
        color: prominent ? scheme.surface : scheme.surfaceContainerLow,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final scale = MediaQuery.textScalerOf(context).scale(1);
              final stacked = constraints.maxWidth < 420 || scale > 1.3;
              final identity = Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(16)),
                    child: Icon(icon, color: scheme.onPrimaryContainer),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(detail.isEmpty ? type : '$type · $detail', maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant)),
                    ]),
                  ),
                ],
              );
              final statusPill = AaraagateStatusPill(
                label: status,
                tone: request['status'] == 'PENDING' ? AaraagateStatusTone.warning : AaraagateStatusTone.success,
              );
              if (stacked) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    identity,
                    const SizedBox(height: 8),
                    Align(alignment: Alignment.centerLeft, child: statusPill),
                  ],
                );
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: identity),
                  const SizedBox(width: 8),
                  statusPill,
                ],
              );
            },
          ),
          if (approvalHint != null) ...[
            const SizedBox(height: 10),
            Text(approvalHint, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
          ],
          if (onApprove != null || onDeny != null || onCancel != null) ...[
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) {
                final scale = MediaQuery.textScalerOf(context).scale(1);
                final deny = onDeny == null ? null : OutlinedButton(onPressed: onDeny, child: Text(strings.text('deny')));
                final approve = onApprove == null
                    ? null
                    : FilledButton(
                        onPressed: onApprove,
                        child: Text(rawType == 'CAB' || rawType == 'DELIVERY' ? strings.text('allowEntry') : strings.text('allow')),
                      );
                final cancel = onCancel == null
                    ? null
                    : OutlinedButton.icon(
                        onPressed: onCancel,
                        icon: const Icon(Icons.close_rounded),
                        label: Text(strings.text('cancelPass')),
                      );
                if (constraints.maxWidth < 420 || scale > 1.3) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (deny != null) deny,
                      if (deny != null && approve != null) const SizedBox(height: 8),
                      if (approve != null) approve,
                      if ((deny != null || approve != null) && cancel != null) const SizedBox(height: 8),
                      if (cancel != null) cancel,
                    ],
                  );
                }
                return Row(children: [
                  if (deny != null) Expanded(child: deny),
                  if (deny != null && approve != null) const SizedBox(width: 12),
                  if (approve != null) Expanded(child: approve),
                  if (cancel != null) Expanded(child: cancel),
                ]);
              },
            ),
          ],
        ]),
      ),
    );
  }

  static String _label(String? value) => (value ?? '').toLowerCase().split('_').map((e) => e.isEmpty ? e : '${e[0].toUpperCase()}${e.substring(1)}').join(' ');
}

String _formatDateTime(DateTime value) {
  final hour = value.hour % 12 == 0 ? 12 : value.hour % 12;
  final minute = value.minute.toString().padLeft(2, '0');
  final period = value.hour >= 12 ? 'PM' : 'AM';
  return '${value.day}/${value.month}/${value.year} · $hour:$minute $period';
}
