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
  ApiClient({required this.baseUrl, required this.accessToken});

  final String baseUrl;
  final String accessToken;
  final HttpClient _client = HttpClient();

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body);
  Future<dynamic> put(String path, [Map<String, dynamic>? body]) => _send('PUT', path, body);
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) => _send('PATCH', path, body);

  Stream<Map<String, dynamic>> sse(String path) async* {
    if (accessToken.isEmpty) throw ApiException(401, 'Sign in is required');
    final uri = Uri.parse('${baseUrl.replaceFirst(RegExp(r'/$'), '')}/${path.replaceFirst(RegExp(r'^/'), '')}');
    final request = await _client.getUrl(uri);
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
    request.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
    final response = await request.close();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final text = await response.transform(utf8.decoder).join();
      throw ApiException(response.statusCode, text.isEmpty ? 'Event stream failed' : text);
    }
    await for (final line in response.transform(utf8.decoder).transform(const LineSplitter())) {
      if (!line.startsWith('data:')) continue;
      final payload = line.substring(5).trim();
      if (payload.isEmpty) continue;
      final decoded = jsonDecode(payload);
      if (decoded is Map) yield Map<String, dynamic>.from(decoded);
    }
  }

  Future<dynamic> _send(String method, String path, [Map<String, dynamic>? body]) async {
    if (accessToken.isEmpty) throw ApiException(401, 'Sign in is required');
    final uri = Uri.parse('${baseUrl.replaceFirst(RegExp(r'/$'), '')}/${path.replaceFirst(RegExp(r'^/'), '')}');
    final request = await _client.openUrl(method, uri);
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
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
      final message = decoded is Map<String, dynamic> ? (decoded['message']?.toString() ?? 'Request failed') : (decoded?.toString() ?? 'Request failed');
      throw ApiException(response.statusCode, message);
    }
    return decoded;
  }
}
