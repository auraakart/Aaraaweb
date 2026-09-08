import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ResidentSession {
  const ResidentSession({
    required this.sessionId,
    required this.accessToken,
    required this.refreshToken,
    required this.contextType,
    required this.role,
    this.societyId,
  });

  final String sessionId;
  final String accessToken;
  final String refreshToken;
  final String contextType;
  final String? societyId;
  final String role;

  bool get isIndependentHome => contextType == 'INDEPENDENT_HOME';
}

class SessionStore {
  SessionStore({FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;

  static const _sessionId = 'resident.session.id';
  static const _accessToken = 'resident.session.access_token';
  static const _refreshToken = 'resident.session.refresh_token';
  static const _societyId = 'resident.session.society_id';
  static const _role = 'resident.session.role';
  static const _contextType = 'resident.session.context_type';

  Future<ResidentSession?> read() async {
    final values = await Future.wait([
      _storage.read(key: _sessionId),
      _storage.read(key: _accessToken),
      _storage.read(key: _refreshToken),
      _storage.read(key: _societyId),
      _storage.read(key: _role),
      _storage.read(key: _contextType),
    ]);
    if (values[0] == null || values[0]!.isEmpty || values[1] == null || values[1]!.isEmpty || values[2] == null || values[2]!.isEmpty) return null;
    final contextType = values[5]?.isNotEmpty == true ? values[5]! : 'SOCIETY';
    if (contextType == 'SOCIETY' && (values[3] == null || values[3]!.isEmpty)) return null;
    return ResidentSession(
      sessionId: values[0]!,
      accessToken: values[1]!,
      refreshToken: values[2]!,
      societyId: values[3]?.isEmpty == true ? null : values[3],
      role: values[4] ?? '',
      contextType: contextType,
    );
  }

  Future<void> write(ResidentSession session) async {
    await Future.wait([
      _storage.write(key: _sessionId, value: session.sessionId),
      _storage.write(key: _accessToken, value: session.accessToken),
      _storage.write(key: _refreshToken, value: session.refreshToken),
      _storage.write(key: _societyId, value: session.societyId ?? ''),
      _storage.write(key: _role, value: session.role),
      _storage.write(key: _contextType, value: session.contextType),
    ]);
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _sessionId),
      _storage.delete(key: _accessToken),
      _storage.delete(key: _refreshToken),
      _storage.delete(key: _societyId),
      _storage.delete(key: _role),
      _storage.delete(key: _contextType),
    ]);
  }
}
