class VisitorPassShareMessage {
  const VisitorPassShareMessage._();

  static String build({
    required String visitorName,
    required String credential,
    DateTime? validUntil,
  }) {
    final lines = <String>[
      'Aaraagate visitor pass for $visitorName',
      '',
      'Pass code: $credential',
      if (validUntil != null) 'Valid until: ${_format(validUntil.toLocal())}',
      '',
      'Please show this pass code at the gate. Share it only with the intended visitor.',
    ];
    return lines.join('\n');
  }

  static String _format(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '$day/$month/${value.year} $hour:$minute';
  }
}
