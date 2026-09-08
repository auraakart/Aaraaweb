import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'consumer_push_registration.dart';
import 'resident_repository.dart';

class PushRegistrationService {
  PushRegistrationService(this.repository);
  final ResidentRepository repository;

  static const enabled = bool.fromEnvironment('AARAGATE_FIREBASE_ENABLED', defaultValue: false);
  StreamSubscription<String>? _tokenRefresh;
  StreamSubscription<RemoteMessage>? _opened;
  String? _registeredToken;
  bool _started = false;
  Future<bool>? _startInFlight;
  bool _disposed = false;
  int _generation = 0;

  Future<bool> start({required Future<void> Function(Map<String, dynamic> data) onOpened}) {
    if (!enabled || _disposed) return Future.value(false);
    if (_started) return Future.value(true);
    final inFlight = _startInFlight;
    if (inFlight != null) return inFlight;

    final generation = _generation;
    final operation = _start(onOpened, generation);
    _startInFlight = operation;
    return operation.whenComplete(() {
      if (identical(_startInFlight, operation)) _startInFlight = null;
    });
  }

  Future<bool> _start(
    Future<void> Function(Map<String, dynamic> data) onOpened,
    int generation,
  ) async {
    try {
      await Firebase.initializeApp();
      if (!_isActive(generation)) return false;

      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
      if (!_isActive(generation) || settings.authorizationStatus == AuthorizationStatus.denied) return false;

      final token = await messaging.getToken();
      if (!_isActive(generation)) return false;
      if (token != null && token.isNotEmpty) await _register(token, generation);
      if (!_isActive(generation)) return false;

      await _tokenRefresh?.cancel();
      await _opened?.cancel();
      if (!_isActive(generation)) return false;

      _tokenRefresh = messaging.onTokenRefresh.listen((token) {
        if (!_isActive(generation)) return;
        unawaited(_register(token, generation).catchError((_) {}));
      });
      _opened = FirebaseMessaging.onMessageOpenedApp.listen((message) {
        if (!_isActive(generation)) return;
        unawaited(onOpened(message.data).catchError((_) {}));
      });

      final initial = await messaging.getInitialMessage();
      if (!_isActive(generation)) return false;
      if (initial != null) await onOpened(initial.data);
      if (!_isActive(generation)) return false;

      _started = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> stop() async {
    _generation++;
    _started = false;
    final token = _registeredToken;
    _registeredToken = null;

    await _tokenRefresh?.cancel();
    await _opened?.cancel();
    _tokenRefresh = null;
    _opened = null;

    if (token != null) await _unregisterToken(token);
  }

  Future<void> _register(String token, int generation) async {
    if (!_isActive(generation)) return;
    final platform = _platform();
    await repository.registerConsumerPushDevice(token: token, platform: platform);
    if (!_isActive(generation)) {
      await _unregisterToken(token);
      return;
    }

    try {
      await repository.registerPushDevice(token: token, platform: platform);
    } catch (_) {
      // Independent-home sessions intentionally have no society tenant context.
    }

    if (!_isActive(generation)) {
      await _unregisterToken(token);
      return;
    }
    _registeredToken = token;
  }

  Future<void> _unregisterToken(String token) async {
    try {
      await repository.unregisterConsumerPushDevice(token);
    } catch (_) {}
    try {
      await repository.unregisterPushDevice(token);
    } catch (_) {}
  }

  bool _isActive(int generation) => !_disposed && generation == _generation;

  String _platform() {
    if (kIsWeb) return 'WEB';
    return switch (defaultTargetPlatform) {
      TargetPlatform.iOS || TargetPlatform.macOS => 'IOS',
      _ => 'ANDROID',
    };
  }

  void dispose() {
    _disposed = true;
    _generation++;
    _started = false;
    _tokenRefresh?.cancel();
    _opened?.cancel();
    _tokenRefresh = null;
    _opened = null;
    _registeredToken = null;
  }
}
