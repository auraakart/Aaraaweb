import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:math' as math;

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.accessToken,
    this.requestTimeout = const Duration(seconds: 20),
  }) : assert(requestTimeout > Duration.zero);

  final String baseUrl;
  final String accessToken;
  // This is the complete REST request deadline, not just a socket timeout.
  // Event streams instead bound only their initial handshake.
  final Duration requestTimeout;
  final HttpClient _client = HttpClient();
  bool _closed = false;
  final Set<HttpClientRequest> _requests = {};

  void close() {
    _closed = true;
    for (final request in _requests) {
      request.abort();
    }
    _requests.clear();
    _client.close(force: true);
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      _send('POST', path, body);
  Future<dynamic> postWithHeaders(
    String path,
    Map<String, dynamic>? body,
    Map<String, String> headers,
  ) =>
      _send('POST', path, body, headers);
  Future<dynamic> put(String path, [Map<String, dynamic>? body]) =>
      _send('PUT', path, body);
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) =>
      _send('PATCH', path, body);

  Future<Uint8List> getPhotoBytes(String path) => _binaryRequest('GET', path);

  Future<Map<String, dynamic>> uploadPhoto(String path, Uint8List bytes, {
    required String idempotencyKey, required String kind, String note = '',
  }) async {
    if (bytes.length > 2 * 1024 * 1024) throw ApiException(413, 'Photo is too large');
    final random = math.Random.secure();
    final boundary = 'aaraagate-${base64UrlEncode(List<int>.generate(24, (_) => random.nextInt(256)))}';
    final prefix = StringBuffer();
    for (final field in {'idempotencyKey': idempotencyKey, 'kind': kind, 'note': note}.entries) {
      prefix.write('--$boundary\r\nContent-Disposition: form-data; name="${field.key}"\r\n\r\n${field.value}\r\n');
    }
    prefix.write('--$boundary\r\nContent-Disposition: form-data; name="photo"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n');
    final body = BytesBuilder(copy: false)..add(utf8.encode(prefix.toString()))..add(bytes)..add(utf8.encode('\r\n--$boundary--\r\n'));
    final response = await _binaryRequest('POST', path, body: body.takeBytes(), contentType: 'multipart/form-data; boundary=$boundary');
    return Map<String, dynamic>.from(jsonDecode(utf8.decode(response)) as Map);
  }

  Future<Uint8List> _binaryRequest(String method, String path, {Uint8List? body, String? contentType}) async {
    if (_closed) throw StateError('API client is closed');
    if (accessToken.isEmpty) throw ApiException(401, 'Sign in is required');
    HttpClientRequest? active;
    var expired = false;
    try {
      return await (() async {
        final request = await _client.openUrl(method, _uri(path));
        active = request;
        if (_closed || expired) { request.abort(); throw StateError('Request is no longer active'); }
        _requests.add(request);
        request.followRedirects = false;
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
        request.headers.set(HttpHeaders.acceptHeader, method == 'GET' ? 'image/png' : 'application/json');
        if (body != null) {
          request.headers.set(HttpHeaders.contentTypeHeader, contentType!);
          request.contentLength = body.length;
          request.add(body);
        }
        final response = await request.close();
        final output = BytesBuilder(copy: false);
        await for (final chunk in response) {
          if (output.length + chunk.length > 2 * 1024 * 1024) { request.abort(); throw ApiException(413, 'Photo response is too large'); }
          output.add(chunk);
        }
        if (response.statusCode < 200 || response.statusCode >= 300) throw ApiException(response.statusCode, 'Photo request could not be completed');
        if (method == 'GET' && response.headers.contentType?.mimeType != 'image/png') throw ApiException(502, 'Photo response is invalid');
        return output.takeBytes();
      })().timeout(requestTimeout);
    } on TimeoutException {
      expired = true; active?.abort(); throw ApiException(408, 'Photo request timed out; check its status before retrying');
    } finally {
      if (active != null) _requests.remove(active);
    }
  }

  Uri _uri(String path) => Uri.parse(
    '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/${path.replaceFirst(RegExp(r'^/'), '')}',
  );

  Stream<Map<String, dynamic>> sse(String path) async* {
    if (_closed) throw StateError('API client is closed');
    if (accessToken.isEmpty) throw ApiException(401, 'Sign in is required');
    HttpClientRequest? activeRequest;
    var expired = false;
    HttpClientResponse response;
    try {
      response = await (() async {
        final request = await _client.getUrl(_uri(path));
        if (expired || _closed) {
          request.abort();
          throw StateError('Request is no longer active');
        }
        activeRequest = request;
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
        request.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
        return request.close();
      })().timeout(requestTimeout);
    } on TimeoutException {
      expired = true;
      activeRequest?.abort();
      throw ApiException(408, 'Event stream connection timed out. Please reconnect.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final text = await response.transform(utf8.decoder).join().timeout(
        requestTimeout,
        onTimeout: () {
          activeRequest?.abort();
          throw ApiException(408, 'Event stream error response timed out.');
        },
      );
      throw ApiException(
        response.statusCode,
        text.isEmpty ? 'Event stream failed' : text,
      );
    }
    // Do not impose a REST deadline on live SSE events: a quiet stream is valid.
    await for (final line
        in response.transform(utf8.decoder).transform(const LineSplitter())) {
      if (!line.startsWith('data:')) continue;
      final payload = line.substring(5).trim();
      if (payload.isEmpty) continue;
      final decoded = jsonDecode(payload);
      if (decoded is Map) yield Map<String, dynamic>.from(decoded);
    }
  }

  Future<dynamic> _send(
    String method,
    String path, [
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  ]) async {
    if (_closed) throw StateError('API client is closed');
    if (accessToken.isEmpty) throw ApiException(401, 'Sign in is required');
    HttpClientRequest? activeRequest;
    var expired = false;
    Future<dynamic> exchange() async {
      final request = await _client.openUrl(method, _uri(path));
      if (expired || _closed) {
        request.abort();
        throw StateError('Request is no longer active');
      }
      _requests.add(request);
      activeRequest = request;
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (headers != null) {
        for (final entry in headers.entries) {
          request.headers.set(entry.key, entry.value);
        }
      }
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }
      final response = await request.close();
      final text = await response.transform(utf8.decoder).join();
      dynamic decoded;
      if (text.isNotEmpty) {
        try {
          decoded = jsonDecode(text);
        } catch (_) {
          decoded = text;
        }
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = decoded is Map<String, dynamic>
            ? (decoded['message']?.toString() ?? 'Request failed')
            : (decoded?.toString() ?? 'Request failed');
        throw ApiException(response.statusCode, message);
      }
      return decoded;
    }

    try {
      return await exchange().timeout(requestTimeout);
    } on TimeoutException {
      expired = true;
      // A deadline releases the caller but cannot undo a server-side mutation.
      // Abort the active transport where possible and make retry uncertainty
      // explicit for writes, particularly payments and bookings.
      activeRequest?.abort();
      throw ApiException(
        408,
        method == 'GET'
            ? 'Request timed out. Please retry.'
            : 'Request timed out. Check the latest status before retrying.',
      );
    } finally {
      if (activeRequest != null) _requests.remove(activeRequest);
    }
  }
}
