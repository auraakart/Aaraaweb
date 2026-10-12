import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:aaraagate_branding_runtime/branding_runtime.dart';
import '../data/guard_session_store.dart';

/// Cosmetic state only. A session/society switch clears the previous theme
/// synchronously; late or rejected responses can never cross the boundary.
class GuardBrandingController extends ChangeNotifier {
  GuardBrandingController({
    required this.sessionChanges,
    required this.currentSession,
    required this.fetchContext,
  }) {
    sessionChanges.addListener(_onSessionChange);
    _onSessionChange();
  }

  final Listenable sessionChanges;
  final GuardSession? Function() currentSession;
  final Future<Object?> Function(GuardSession) fetchContext;
  String? _identity;
  int _generation = 0;
  bool _disposed = false;
  SocietyBrandTokens? current;

  void _onSessionChange() {
    if (_disposed) return;
    final session = currentSession();
    final identity = session == null
        ? null
        : '${session.sessionId}:${session.userId}:${session.societyId}:${session.accessToken}';
    if (identity == _identity) return;
    _identity = identity;
    final generation = ++_generation;
    current = null;
    notifyListeners();
    if (session != null) unawaited(_fetch(session, generation));
  }

  Future<void> _fetch(GuardSession session, int generation) async {
    SocietyBrandTokens? next;
    try {
      final response = await fetchContext(session);
      next = SocietyBrandTokens.tryParseContext(response, societyId: session.societyId);
    } catch (_) {
      // Cosmetic errors may never block guard login, scans, gate events or offline sync.
    }
    if (_disposed || generation != _generation) return;
    current = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    sessionChanges.removeListener(_onSessionChange);
    super.dispose();
  }
}
