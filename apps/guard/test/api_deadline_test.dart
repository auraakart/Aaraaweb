import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_operations_client.dart';

void main() {
  for (final partialBody in [false, true]) {
    test('guard bounds stalled ${partialBody ? "body" : "headers"} without retry', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      var calls = 0;
      String? key;
      server.listen((request) async {
        calls++;
        key = request.headers.value('Idempotency-Key');
        if (request.uri.path.endsWith('/summary')) {
          request.response.write('{"ok":true}');
          await request.response.close();
        } else if (partialBody) {
          request.response.write('{');
          await request.response.flush();
        }
      });
      final api = GuardApi(baseUrl: 'http://127.0.0.1:${server.port}', requestTimeout: const Duration(milliseconds: 200))..accessToken = 'test';
      await expectLater(api.checkIn('gate', 'credential', 'original'), throwsA(isA<GuardApiException>().having((e) => e.transport, 'recoverable transport failure', true)));
      expect(calls, 1);
      expect(key, 'original');
      expect(await GuardOperationsClient(api).summary(), {'ok': true});
    });
  }
}
