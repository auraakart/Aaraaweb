import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'http://localhost', accessToken: 'token');

  String? method;
  String? path;
  Map<String, dynamic>? body;

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    method = 'POST';
    this.path = path;
    this.body = body;
    return {'id': 'assignment-1'};
  }

  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    method = 'PATCH';
    this.path = path;
    this.body = body;
    return {'id': 'assignment-1', 'active': false};
  }
}

void main() {
  test('submits a normalized household workforce assignment', () async {
    final api = FakeApiClient();
    final repository = ResidentRepository(api);

    await repository.addWorkforce(
      householdId: 'household-1',
      name: '  Maya  ',
      phone: ' +91 99000 00000 ',
      role: 'MAID',
    );

    expect(api.method, 'POST');
    expect(api.path, '/api/v1/workforce');
    expect(api.body, {
      'householdId': 'household-1',
      'name': 'Maya',
      'phone': '+91 99000 00000',
      'role': 'MAID',
    });
  });

  test('ends only the selected workforce assignment', () async {
    final api = FakeApiClient();
    final repository = ResidentRepository(api);

    await repository.deactivateWorkforce('assignment-1');

    expect(api.method, 'PATCH');
    expect(api.path, '/api/v1/workforce/assignments/assignment-1/deactivate');
  });
}
