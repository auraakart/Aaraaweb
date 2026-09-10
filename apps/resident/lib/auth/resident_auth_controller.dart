import 'package:flutter/foundation.dart';
import 'auth_repository.dart';
import 'session_store.dart';

enum ResidentAuthStep { loading, phone, otp, society, signedIn }

class ResidentAuthController extends ChangeNotifier {
  ResidentAuthController({
    required this.repository,
    required this.sessionStore,
    this.demoEnabled = false,
  });

  final AuthRepository repository;
  final SessionStore sessionStore;
  final bool demoEnabled;

  ResidentAuthStep step = ResidentAuthStep.loading;
  bool busy = false;
  String? error;
  String? challengeId;
  String? userId;
  String? selectionToken;
  List<SocietyMembershipOption> memberships = const [];
  ResidentSession? session;
  bool _disposed = false;

  bool get isDemoSession => session?.sessionId == 'demo-resident-session';
  bool get isIndependentHome => session?.isIndependentHome ?? false;
  String? get activeUnitId => session?.activeUnitId;

  int get propertyContextCount => memberships.fold<int>(
        0,
        (count, membership) => count + (membership.properties.isEmpty ? 1 : membership.properties.length),
      );

  bool get canSwitchProperty => !isIndependentHome && propertyContextCount > 1;

  PropertySummary? get activeProperty {
    final current = session;
    if (current == null || current.isIndependentHome || current.societyId == null || current.activeUnitId == null) return null;
    final membership = _membershipFor(current.societyId);
    if (membership == null) return null;
    return membership.properties.where((property) => property.unitId == current.activeUnitId).firstOrNull;
  }

  String? get activePropertyRelationship {
    final relationship = activeProperty?.relationship.trim();
    return relationship == null || relationship.isEmpty ? null : relationship.toUpperCase();
  }

  bool get isActivePropertyOwner => activePropertyRelationship == 'OWNER';

  Future<void> bootstrap() async {
    if (_disposed) return;
    error = null;
    try {
      final stored = await sessionStore.read();
      if (_disposed) return;
      if (stored == null) {
        step = ResidentAuthStep.phone;
      } else {
        try {
          final refreshed = await repository.refresh(stored);
          if (_disposed) return;
          session = refreshed;
          if (session!.isIndependentHome) {
            memberships = const [];
            await sessionStore.write(session!);
            if (_disposed) return;
            step = ResidentAuthStep.signedIn;
          } else {
            memberships = await repository.contexts(session!);
            if (_disposed) return;
            await _resolveRestoredPropertyContext(stored.activeUnitId);
          }
        } catch (_) {
          if (_disposed) return;
          await sessionStore.clear();
          if (_disposed) return;
          session = null;
          memberships = const [];
          step = ResidentAuthStep.phone;
        }
      }
    } finally {
      _notify();
    }
  }

  Future<void> enterDemo() async {
    if (_disposed || !demoEnabled) return;
    error = null;
    challengeId = null;
    userId = 'demo-resident';
    selectionToken = 'demo-local-selection';
    session = null;
    memberships = const [
      SocietyMembershipOption(
        societyId: 'demo-society-1',
        role: 'OWNER',
        roles: ['OWNER', 'RESIDENT'],
        name: 'Lakeview Residency',
        code: 'LVR',
        properties: [
          PropertySummary(
            unitId: 'demo-unit-1',
            unitNumber: 'A-1204',
            buildingName: 'Maple Tower',
            buildingCode: 'MAPLE',
            relationship: 'OWNER',
          ),
        ],
      ),
      SocietyMembershipOption(
        societyId: 'demo-society-2',
        role: 'RESIDENT',
        roles: ['RESIDENT'],
        name: 'Palm Grove Apartments',
        code: 'PGA',
        properties: [
          PropertySummary(
            unitId: 'demo-unit-2',
            unitNumber: 'B-804',
            buildingName: 'Cedar Tower',
            buildingCode: 'CEDAR',
            relationship: 'OCCUPANT',
          ),
        ],
      ),
    ];
    step = ResidentAuthStep.society;
    _notify();
  }

  Future<void> requestOtp(String phone) async {
    await _run(() async {
      final nextChallengeId = await repository.requestOtp(phone.trim());
      if (_disposed) return;
      challengeId = nextChallengeId;
      step = ResidentAuthStep.otp;
    });
  }

  Future<void> verifyOtp(String code) async {
    final challenge = challengeId;
    if (_disposed || challenge == null) return;
    await _run(() async {
      final result = await repository.verifyOtp(challenge, code.trim());
      if (_disposed) return;
      userId = result.userId;
      memberships = result.memberships;
      selectionToken = result.selectionToken;

      if (result.session != null) {
        session = result.session;
        if (session!.isIndependentHome) {
          memberships = const [];
          await sessionStore.write(session!);
          if (_disposed) return;
          step = ResidentAuthStep.signedIn;
          return;
        }
        if (propertyContextCount > 1) {
          session = session!.copyWith(clearActiveUnit: true);
          await sessionStore.write(session!);
          if (_disposed) return;
          step = ResidentAuthStep.society;
          return;
        }
        await _resolveNewSocietySession();
        return;
      }

      if (memberships.isEmpty) {
        throw StateError('No available Aaraagate access context is available for this account');
      }

      if (memberships.length == 1 && selectionToken != null) {
        final membership = memberships.first;
        final selected = await repository.selectSociety(
          userId: result.userId,
          societyId: membership.societyId,
          selectionToken: selectionToken!,
        );
        if (_disposed) return;
        session = selected;
        selectionToken = null;
        await _resolveNewSocietySession();
        return;
      }

      step = ResidentAuthStep.society;
    });
  }

  Future<void> selectPropertyContext(
    SocietyMembershipOption membership,
    PropertySummary? property,
  ) async {
    if (_disposed) return;
    if (property != null && !membership.properties.any((item) => item.unitId == property.unitId)) {
      throw StateError('Selected property does not belong to this society context');
    }

    await _run(() async {
      if (_isDemoIdentity) {
        session = _demoSessionFor(membership, property);
        selectionToken = null;
        await sessionStore.write(session!);
        if (_disposed) return;
        step = ResidentAuthStep.signedIn;
        return;
      }

      final current = session;
      ResidentSession next;

      if (current != null && current.societyId == membership.societyId) {
        next = current;
      } else if (current != null) {
        next = await repository.switchSociety(current, membership.societyId);
      } else {
        final id = userId;
        final token = selectionToken;
        if (id == null || token == null) throw StateError('Property selection session has expired');
        next = await repository.selectSociety(
          userId: id,
          societyId: membership.societyId,
          selectionToken: token,
        );
      }
      if (_disposed) return;

      if (current == null) selectionToken = null;
      session = _withProperty(next, property);
      await sessionStore.write(session!);
      if (_disposed) return;
      step = ResidentAuthStep.signedIn;
    });
  }

  Future<void> selectSociety(SocietyMembershipOption membership) {
    final property = membership.properties.length == 1 ? membership.properties.first : null;
    return selectPropertyContext(membership, property);
  }

  Future<void> switchProperty(
    SocietyMembershipOption membership,
    PropertySummary? property,
  ) async {
    final current = session;
    if (_disposed || current == null || current.isIndependentHome) return;
    if (property != null && !membership.properties.any((item) => item.unitId == property.unitId)) {
      throw StateError('Selected property does not belong to this society context');
    }
    if (membership.societyId == current.societyId && property?.unitId == current.activeUnitId) return;

    await _run(() async {
      if (isDemoSession) {
        session = _demoSessionFor(membership, property);
        await sessionStore.write(session!);
        if (_disposed) return;
        step = ResidentAuthStep.signedIn;
        return;
      }

      var next = current;
      if (membership.societyId != current.societyId) {
        next = await repository.switchSociety(current, membership.societyId);
      }
      if (_disposed) return;
      session = _withProperty(next, property);
      await sessionStore.write(session!);
      if (_disposed) return;
      memberships = await repository.contexts(session!);
      if (_disposed) return;
      step = ResidentAuthStep.signedIn;
    });
  }

  Future<void> switchSociety(SocietyMembershipOption membership) {
    final property = membership.properties.length == 1 ? membership.properties.first : null;
    return switchProperty(membership, property);
  }

  Future<void> signOut() async {
    if (_disposed) return;
    final current = session;
    busy = true;
    error = null;
    _notify();
    try {
      if (current != null && !isDemoSession) {
        try {
          await repository.logout(current);
        } catch (_) {}
      }
      if (_disposed) return;
      await sessionStore.clear();
      if (_disposed) return;
      session = null;
      challengeId = null;
      userId = null;
      selectionToken = null;
      memberships = const [];
      step = ResidentAuthStep.phone;
    } finally {
      if (!_disposed) busy = false;
      _notify();
    }
  }

  Future<void> _resolveNewSocietySession() async {
    if (_disposed) return;
    final current = session;
    if (current == null) return;
    final membership = _membershipFor(current.societyId);
    if (membership == null || membership.properties.isEmpty) {
      session = current.copyWith(clearActiveUnit: true);
      await sessionStore.write(session!);
      if (_disposed) return;
      step = ResidentAuthStep.signedIn;
      return;
    }
    if (membership.properties.length == 1) {
      session = _withProperty(current, membership.properties.first);
      await sessionStore.write(session!);
      if (_disposed) return;
      step = ResidentAuthStep.signedIn;
      return;
    }

    session = current.copyWith(clearActiveUnit: true);
    await sessionStore.write(session!);
    if (_disposed) return;
    step = ResidentAuthStep.society;
  }

  Future<void> _resolveRestoredPropertyContext(String? storedUnitId) async {
    if (_disposed) return;
    final current = session;
    if (current == null) return;
    final membership = _membershipFor(current.societyId);
    if (membership == null) throw StateError('Stored society context is no longer available');

    if (membership.properties.isEmpty) {
      session = current.copyWith(clearActiveUnit: true);
      await sessionStore.write(session!);
      if (_disposed) return;
      step = ResidentAuthStep.signedIn;
      return;
    }

    final restored = membership.properties.where((item) => item.unitId == storedUnitId).firstOrNull;
    if (restored != null) {
      session = _withProperty(current, restored);
      await sessionStore.write(session!);
      if (_disposed) return;
      step = ResidentAuthStep.signedIn;
      return;
    }

    if (membership.properties.length == 1) {
      session = _withProperty(current, membership.properties.first);
      await sessionStore.write(session!);
      if (_disposed) return;
      step = ResidentAuthStep.signedIn;
      return;
    }

    session = current.copyWith(clearActiveUnit: true);
    await sessionStore.write(session!);
    if (_disposed) return;
    step = ResidentAuthStep.society;
  }

  SocietyMembershipOption? _membershipFor(String? societyId) =>
      memberships.where((membership) => membership.societyId == societyId).firstOrNull;

  bool get _isDemoIdentity => demoEnabled && userId == 'demo-resident';

  ResidentSession _demoSessionFor(SocietyMembershipOption membership, PropertySummary? property) => ResidentSession(
        sessionId: 'demo-resident-session',
        accessToken: 'demo-local-only',
        refreshToken: 'demo-local-only',
        societyId: membership.societyId,
        role: membership.role,
        contextType: 'SOCIETY',
        activeUnitId: property?.unitId,
      );

  ResidentSession _withProperty(ResidentSession base, PropertySummary? property) => property == null
      ? base.copyWith(clearActiveUnit: true)
      : base.copyWith(activeUnitId: property.unitId);

  Future<void> _run(Future<void> Function() action) async {
    if (_disposed) return;
    busy = true;
    error = null;
    _notify();
    try {
      await action();
    } catch (e) {
      if (!_disposed) error = e.toString();
    } finally {
      if (!_disposed) busy = false;
      _notify();
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
