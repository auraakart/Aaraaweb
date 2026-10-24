import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:aaraagate_branding_runtime/branding_runtime.dart';
import '../data/guard_session_store.dart';

/// Cosmetic state only. A session/society switch clears the previous theme
/// synchronously; late or rejected responses can never cross the boundary.
String identityFor(GuardSession session) =>
    '${session.sessionId}:${session.userId}:${session.societyId}:${session.accessToken}';

class GuardBrandingController extends ChangeNotifier {
  GuardBrandingController({
    required this.sessionChanges,
    required this.currentSession,
    required this.fetchContext,
    this.fetchLogo,
    this.fetchRevisionLogo,
  }) {
    sessionChanges.addListener(_onSessionChange);
    _onSessionChange();
  }

  final Listenable sessionChanges;
  final GuardSession? Function() currentSession;
  final Future<Object?> Function(GuardSession) fetchContext;
  final Future<Uint8List?> Function(GuardSession)? fetchLogo;
  final Future<Uint8List?> Function(GuardSession, String revision)? fetchRevisionLogo;
  String? _identity;
  int _generation = 0;
  bool _disposed = false;
  SocietyBrandTokens? current;
  Uint8List? logoBytes;

  void _onSessionChange() {
    if (_disposed) return;
    final session = currentSession();
    final identity = session == null ? null : identityFor(session);
    if (identity == _identity) return;
    _identity = identity;
    final generation = ++_generation;
    current = null;
    logoBytes = null;
    notifyListeners();
    if (session != null) unawaited(_fetch(session, generation));
  }

  /// Re-resolve presentation after app resume, not gate/session permissions.
  void refresh() {
    if (_disposed) return;
    final session = currentSession();
    final identity = session == null ? null : identityFor(session);
    if (identity != _identity) {
      _onSessionChange();
      return;
    }
    if (session == null) return;
    unawaited(_fetch(session, ++_generation, keepCurrentOnFailure: true));
  }

  Future<void> _fetch(GuardSession session, int generation, {bool keepCurrentOnFailure = false}) async {
    SocietyBrandTokens? next;
    var transportFailed = false;
    try {
      final response = await fetchContext(session);
      next = SocietyBrandTokens.tryParseContext(response, societyId: session.societyId);
    } catch (_) {
      transportFailed = true;
      // Cosmetic errors may never block guard login, scans, gate events or offline sync.
    }
    if (_disposed || generation != _generation || _identity != identityFor(session)) return;
    if (keepCurrentOnFailure && transportFailed) return;
    if (next?.revision != current?.revision) logoBytes = null;
    current = next;
    notifyListeners();
    if (next != null && (fetchLogo != null || fetchRevisionLogo != null)) {
      unawaited(_loadLogo(session, generation));
    }
  }

  Future<void> _loadLogo(GuardSession session, int generation) async {
    Uint8List? bytes;
    try {
      final revision = current?.revision;
      if (fetchRevisionLogo != null && revision != null) {
        bytes = await fetchRevisionLogo!(session, revision);
      } else {
        bytes = await fetchLogo?.call(session);
      }
    } catch (_) {
      // A logo failure cannot affect gate operations, offline queue or sign-in.
      bytes = null;
    }
    if (_disposed || generation != _generation || _identity != identityFor(session)) return;
    logoBytes = bytes;
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
