import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

class GuardApiException implements Exception {
  GuardApiException(this.message, {this.statusCode, this.transport = false});
  final String message;
  final int? statusCode;
  final bool transport;
  @override
  String toString() => message;
}

class GuardApi {
  GuardApi({required this.baseUrl});
  final String baseUrl;
  String accessToken = '';

  String get _root => '${baseUrl.replaceFirst(RegExp(r'/$'), '')}/api/v1';
  Map<String, String> get _headers => {
        HttpHeaders.acceptHeader: 'application/json',
        HttpHeaders.contentTypeHeader: 'application/json',
        if (accessToken.isNotEmpty) HttpHeaders.authorizationHeader: 'Bearer $accessToken',
      };

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body, Map<String, String>? extraHeaders}) async {
    try {
      final uri = Uri.parse('$_root/${path.replaceFirst(RegExp(r'^/'), '')}');
      final headers = {..._headers, ...?extraHeaders};
      final response = method == 'GET'
          ? await http.get(uri, headers: headers)
          : await http.post(uri, headers: headers, body: jsonEncode(body ?? const {}));
      dynamic decoded;
      if (response.body.isNotEmpty) {
        try {
          decoded = jsonDecode(response.body);
        } catch (_) {
          decoded = response.body;
        }
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = decoded is Map ? decoded['message']?.toString() : null;
        throw GuardApiException(message ?? 'Request failed', statusCode: response.statusCode);
      }
      return decoded;
    } on GuardApiException {
      rethrow;
    } on SocketException catch (e) {
      throw GuardApiException(e.message, transport: true);
    } on http.ClientException catch (e) {
      throw GuardApiException(e.message, transport: true);
    }
  }

  Future<Map<String, dynamic>> requestOtp(String phone) async =>
      Map<String, dynamic>.from(await _send('POST', '/auth/otp/request', body: {'phone': phone}) as Map);

  Future<Map<String, dynamic>> verifyOtp(String challengeId, String code) async =>
      Map<String, dynamic>.from(await _send('POST', '/auth/otp/verify', body: {'challengeId': challengeId, 'code': code}) as Map);

  Future<Map<String, dynamic>> selectSociety({required String userId, required String societyId, required String selectionToken}) async =>
      Map<String, dynamic>.from(await _send('POST', '/auth/society/select', body: {
        'userId': userId,
        'societyId': societyId,
        'selectionToken': selectionToken,
      }) as Map);

  Future<Map<String, dynamic>> refresh(String sessionId, String refreshToken) async =>
      Map<String, dynamic>.from(await _send('POST', '/auth/refresh', body: {'sessionId': sessionId, 'refreshToken': refreshToken}) as Map);

  Future<void> logout(String sessionId) => _send('POST', '/auth/logout', body: {'sessionId': sessionId});

  Future<List<Map<String, dynamic>>> gates() async {
    final value = await _send('GET', '/gates');
    if (value is! List) return const [];
    return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
  }

  Future<Map<String, dynamic>> verifyAccess(String gateId, String credential) => _access('/access-requests/gate/verify', gateId, credential);
  Future<Map<String, dynamic>> checkIn(String gateId, String credential, String idempotencyKey) => _access('/access-requests/gate/check-in', gateId, credential, idempotencyKey: idempotencyKey);
  Future<Map<String, dynamic>> checkOut(String gateId, String credential, String idempotencyKey) => _access('/access-requests/gate/check-out', gateId, credential, idempotencyKey: idempotencyKey);

  Future<Map<String, dynamic>> _access(String path, String gateId, String credential, {String? idempotencyKey}) async =>
      Map<String, dynamic>.from(await _send(
        'POST',
        path,
        body: {'gateId': gateId, 'credential': credential},
        extraHeaders: idempotencyKey == null ? null : {'Idempotency-Key': idempotencyKey},
      ) as Map);
}
