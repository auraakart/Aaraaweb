import 'dart:async';
import 'dart:convert';
import 'dart:io';

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

  Uri _uri(String path) => Uri.parse(
    '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/${path.replaceFirst(RegExp(r'^/'), '')}',
  );

  Stream<Map<String, dynamic>> sse(String path) async* {
    if (accessToken.isEmpty) throw ApiException(401, 'Sign in is required');
    HttpClientRequest? activeRequest;
    HttpClientResponse response;
    try {
      response = await (() async {
        final request = await _client.getUrl(_uri(path));
        activeRequest = request;
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
        request.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
        return request.close();
      })().timeout(requestTimeout);
    } on TimeoutException {
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
    if (accessToken.isEmpty) throw ApiException(401, 'Sign in is required');
    HttpClientRequest? activeRequest;
    Future<dynamic> exchange() async {
      final request = await _client.openUrl(method, _uri(path));
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
    }
  }
}
