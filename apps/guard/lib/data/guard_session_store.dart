import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class GuardSession {
  const GuardSession({
    required this.sessionId,
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.societyId,
  });
  final String sessionId;
  final String accessToken;
  final String refreshToken;
  final String userId;
  final String societyId;
}

class GuardSessionStore {
  const GuardSessionStore();
  static const _applicationId = String.fromEnvironment('AARAGATE_PARTNER_APPLICATION_ID');
  static const _applicationKey = 'guard.applicationId';
  static const _storage = FlutterSecureStorage();

  Future<void> save(GuardSession session) async {
    await Future.wait([
      if (_applicationId.isNotEmpty) _storage.write(key: _applicationKey, value: _applicationId),
      _storage.write(key: 'guard.sessionId', value: session.sessionId),
      _storage.write(key: 'guard.accessToken', value: session.accessToken),
      _storage.write(key: 'guard.refreshToken', value: session.refreshToken),
      _storage.write(key: 'guard.userId', value: session.userId),
      _storage.write(key: 'guard.societyId', value: session.societyId),
    ]);
  }

  Future<GuardSession?> read() async {
    if (_applicationId.isNotEmpty && await _storage.read(key: _applicationKey) != _applicationId) return null;
    final values = await Future.wait([
      _storage.read(key: 'guard.sessionId'),
      _storage.read(key: 'guard.accessToken'),
      _storage.read(key: 'guard.refreshToken'),
      _storage.read(key: 'guard.userId'),
      _storage.read(key: 'guard.societyId'),
    ]);
    if (values.any((value) => value == null || value.isEmpty)) return null;
    return GuardSession(
      sessionId: values[0]!,
      accessToken: values[1]!,
      refreshToken: values[2]!,
      userId: values[3]!,
      societyId: values[4]!,
    );
  }

  Future<void> clear() async {
    if (_applicationId.isNotEmpty) await _storage.delete(key: _applicationKey);
    for (final key in const ['guard.sessionId', 'guard.accessToken', 'guard.refreshToken', 'guard.userId', 'guard.societyId']) {
      await _storage.delete(key: key);
    }
  }
}
