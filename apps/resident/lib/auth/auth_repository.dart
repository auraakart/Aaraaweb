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

class PropertySummary {
  const PropertySummary({
    required this.unitId,
    required this.unitNumber,
    required this.buildingName,
    required this.buildingCode,
    required this.relationship,
  });
  final String unitId;
  final String unitNumber;
  final String buildingName;
  final String buildingCode;
  final String relationship;
}

class SocietyMembershipOption {
  const SocietyMembershipOption({
    required this.societyId,
    required this.role,
    required this.name,
    required this.code,
    this.roles = const [],
    this.properties = const [],
  });
  final String societyId;
  final String role;
  final String name;
  final String code;
  final List<String> roles;
  final List<PropertySummary> properties;
}

class OtpVerificationResult {
  const OtpVerificationResult({
    required this.userId,
    required this.memberships,
    required this.contextType,
    this.selectionToken,
    this.session,
  });
  final String userId;
  final List<SocietyMembershipOption> memberships;
  final String contextType;
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
    final contextType = json['contextType']?.toString() ?? 'SOCIETY';
    final memberships = _parseMemberships(json['memberships']);
    final sessionJson = json['session'] as Map<String, dynamic>?;
    ResidentSession? session;
    if (sessionJson != null) {
      final societyId = memberships.isEmpty ? null : memberships.first.societyId;
      final role = memberships.isEmpty ? '' : memberships.first.role;
      session = _sessionFromJson(sessionJson, societyId: societyId, role: role, contextType: contextType);
    }
    return OtpVerificationResult(
      userId: json['userId'].toString(),
      memberships: memberships,
      contextType: contextType,
      selectionToken: json['selectionToken']?.toString(),
      session: session,
    );
  }

  Future<List<SocietyMembershipOption>> contexts(ResidentSession session) async {
    final json = await _authorized('GET', '/api/v1/auth/contexts', session.accessToken) as Map<String, dynamic>;
    return _parseMemberships(json['memberships']);
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
      societyId: json['societyId'].toString(),
      role: json['role'].toString(),
      contextType: json['contextType']?.toString() ?? 'SOCIETY',
    );
  }

  Future<ResidentSession> switchSociety(ResidentSession current, String societyId) async {
    final json = await _authorized(
      'POST',
      '/api/v1/auth/society/switch',
      current.accessToken,
      {'societyId': societyId},
    ) as Map<String, dynamic>;
    return _sessionFromJson(
      json['session'] as Map<String, dynamic>,
      societyId: json['societyId'].toString(),
      role: json['role'].toString(),
      contextType: json['contextType']?.toString() ?? 'SOCIETY',
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
      contextType: current.contextType,
    );
  }

  Future<void> logout(ResidentSession current) async {
    await _post('/api/v1/auth/logout', {'sessionId': current.sessionId, 'refreshToken': current.refreshToken});
  }

  List<SocietyMembershipOption> _parseMemberships(dynamic raw) {
    return (raw as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((item) {
          final society = item['society'] as Map<String, dynamic>? ?? const {};
          final properties = (item['properties'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map((property) => PropertySummary(
                    unitId: property['unitId']?.toString() ?? '',
                    unitNumber: property['unitNumber']?.toString() ?? '',
                    buildingName: property['buildingName']?.toString() ?? '',
                    buildingCode: property['buildingCode']?.toString() ?? '',
                    relationship: property['relationship']?.toString() ?? '',
                  ))
              .toList();
          return SocietyMembershipOption(
            societyId: item['societyId'].toString(),
            role: item['role'].toString(),
            roles: (item['roles'] as List<dynamic>? ?? const []).map((role) => role.toString()).toList(),
            name: society['name']?.toString() ?? 'Society',
            code: society['code']?.toString() ?? '',
            properties: properties,
          );
        })
        .toList();
  }

  ResidentSession _sessionFromJson(
    Map<String, dynamic> json, {
    required String? societyId,
    required String role,
    required String contextType,
  }) {
    return ResidentSession(
      sessionId: json['sessionId'].toString(),
      accessToken: json['accessToken'].toString(),
      refreshToken: json['refreshToken'].toString(),
      societyId: societyId,
      role: role,
      contextType: contextType,
    );
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) => _send('POST', path, body: body);

  Future<dynamic> _authorized(String method, String path, String accessToken, [Map<String, dynamic>? body]) {
    return _send(method, path, body: body, accessToken: accessToken);
  }

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body, String? accessToken}) async {
    final uri = Uri.parse('${baseUrl.replaceFirst(RegExp(r'/$'), '')}$path');
    final request = await _client.openUrl(method, uri);
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (accessToken != null) request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
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
      final message = decoded is Map<String, dynamic> ? decoded['message']?.toString() : decoded?.toString();
      throw AuthApiException(response.statusCode, message ?? 'Authentication request failed');
    }
    return decoded;
  }
}
