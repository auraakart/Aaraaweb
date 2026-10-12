import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:aaraagate_branding_runtime/branding_runtime.dart';

/// A snapshot of the authenticated society session. Never take identity
/// or entitlement data from the presentation response itself.
class ResidentBrandSession {
  const ResidentBrandSession({
    required this.sessionId,
    required this.societyId,
    required this.accessToken,
  });
  final String sessionId;
  final String societyId;
  final String accessToken;

  String get identity => '$sessionId:$societyId:$accessToken';
}

/// Resolves cosmetic presentation only. Results from an old society,
/// signed-out session, or old credential are never applied.
class ResidentBrandingController extends ChangeNotifier {
  ResidentBrandingController({
    required this.scopeChanges,
    required this.currentSession,
    required this.fetchContext,
  }) {
    scopeChanges.addListener(_onScopeChanged);
    _onScopeChanged();
  }

  final Listenable scopeChanges;
  final ResidentBrandSession? Function() currentSession;
  final Future<Object?> Function(ResidentBrandSession) fetchContext;

  SocietyBrandTokens? current;
  String? _identity;
  int _epoch = 0;
  bool _disposed = false;

  void _onScopeChanged() {
    if (_disposed) return;
    final session = currentSession();
    final identity = session?.identity;
    if (identity == _identity) return;
    _identity = identity;
    final generation = ++_epoch;
    current = null;
    notifyListeners(); // Remove the old society theme immediately.
    if (session != null) unawaited(_fetch(session, generation));
  }

  Future<void> _fetch(ResidentBrandSession session, int generation) async {
    SocietyBrandTokens? next;
    try {
      final response = await fetchContext(session);
      next = SocietyBrandTokens.tryParseContext(response, societyId: session.societyId);
    } catch (_) {
      // Presentation network failure cannot interfere with signing in,
      // society switching, independent-home privacy or gate operations.
    }
    if (_disposed || generation != _epoch || _identity != session.identity) return;
    current = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _epoch++;
    scopeChanges.removeListener(_onScopeChanged);
    super.dispose();
  }
}
