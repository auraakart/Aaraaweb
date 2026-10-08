import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:aaraagate_resident/data/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

Future<HttpServer> localServer(void Function(HttpRequest) handler) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen(handler);
  return server;
}

String address(HttpServer server) => 'http://127.0.0.1:${server.port}';

void main() {
  test('a stalled GET has a bounded deadline and retryable response', () async {
    final server = await localServer((_) {});
    addTearDown(() => server.close(force: true));
    final api = ApiClient(
      baseUrl: address(server),
      accessToken: 'token',
      requestTimeout: const Duration(milliseconds: 200),
    );

    await expectLater(
      api.get('/unresponsive'),
      throwsA(isA<ApiException>()
          .having((error) => error.statusCode, 'status', 408)
          .having((error) => error.message, 'message', contains('retry'))),
    );
  });

  test('a stalled write does not incorrectly promise that it failed', () async {
    final server = await localServer((_) {});
    addTearDown(() => server.close(force: true));
    final api = ApiClient(
      baseUrl: address(server),
      accessToken: 'token',
      requestTimeout: const Duration(milliseconds: 200),
    );

    await expectLater(
      api.post('/payments', {'amount': 100}),
      throwsA(isA<ApiException>()
          .having((error) => error.statusCode, 'status', 408)
          .having((error) => error.message, 'message', contains('Check the latest status'))),
    );
  });

  test('successful requests retain authorization and decoded payloads', () async {
    final received = Completer<Map<String, String>>();
    final server = await localServer((request) async {
      final body = await utf8.decoder.bind(request).join();
      received.complete({
        'authorization': request.headers.value(HttpHeaders.authorizationHeader) ?? '',
        'method': request.method,
        'body': body,
      });
      request.response.headers.contentType = ContentType.json;
      request.response.write('{"accepted":true}');
      await request.response.close();
    });
    addTearDown(() => server.close(force: true));
    final api = ApiClient(baseUrl: address(server), accessToken: 'resident-token');

    expect(await api.post('/requests', {'purpose': 'test'}), {'accepted': true});
    final request = await received.future;
    expect(request['authorization'], 'Bearer resident-token');
    expect(request['method'], 'POST');
    expect(jsonDecode(request['body']!), {'purpose': 'test'});
  });

  test('SSE stays alive beyond the REST deadline after its handshake', () async {
    final server = await localServer((request) async {
      request.response.headers.contentType = ContentType('text', 'event-stream');
      request.response.write(': connected\n\n');
      await request.response.flush();
      await Future<void>.delayed(const Duration(milliseconds: 750));
      request.response.write('data: {"event":"ready"}\n\n');
      await request.response.close();
    });
    addTearDown(() => server.close(force: true));
    final api = ApiClient(
      baseUrl: address(server),
      accessToken: 'token',
      requestTimeout: const Duration(milliseconds: 500),
    );

    expect(
      await api.sse('/events').first.timeout(const Duration(seconds: 4)),
      {'event': 'ready'},
    );
  });

  test('a silent SSE handshake exits rather than hanging indefinitely', () async {
    final server = await localServer((_) {});
    addTearDown(() => server.close(force: true));
    final api = ApiClient(
      baseUrl: address(server),
      accessToken: 'token',
      requestTimeout: const Duration(milliseconds: 200),
    );

    await expectLater(
      api.sse('/events').first,
      throwsA(isA<ApiException>()
          .having((error) => error.statusCode, 'status', 408)
          .having((error) => error.message, 'message', contains('reconnect'))),
    );
  });
}
