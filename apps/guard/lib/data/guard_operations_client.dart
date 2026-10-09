import 'guard_api.dart';

class GuardOperationsClient {
  GuardOperationsClient(this.api);
  final GuardApi api;

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body}) =>
      api.operation(method, path, body: body);

  Future<Map<String,dynamic>> summary() async => Map<String,dynamic>.from(await _send('GET','summary') as Map);
  Future<List<Map<String,dynamic>>> overstays() => _list('overstays');
  Future<List<Map<String,dynamic>>> watchlist() => _list('watchlist');
  Future<List<Map<String,dynamic>>> passes() => _list('passes');
  Future<List<Map<String,dynamic>>> checkpoints() => _list('patrol/checkpoints');
  Future<List<Map<String,dynamic>>> patrolStatus({int staleHours=8}) => _list('patrol/status?staleHours=$staleHours');
  Future<List<Map<String,dynamic>>> incidents() => _list('incidents');
  Future<List<Map<String,dynamic>>> shiftHandovers() => _list('shift-handovers');
  Future<Map<String,dynamic>> commandSummary() async => Map<String,dynamic>.from(await _send('GET','shift-handovers/command-summary') as Map);
  Future<Map<String,dynamic>> escalateOverstay(String id,{String? note}) async => Map<String,dynamic>.from(await _send('POST','overstays/$id/escalate',body:{if(note!=null&&note.trim().isNotEmpty)'note':note.trim()}) as Map);

  Future<Map<String,dynamic>> createPass({required String referenceCode,required String movementType,required String subjectName,required String itemDescription,String? gateId,String? unitId,String? vehicleNumber,String? validUntil}) async => Map<String,dynamic>.from(await _send('POST','passes',body:{
    'referenceCode':referenceCode,'movementType':movementType,'subjectName':subjectName,'itemDescription':itemDescription,
    if(gateId!=null)'gateId':gateId,if(unitId!=null)'unitId':unitId,if(vehicleNumber!=null&&vehicleNumber.trim().isNotEmpty)'vehicleNumber':vehicleNumber.trim(),if(validUntil!=null)'validUntil':validUntil,
  }) as Map);
  Future<Map<String,dynamic>> processPass(String id) async => Map<String,dynamic>.from(await _send('POST','passes/$id/process') as Map);
  Future<Map<String,dynamic>> scanCheckpoint(String id,{String? gateId,String? note}) async => Map<String,dynamic>.from(await _send('POST','patrol/checkpoints/$id/scan',body:{if(gateId!=null)'gateId':gateId,if(note!=null&&note.trim().isNotEmpty)'note':note.trim()}) as Map);
  Future<Map<String,dynamic>> createIncident({required String severity,required String category,required String title,String? description,String? gateId,List<String> mediaRefs=const []}) async => Map<String,dynamic>.from(await _send('POST','incidents',body:{
    'severity':severity,
    'category':category,
    'title':title,
    if(description!=null&&description.trim().isNotEmpty)'description':description.trim(),
    if(gateId!=null)'gateId':gateId,
    if(mediaRefs.isNotEmpty)'mediaRefs':mediaRefs.map((ref)=>ref.trim()).where((ref)=>ref.isNotEmpty).toList(growable:false),
  }) as Map);
  Future<Map<String,dynamic>> createShiftHandover({required String summary,required List<String> openItems,String? gateId}) async => Map<String,dynamic>.from(await _send('POST','shift-handovers',body:{'summary':summary,'openItems':openItems,if(gateId!=null)'gateId':gateId}) as Map);
  Future<Map<String,dynamic>> acknowledgeShiftHandover(String id) async => Map<String,dynamic>.from(await _send('POST','shift-handovers/$id/acknowledge') as Map);

  Future<List<Map<String,dynamic>>> _list(String path) async {
    final value=await _send('GET',path);
    if(value is! List)return const [];
    return value.whereType<Map>().map((e)=>Map<String,dynamic>.from(e)).toList(growable:false);
  }
}
