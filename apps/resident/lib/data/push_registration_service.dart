import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'resident_repository.dart';

class PushRegistrationService {
  PushRegistrationService(this.repository);
  final ResidentRepository repository;

  static const enabled = bool.fromEnvironment('AARAGATE_FIREBASE_ENABLED', defaultValue: false);
  StreamSubscription<String>? _tokenRefresh;
  StreamSubscription<RemoteMessage>? _opened;
  String? _registeredToken;
  bool _started = false;

  Future<bool> start({required Future<void> Function(Map<String, dynamic> data) onOpened}) async {
    if (!enabled || _started) return _started;
    try {
      await Firebase.initializeApp();
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
      if (settings.authorizationStatus == AuthorizationStatus.denied) return false;
      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) await _register(token);
      _tokenRefresh = messaging.onTokenRefresh.listen((token) => _register(token));
      _opened = FirebaseMessaging.onMessageOpenedApp.listen((message) => onOpened(message.data));
      final initial = await messaging.getInitialMessage();
      if (initial != null) await onOpened(initial.data);
      _started = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> stop() async {
    final token = _registeredToken;
    if (token != null) {
      try {
        await repository.unregisterPushDevice(token);
      } catch (_) {}
    }
    await _tokenRefresh?.cancel();
    await _opened?.cancel();
    _tokenRefresh = null;
    _opened = null;
    _registeredToken = null;
    _started = false;
  }

  Future<void> _register(String token) async {
    await repository.registerPushDevice(token: token, platform: _platform());
    _registeredToken = token;
  }

  String _platform() {
    if (kIsWeb) return 'WEB';
    return switch (defaultTargetPlatform) {
      TargetPlatform.iOS || TargetPlatform.macOS => 'IOS',
      _ => 'ANDROID',
    };
  }

  void dispose() {
    _tokenRefresh?.cancel();
    _opened?.cancel();
  }
}
