class ResidentHouseholdSnapshot {
  const ResidentHouseholdSnapshot(this.households);
  final List<Map<String, dynamic>> households;

  Map<String, dynamic>? householdById(String householdId) =>
      households.where((item) => item['id']?.toString() == householdId).firstOrNull;

  List<Map<String, dynamic>> familyMembersForHousehold(String householdId) {
    final unit = householdById(householdId)?['unit'];
    final occupancies = unit is Map ? unit['occupancies'] : null;
    if (occupancies is! List) return const [];
    return occupancies
        .whereType<Map>()
        .where((item) => item['relation']?.toString() == 'FAMILY_MEMBER')
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Map<String, dynamic>? familyMemberById(String householdId, String occupancyId) =>
      familyMembersForHousehold(householdId)
          .where((item) => item['id']?.toString() == occupancyId)
          .firstOrNull;

  bool hasMatchingFamilyMember({
    required String householdId,
    required String phone,
    required bool gateApprovalEnabled,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) {
    final expectedPhone = normalizePhone(phone);
    final expectedNotification = primaryGateContact ? true : gateNotificationEnabled;
    return familyMembersForHousehold(householdId).any((item) {
      final user = item['user'];
      final userMap = user is Map ? user : const <String, dynamic>{};
      return normalizePhone(userMap['phone']?.toString() ?? '') == expectedPhone &&
          item['gateApprovalEnabled'] == gateApprovalEnabled &&
          item['gateNotificationEnabled'] == expectedNotification &&
          item['primaryGateContact'] == primaryGateContact;
    });
  }

  bool familyMemberSettingsMatch({
    required String householdId,
    required String occupancyId,
    required bool gateApprovalEnabled,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) {
    final member = familyMemberById(householdId, occupancyId);
    if (member == null) return false;
    final expectedNotification = primaryGateContact ? true : gateNotificationEnabled;
    return member['gateApprovalEnabled'] == gateApprovalEnabled &&
        member['gateNotificationEnabled'] == expectedNotification &&
        member['primaryGateContact'] == primaryGateContact;
  }

  List<Map<String, dynamic>> emergencyContactsForHousehold(String householdId) {
    final contacts = householdById(householdId)?['emergencyContacts'];
    if (contacts is! List) return const [];
    return contacts.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList(growable: false);
  }

  Map<String, dynamic>? emergencyContactById(String householdId, String contactId) =>
      emergencyContactsForHousehold(householdId)
          .where((item) => item['id']?.toString() == contactId)
          .firstOrNull;

  bool hasMatchingEmergencyContact({
    required String householdId,
    required String name,
    required String phone,
    String? relation,
    required int priority,
    Set<String> excludingIds = const <String>{},
  }) {
    final expectedName = name.trim().toLowerCase();
    final expectedPhone = normalizePhone(phone);
    final expectedRelation = relation?.trim().toLowerCase() ?? '';
    return emergencyContactsForHousehold(householdId).any((item) {
      final id = item['id']?.toString();
      if (id != null && excludingIds.contains(id)) return false;
      return (item['name']?.toString().trim().toLowerCase() ?? '') == expectedName &&
          normalizePhone(item['phone']?.toString() ?? '') == expectedPhone &&
          (item['relation']?.toString().trim().toLowerCase() ?? '') == expectedRelation &&
          (item['priority'] as num?)?.toInt() == priority;
    });
  }

  static String normalizePhone(String value) => value.replaceAll(RegExp(r'\D'), '');
}

class ResidentWorkforceSnapshot {
  const ResidentWorkforceSnapshot({
    required this.assignments,
    required this.leaves,
    required this.ratings,
    required this.accessRequests,
  });

  final List<Map<String, dynamic>> assignments;
  final List<Map<String, dynamic>> leaves;
  final List<Map<String, dynamic>> ratings;
  final List<Map<String, dynamic>> accessRequests;

  bool isPresent(String assignmentId) => accessRequests.any((request) {
        if (request['subjectType']?.toString() != 'DOMESTIC_HELP' || request['status']?.toString() != 'CHECKED_IN') return false;
        final metadata = request['metadata'];
        return metadata is Map && metadata['workforceAssignmentId']?.toString() == assignmentId;
      });

  Map<String, dynamic>? ratingFor(String assignmentId) =>
      ratings.where((item) => item['assignmentId']?.toString() == assignmentId).firstOrNull;

  List<Map<String, dynamic>> leavesFor(String assignmentId) =>
      leaves.where((item) => item['assignmentId']?.toString() == assignmentId && item['active'] != false).toList(growable: false);

  bool isLeaveActive(String leaveId) => leaves.any((item) => item['id']?.toString() == leaveId && item['active'] != false);

  Map<String, dynamic>? assignmentFor(String assignmentId) =>
      assignments.where((item) => item['id']?.toString() == assignmentId).firstOrNull;

  bool hasMatchingLeave({required String assignmentId, required DateTime startsOn, required DateTime endsOn, String? reason}) {
    final normalizedReason = reason?.trim() ?? '';
    return leavesFor(assignmentId).any((item) =>
        sameDateOnly(item['startsOn'], startsOn) &&
        sameDateOnly(item['endsOn'], endsOn) &&
        (item['reason']?.toString().trim() ?? '') == normalizedReason);
  }

  bool ratingMatches(String assignmentId, {required int score, String? comment}) {
    final rating = ratingFor(assignmentId);
    if (rating == null) return false;
    return int.tryParse(rating['score']?.toString() ?? '') == score &&
        (rating['comment']?.toString().trim() ?? '') == (comment?.trim() ?? '');
  }

  bool hasMatchingAssignment({required String householdId, required String name, required String phone, required String role}) {
    final expectedName = normalizeName(name);
    final expectedPhone = normalizePhone(phone);
    final expectedRole = role.trim().toUpperCase();
    return assignments.any((item) {
      if (item['householdId']?.toString() != householdId) return false;
      final worker = item['worker'];
      final workerMap = worker is Map ? worker : item;
      return normalizeName(workerMap['name']?.toString() ?? '') == expectedName &&
          normalizePhone(workerMap['phone']?.toString() ?? '') == expectedPhone &&
          (workerMap['role']?.toString().trim().toUpperCase() ?? '') == expectedRole;
    });
  }

  static bool sameDateOnly(Object? raw, DateTime expected) {
    final parsed = DateTime.tryParse(raw?.toString() ?? '');
    return parsed != null && parsed.year == expected.year && parsed.month == expected.month && parsed.day == expected.day;
  }

  static String normalizeName(String value) => value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();
  static String normalizePhone(String value) => value.replaceAll(RegExp(r'\D'), '');
}

extension _FirstOrNullSnapshot<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
