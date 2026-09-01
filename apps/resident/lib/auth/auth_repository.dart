import 'dart:convert';
import 'dart:io';
import 'session_store.dart';

class AuthApiException implements Exception {
  AuthApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => message;
}

class SocietyMembershipOption {
  const SocietyMembershipOption({required this.societyId, required this.role, required this.name, required this.code});
  final String societyId;
  final String role;
  final String name;
  final String code;
}

class OtpVerificationResult {
  const OtpVerificationResult({
    required this.userId,
    required this.memberships,
    this.selectionToken,
    this.session,
  });
  final String userId;
  final List<SocietyMembershipOption> memberships;
  final String? selectionToken;
  final ResidentSession? session;
}

class AuthRepository {
  AuthRepository({required this.baseUrl});
  final String baseUrl;
  final HttpClient _client = HttpClient();

  Future<String> requestOtp(String phone) async {
    final json = await _post('/api/v1/auth/otp/request', {'phone': phone});
    return (json as Map<String, dynamic>)['challengeId'].toString();
  }

  Future<OtpVerificationResult> verifyOtp(String challengeId, String code) async {
    final json = await _post('/api/v1/auth/otp/verify', {'challengeId': challengeId, 'code': code}) as Map<String, dynamic>;
    final memberships = (json['memberships'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((item) {
          final society = item['society'] as Map<String, dynamic>? ?? const {};
          return SocietyMembershipOption(
            societyId: item['societyId'].toString(),
            role: item['role'].toString(),
            name: society['name']?.toString() ?? 'Society',
            code: society['code']?.toString() ?? '',
          );
        })
        .toList();
    final sessionJson = json['session'] as Map<String, dynamic>?;
    ResidentSession? session;
    if (sessionJson != null && memberships.length == 1) {
      session = _sessionFromJson(sessionJson, memberships.first.societyId, memberships.first.role);
    }
    return OtpVerificationResult(
      userId: json['userId'].toString(),
      memberships: memberships,
      selectionToken: json['selectionToken']?.toString(),
      session: session,
    );
  }

  Future<ResidentSession> selectSociety({
    required String userId,
    required String societyId,
    required String selectionToken,
  }) async {
    final json = await _post('/api/v1/auth/society/select', {
      'userId': userId,
      'societyId': societyId,
      'selectionToken': selectionToken,
    }) as Map<String, dynamic>;
    return _sessionFromJson(
      json['session'] as Map<String, dynamic>,
      json['societyId'].toString(),
      json['role'].toString(),
    );
  }

  Future<ResidentSession> refresh(ResidentSession current) async {
    final json = await _post('/api/v1/auth/refresh', {
      'sessionId': current.sessionId,
      'refreshToken': current.refreshToken,
    }) as Map<String, dynamic>;
    return ResidentSession(
      sessionId: json['sessionId'].toString(),
      accessToken: json['accessToken'].toString(),
      refreshToken: json['refreshToken'].toString(),
      societyId: current.societyId,
      role: current.role,
    );
  }

  Future<void> logout(ResidentSession current) async {
    await _post('/api/v1/auth/logout', {'sessionId': current.sessionId});
  }

  ResidentSession _sessionFromJson(Map<String, dynamic> json, String societyId, String role) {
    return ResidentSession(
      sessionId: json['sessionId'].toString(),
      accessToken: json['accessToken'].toString(),
      refreshToken: json['refreshToken'].toString(),
      societyId: societyId,
      role: role,
    );
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final uri = Uri.parse('${baseUrl.replaceFirst(RegExp(r'/$'), '')}$path');
    final request = await _client.postUrl(uri);
    request.headers.contentType = ContentType.json;
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    request.write(jsonEncode(body));
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
      final message = decoded is Map<String, dynamic> ? decoded['message']?.toString() : decoded?.toString();
      throw AuthApiException(response.statusCode, message ?? 'Authentication request failed');
    }
    return decoded;
  }
}
