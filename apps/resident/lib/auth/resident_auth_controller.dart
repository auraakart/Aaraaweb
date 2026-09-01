import 'package:flutter/foundation.dart';
import 'auth_repository.dart';
import 'session_store.dart';

enum ResidentAuthStep { loading, phone, otp, society, signedIn }

class ResidentAuthController extends ChangeNotifier {
  ResidentAuthController({required this.repository, required this.sessionStore});

  final AuthRepository repository;
  final SessionStore sessionStore;

  ResidentAuthStep step = ResidentAuthStep.loading;
  bool busy = false;
  String? error;
  String? challengeId;
  String? userId;
  String? selectionToken;
  List<SocietyMembershipOption> memberships = const [];
  ResidentSession? session;

  Future<void> bootstrap() async {
    error = null;
    try {
      final stored = await sessionStore.read();
      if (stored == null) {
        step = ResidentAuthStep.phone;
      } else {
        try {
          session = await repository.refresh(stored);
          await sessionStore.write(session!);
          step = ResidentAuthStep.signedIn;
        } catch (_) {
          await sessionStore.clear();
          session = null;
          step = ResidentAuthStep.phone;
        }
      }
    } finally {
      notifyListeners();
    }
  }

  Future<void> requestOtp(String phone) async {
    await _run(() async {
      challengeId = await repository.requestOtp(phone.trim());
      step = ResidentAuthStep.otp;
    });
  }

  Future<void> verifyOtp(String code) async {
    final challenge = challengeId;
    if (challenge == null) return;
    await _run(() async {
      final result = await repository.verifyOtp(challenge, code.trim());
      userId = result.userId;
      memberships = result.memberships;
      selectionToken = result.selectionToken;
      if (result.session != null) {
        session = result.session;
        await sessionStore.write(session!);
        step = ResidentAuthStep.signedIn;
      } else if (memberships.isEmpty) {
        throw StateError('No active society membership is available for this account');
      } else {
        step = ResidentAuthStep.society;
      }
    });
  }

  Future<void> selectSociety(SocietyMembershipOption membership) async {
    final id = userId;
    final token = selectionToken;
    if (id == null || token == null) return;
    await _run(() async {
      session = await repository.selectSociety(userId: id, societyId: membership.societyId, selectionToken: token);
      await sessionStore.write(session!);
      step = ResidentAuthStep.signedIn;
    });
  }

  Future<void> signOut() async {
    final current = session;
    busy = true;
    error = null;
    notifyListeners();
    try {
      if (current != null) {
        try {
          await repository.logout(current);
        } catch (_) {}
      }
      await sessionStore.clear();
      session = null;
      challengeId = null;
      userId = null;
      selectionToken = null;
      memberships = const [];
      step = ResidentAuthStep.phone;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
    } catch (e) {
      error = e.toString();
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
