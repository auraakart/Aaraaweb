import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../localization/aaraagate_strings.dart';
import '../theme/aaraagate_theme.dart';

class HelpdeskTicketNumberReference extends StatelessWidget {
  const HelpdeskTicketNumberReference({required this.number});
  final String number;

  Future<void> _copy(BuildContext context) async {
    final strings = AaraagateStrings.device();
    try {
      await Clipboard.setData(ClipboardData(text: number));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(strings.text('helpdeskTicketNumberCopied'))),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(strings.text('helpdeskTicketNumberCopyFailed'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: AaraagateTokens.space2),
    child: Wrap(
      spacing: AaraagateTokens.space2,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SelectableText(
          number,
          semanticsLabel:
              '${AaraagateStrings.device().text('helpdeskTicketNumber')} $number',
        ),
        IconButton(
          tooltip: AaraagateStrings.device().text('helpdeskCopyTicketNumber'),
          onPressed: () => _copy(context),
          icon: const Icon(Icons.copy_rounded),
        ),
      ],
    ),
  );
}
