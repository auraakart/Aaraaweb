import 'package:aaraagate_resident/auth/auth_repository.dart';
import 'package:aaraagate_resident/auth/resident_auth_controller.dart';
import 'package:aaraagate_resident/auth/session_store.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemorySessionStore extends SessionStore {
  ResidentSession? stored;

  @override
  Future<ResidentSession?> read() async => stored;

  @override
  Future<void> write(ResidentSession session) async {
    stored = session;
  }

  @override
  Future<void> clear() async {
    stored = null;
  }
}

class _AuthRepository extends AuthRepository {
  _AuthRepository(this.result) : super(baseUrl: 'http://localhost');

  final OtpVerificationResult result;

  @override
  Future<OtpVerificationResult> verifyOtp(String challengeId, String code) async => result;
}

const _ownerProperty = PropertySummary(
  unitId: 'unit-owner',
  unitNumber: 'A-101',
  buildingName: 'Aster',
  buildingCode: 'AST',
  relationship: 'OWNER',
);

const _occupantProperty = PropertySummary(
  unitId: 'unit-occupant',
  unitNumber: 'B-202',
  buildingName: 'Birch',
  buildingCode: 'BRH',
  relationship: 'OCCUPANT',
);

const _ownerMembership = SocietyMembershipOption(
  societyId: 'society-owner',
  role: 'OWNER',
  roles: ['OWNER', 'RESIDENT'],
  name: 'Owner Society',
  code: 'OWN',
  properties: [_ownerProperty],
);

const _occupantMembership = SocietyMembershipOption(
  societyId: 'society-occupant',
  role: 'RESIDENT',
  roles: ['RESIDENT'],
  name: 'Resident Society',
  code: 'RES',
  properties: [_occupantProperty],
);

ResidentSession _societySession() => const ResidentSession(
      sessionId: 'session-1',
      accessToken: 'access',
      refreshToken: 'refresh',
      contextType: 'SOCIETY',
      societyId: 'society-owner',
      role: 'OWNER',
    );

void main() {
  test('multi-context OTP session still requires explicit property selection', () async {
    final store = _MemorySessionStore();
    final controller = ResidentAuthController(
      repository: _AuthRepository(OtpVerificationResult(
        userId: 'user-1',
        memberships: const [_ownerMembership, _occupantMembership],
        contextType: 'SOCIETY',
        session: _societySession(),
      )),
      sessionStore: store,
    );
    addTearDown(controller.dispose);
    controller.challengeId = 'challenge';

    await controller.verifyOtp('123456');

    expect(controller.step, ResidentAuthStep.society);
    expect(controller.propertyContextCount, 2);
    expect(controller.session?.activeUnitId, isNull);
    expect(store.stored?.activeUnitId, isNull);
  });

  test('active property ownership follows the selected unit relationship', () async {
    final controller = ResidentAuthController(
      repository: AuthRepository(baseUrl: 'http://localhost'),
      sessionStore: _MemorySessionStore(),
      demoEnabled: true,
    );
    addTearDown(controller.dispose);

    await controller.enterDemo();
    await controller.selectPropertyContext(controller.memberships.first, controller.memberships.first.properties.first);
    expect(controller.activePropertyRelationship, 'OWNER');
    expect(controller.isActivePropertyOwner, isTrue);

    await controller.switchProperty(controller.memberships.last, controller.memberships.last.properties.first);
    expect(controller.activePropertyRelationship, 'OCCUPANT');
    expect(controller.isActivePropertyOwner, isFalse);
  });

  test('independent-home OTP session bypasses society contexts and stays isolated', () async {
    final independent = const ResidentSession(
      sessionId: 'independent-session',
      accessToken: 'independent-access',
      refreshToken: 'independent-refresh',
      contextType: 'INDEPENDENT_HOME',
      role: 'CONSUMER',
    );
    final store = _MemorySessionStore();
    final controller = ResidentAuthController(
      repository: _AuthRepository(OtpVerificationResult(
        userId: 'independent-user',
        memberships: const [_ownerMembership],
        contextType: 'INDEPENDENT_HOME',
        session: independent,
      )),
      sessionStore: store,
    );
    addTearDown(controller.dispose);
    controller.challengeId = 'challenge';

    await controller.verifyOtp('123456');

    expect(controller.step, ResidentAuthStep.signedIn);
    expect(controller.isIndependentHome, isTrue);
    expect(controller.memberships, isEmpty);
    expect(controller.activeProperty, isNull);
    expect(controller.canSwitchProperty, isFalse);
    expect(store.stored?.contextType, 'INDEPENDENT_HOME');
  });
}
