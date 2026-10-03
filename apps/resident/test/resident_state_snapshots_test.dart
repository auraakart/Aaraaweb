import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/resident_state_snapshots.dart';

void main() {
  test('household snapshot preserves family gate preferences and phone normalization', () {
    const householdId = 'household-1';
    final snapshot = ResidentHouseholdSnapshot([
      {
        'id': householdId,
        'unit': {
          'occupancies': [
            {
              'id': 'member-1',
              'relation': 'FAMILY_MEMBER',
              'gateApprovalEnabled': true,
              'gateNotificationEnabled': true,
              'primaryGateContact': true,
              'user': {'phone': '+91 98765-43210'},
            },
          ],
        },
        'emergencyContacts': [
          {'id': 'contact-1', 'name': 'Anita', 'phone': '98765 43210', 'relation': 'Sister', 'priority': 1},
        ],
      },
    ]);

    expect(snapshot.hasMatchingFamilyMember(
      householdId: householdId,
      phone: '919876543210',
      gateApprovalEnabled: true,
      gateNotificationEnabled: false,
      primaryGateContact: true,
    ), isTrue);
    expect(snapshot.hasMatchingEmergencyContact(
      householdId: householdId,
      name: 'anita',
      phone: '+91 98765 43210'.replaceFirst('+91 ', ''),
      relation: 'sister',
      priority: 1,
    ), isTrue);
  });

  test('workforce snapshot matches authoritative recovery state', () {
    final snapshot = ResidentWorkforceSnapshot(
      assignments: [
        {
          'id': 'assignment-1',
          'householdId': 'household-1',
          'worker': {'name': '  Maya  Rao ', 'phone': '+91 90000 00000', 'role': 'maid'},
        },
      ],
      leaves: [
        {'id': 'leave-1', 'assignmentId': 'assignment-1', 'active': true, 'startsOn': '2026-10-03', 'endsOn': '2026-10-04', 'reason': 'Family'},
      ],
      ratings: [
        {'assignmentId': 'assignment-1', 'score': 5, 'comment': 'Reliable'},
      ],
      accessRequests: [
        {'subjectType': 'DOMESTIC_HELP', 'status': 'CHECKED_IN', 'metadata': {'workforceAssignmentId': 'assignment-1'}},
      ],
    );

    expect(snapshot.isPresent('assignment-1'), isTrue);
    expect(snapshot.hasMatchingAssignment(
      householdId: 'household-1',
      name: 'Maya Rao',
      phone: '919000000000',
      role: 'MAID',
    ), isTrue);
    expect(snapshot.hasMatchingLeave(
      assignmentId: 'assignment-1',
      startsOn: DateTime(2026, 10, 3),
      endsOn: DateTime(2026, 10, 4),
      reason: 'Family',
    ), isTrue);
    expect(snapshot.ratingMatches('assignment-1', score: 5, comment: 'Reliable'), isTrue);
  });
}
