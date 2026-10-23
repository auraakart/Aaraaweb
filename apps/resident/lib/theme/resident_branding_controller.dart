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
    this.fetchLogo,
    this.fetchRevisionLogo,
  }) {
    scopeChanges.addListener(_onScopeChanged);
    _onScopeChanged();
  }

  final Listenable scopeChanges;
  final ResidentBrandSession? Function() currentSession;
  final Future<Object?> Function(ResidentBrandSession) fetchContext;
  final Future<Uint8List?> Function(ResidentBrandSession)? fetchLogo;
  final Future<Uint8List?> Function(ResidentBrandSession, String revision)? fetchRevisionLogo;

  SocietyBrandTokens? current;
  Uint8List? logoBytes;
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
    logoBytes = null;
    notifyListeners(); // Clear old society theme and image immediately.
    if (session != null) unawaited(_fetch(session, generation));
  }

  /// Foreground refresh preserves the last verified same-session appearance on network failure.
  void refresh() {
    if (_disposed) return;
    final session = currentSession();
    if (session?.identity != _identity) {
      _onScopeChanged();
      return;
    }
    if (session == null) return;
    unawaited(_fetch(session, ++_epoch, keepCurrentOnFailure: true));
  }

  Future<void> _fetch(ResidentBrandSession session, int generation, {bool keepCurrentOnFailure = false}) async {
    SocietyBrandTokens? next;
    var transportFailed = false;
    try {
      final response = await fetchContext(session);
      next = SocietyBrandTokens.tryParseContext(response, societyId: session.societyId);
    } catch (_) {
      transportFailed = true;
      // Presentation network failure cannot interfere with signing in,
      // society switching, independent-home privacy or gate operations.
    }
    if (_disposed || generation != _epoch || _identity != session.identity) return;
    if (keepCurrentOnFailure && transportFailed) return;
    if (next?.revision != current?.revision) logoBytes = null;
    current = next;
    notifyListeners();
    if (next != null && (fetchLogo != null || fetchRevisionLogo != null)) {
      unawaited(_loadLogo(session, generation));
    }
  }

  Future<void> _loadLogo(ResidentBrandSession session, int generation) async {
    Uint8List? bytes;
    try {
      final revision = current?.revision;
      if (fetchRevisionLogo != null && revision != null) {
        bytes = await fetchRevisionLogo!(session, revision);
      } else {
        bytes = await fetchLogo?.call(session);
      }
    } catch (_) {
      // Logo transport is cosmetic; never break resident workflows or login.
      bytes = null;
    }
    if (_disposed || generation != _epoch || _identity != session.identity) return;
    logoBytes = bytes;
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
