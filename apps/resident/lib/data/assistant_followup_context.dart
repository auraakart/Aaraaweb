/// Follow-ups are intentionally limited to general, published society rules.
/// Private household, finance, gate and other resident facts are never copied
/// into a later request. The server still runs fresh authorization on every call.
String expandSocietyPolicyFollowup(String prompt, {
  required String? previousQuestion,
  required String? previousIntent,
}) {
  if (previousIntent != 'SOCIETY_KNOWLEDGE' || previousQuestion == null) return prompt;
  final followup = RegExp(
    r'^(?:(?:and|what about|how about)\s+)(?:the\s+)?(weekends?|weekdays?|tenants?|owners?|guests?|visitors?|children)\s*\??$',
    caseSensitive: false,
  ).firstMatch(prompt.trim());
  if (followup == null) return prompt;
  final old = previousQuestion.toLowerCase();
  const topics = <String, String>{
    'swimming pool': 'swimming pool',
    'pool': 'pool',
    'gym': 'gym',
    'clubhouse': 'clubhouse',
    'parking': 'parking',
    'garbage': 'garbage collection',
    'waste': 'waste collection',
    'pets': 'pet',
    'renovation': 'renovation',
  };
  String? subject;
  for (final entry in topics.entries) {
    if (RegExp(r'(^|[^a-z])'+RegExp.escape(entry.key)+r'([^a-z]|$)').hasMatch(old)) {
      subject = entry.value;
      break;
    }
  }
  if (subject == null) return prompt;
  final filter = followup.group(1)!.toLowerCase();
  if (filter.startsWith('week')) {
    return 'What are $subject rules and timings for $filter?';
  }
  return 'What are $subject rules for $filter?';
}
