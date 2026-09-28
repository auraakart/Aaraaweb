import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class _EmergencyContactApi extends ApiClient {
  _EmergencyContactApi() : super(baseUrl: 'http://test.invalid', accessToken: 'test');

  final List<Map<String, dynamic>> contacts = <Map<String, dynamic>>[];
  final Map<String, Map<String, dynamic>> attempts = <String, Map<String, dynamic>>{};
  final List<String> addKeys = <String>[];
  bool failFirstAddResponse = true;
  bool failNextHouseholdRead = false;
  bool failFirstDeactivateResponse = true;

  List<Map<String, dynamic>> get households => [
        {
          'id': 'household-1',
          'unitId': 'unit-1',
          'emergencyContacts': contacts
              .where((item) => item['active'] != false)
              .map((item) => Map<String, dynamic>.from(item))
              .toList(growable: false),
        }
      ];

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/households/mine') {
      if (failNextHouseholdRead) {
        failNextHouseholdRead = false;
        throw ApiException(503, 'recovery read unavailable');
      }
      return households;
    }
    throw ApiException(404, 'Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    if (path == '/api/v1/households/household-1/emergency-contacts') {
      final payload = body ?? const <String, dynamic>{};
      final key = payload['idempotencyKey']!.toString();
      addKeys.add(key);
      final existing = attempts[key];
      if (existing != null) return Map<String, dynamic>.from(existing);

      final contact = <String, dynamic>{
        'id': 'contact-${attempts.length + 1}',
        'name': payload['name'],
        'phone': payload['phone'],
        'relation': payload['relation'],
        'priority': payload['priority'],
        'active': true,
      };
      attempts[key] = contact;
      contacts.add(contact);
      if (failFirstAddResponse) {
        failFirstAddResponse = false;
        failNextHouseholdRead = true;
        throw ApiException(503, 'transport lost after commit');
      }
      return Map<String, dynamic>.from(contact);
    }
    throw ApiException(404, 'Unexpected POST $path');
  }

  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    if (path == '/api/v1/households/household-1/emergency-contacts/contact-1/deactivate') {
      final contact = contacts.where((item) => item['id'] == 'contact-1').first;
      contact['active'] = false;
      if (failFirstDeactivateResponse) {
        failFirstDeactivateResponse = false;
        throw ApiException(503, 'transport lost after deactivate commit');
      }
      return Map<String, dynamic>.from(contact);
    }
    throw ApiException(404, 'Unexpected PATCH $path');
  }
}

void main() {
  test('emergency-contact add reuses request identity when response and first recovery read are lost', () async {
    final api = _EmergencyContactApi();
    final controller = ResidentDataController(
      ResidentRepository(api),
      activeUnitId: 'unit-1',
      fetchEntitlements: false,
    )..households = api.households;
    addTearDown(controller.dispose);

    await expectLater(
      controller.addEmergencyContact(
        householdId: 'household-1',
        name: 'Anita Rao',
        phone: '+91 98765 43210',
        relation: 'Sister',
        priority: 1,
      ),
      throwsA(isA<ApiException>()),
    );

    await controller.addEmergencyContact(
      householdId: 'household-1',
      name: 'Anita Rao',
      phone: '+91 98765 43210',
      relation: 'Sister',
      priority: 1,
    );

    expect(api.addKeys, hasLength(2));
    expect(api.addKeys[1], api.addKeys[0]);
    expect(api.contacts, hasLength(1));
    expect(controller.emergencyContactsForHousehold('household-1'), hasLength(1));
  });

  test('emergency-contact deactivate accepts authoritative absence after a lost response', () async {
    final api = _EmergencyContactApi();
    api
      ..failFirstAddResponse = false
      ..contacts.add({
        'id': 'contact-1',
        'name': 'Anita Rao',
        'phone': '+919876543210',
        'relation': 'Sister',
        'priority': 1,
        'active': true,
      });
    final controller = ResidentDataController(
      ResidentRepository(api),
      activeUnitId: 'unit-1',
      fetchEntitlements: false,
    )..households = api.households;
    addTearDown(controller.dispose);

    await controller.deactivateEmergencyContact(
      householdId: 'household-1',
      contactId: 'contact-1',
    );

    expect(controller.emergencyContactById('household-1', 'contact-1'), isNull);
  });
}
