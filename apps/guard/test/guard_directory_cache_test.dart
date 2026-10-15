import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_directory_cache.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class DirectoryApi extends GuardApi {
  DirectoryApi({this.offline = false}) : super(baseUrl: 'http://test');
  bool offline;
  @override Future<List<Map<String, dynamic>>> gates() async {
    if (offline) throw GuardApiException('offline', transport: true);
    return [{'id':'gate-1','name':'Main Gate','active':true}];
  }
  @override Future<List<Map<String, dynamic>>> gateUnits() async {
    if (offline) throw GuardApiException('offline', transport: true);
    return [{'id':'unit-1','number':'A-101','building':{'name':'A'}}];
  }
  @override Stream<Map<String, dynamic>> gateEvents() async* { yield {'type':'CONNECTED'}; }
}

class MemoryDirectoryCache extends GuardDirectoryCache {
  MemoryDirectoryCache([this.snapshot]);
  GuardDirectorySnapshot? snapshot;
  @override Future<GuardDirectorySnapshot?> read({required String societyId, required String guardUserId}) async =>
      snapshot?.belongsTo(societyId:societyId,guardUserId:guardUserId)==true ? snapshot : null;
  @override Future<void> save(GuardDirectorySnapshot value) async => snapshot=value;
}

class EmptyQueue extends OfflineActionQueue {
  @override Future<List<QueuedGateAction>> read() async => const [];
  @override Future<void> replace(List<QueuedGateAction> actions) async {}
}

const session=GuardSession(sessionId:'s1',accessToken:'token',refreshToken:'refresh',userId:'guard-1',societyId:'society-1');

void main(){
  test('successful online load caches the society-scoped gate and unit directory',() async{
    final cache=MemoryDirectoryCache();
    final controller=GuardController(api:DirectoryApi(),sessions:const GuardSessionStore(),offlineQueue:EmptyQueue(),directoryCache:cache)..session=session;
    await controller.loadGates();
    expect(controller.directoryFromCache,isFalse);
    expect(controller.gates.single['id'],'gate-1');
    expect(controller.units.single['id'],'unit-1');
    expect(cache.snapshot?.societyId,'society-1');
    expect(cache.snapshot?.guardUserId,'guard-1');
  });

  test('fresh cached directory keeps gate and unit lookup available after offline restart',() async{
    final cache=MemoryDirectoryCache(GuardDirectorySnapshot(
      societyId:'society-1',guardUserId:'guard-1',savedAt:DateTime.now().toUtc().subtract(const Duration(minutes:5)),
      gates:[{'id':'gate-cached','name':'Cached Gate','active':true}],
      units:[{'id':'unit-cached','number':'B-202','building':{'name':'B'}}],
    ));
    final controller=GuardController(api:DirectoryApi(offline:true),sessions:const GuardSessionStore(),offlineQueue:EmptyQueue(),directoryCache:cache)..session=session;
    await controller.loadGates();
    expect(controller.directoryFromCache,isTrue);
    expect(controller.gateId,'gate-cached');
    expect(controller.units.single['id'],'unit-cached');
    expect(controller.offlineSyncMessage,contains('Offline directory loaded'));
  });

  test('stale directory is not presented as current offline data',() async{
    final cache=MemoryDirectoryCache(GuardDirectorySnapshot(
      societyId:'society-1',guardUserId:'guard-1',savedAt:DateTime.now().toUtc().subtract(const Duration(days:2)),
      gates:[{'id':'gate-old','active':true}],units:const [],
    ));
    final controller=GuardController(api:DirectoryApi(offline:true),sessions:const GuardSessionStore(),offlineQueue:EmptyQueue(),directoryCache:cache)..session=session;
    await expectLater(controller.loadGates(),throwsA(isA<GuardApiException>()));
    expect(controller.gates,isEmpty);
  });

  test('directory snapshot rejects cross-session reuse',(){
    final snapshot=GuardDirectorySnapshot(societyId:'society-1',guardUserId:'guard-1',savedAt:DateTime.now().toUtc(),gates:const [],units:const []);
    expect(snapshot.belongsTo(societyId:'society-2',guardUserId:'guard-1'),isFalse);
    expect(snapshot.belongsTo(societyId:'society-1',guardUserId:'guard-2'),isFalse);
  });
}
