import '../localization/aaraagate_strings.dart';
import '../widgets/premium_ui.dart';

AaraagateStatusTone helpdeskPriorityTone(String priority) {
  switch (priority.toUpperCase()) {
    case 'URGENT':
      return AaraagateStatusTone.danger;
    case 'HIGH':
      return AaraagateStatusTone.warning;
    case 'LOW':
      return AaraagateStatusTone.neutral;
    default:
      return AaraagateStatusTone.info;
  }
}

String helpdeskDisplayLabel(String raw) {
  final normalized = raw.trim().toUpperCase();
  if ([
    'ON_TRACK',
    'RESPONSE_BREACHED',
    'RESOLUTION_BREACHED',
    'UNTRACKED',
    'MET',
  ].contains(normalized)) {
    return AaraagateStrings.device().text('status$normalized');
  }
  final key = {
    'OPEN': 'helpdeskOpen',
    'IN_PROGRESS': 'helpdeskInProgress',
    'RESOLVED': 'helpdeskResolved',
    'CLOSED': 'helpdeskClosed',
  }[raw.trim().toUpperCase()];
  if (key != null) return AaraagateStrings.device().text(key);
  return raw
      .trim()
      .toLowerCase()
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}
