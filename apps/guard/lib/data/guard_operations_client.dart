import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'guard_api.dart';

class GuardOperationsClient {
  GuardOperationsClient(this.api);
  final GuardApi api;

  String get _root => '${api.baseUrl.replaceFirst(RegExp(r'/$'), '')}/api/v1/guard-operations';
  Map<String,String> get _headers => {
    HttpHeaders.acceptHeader:'application/json',
    HttpHeaders.contentTypeHeader:'application/json',
    HttpHeaders.authorizationHeader:'Bearer ${api.accessToken}',
  };

  Future<dynamic> _send(String method,String path,{Map<String,dynamic>? body}) async {
    try {
      final uri=Uri.parse('$_root/${path.replaceFirst(RegExp(r'^/'),'')}');
      final response=method=='GET'
          ? await http.get(uri,headers:_headers)
          : await http.post(uri,headers:_headers,body:jsonEncode(body??const {}));
      dynamic decoded;
      if(response.body.isNotEmpty){try{decoded=jsonDecode(response.body);}catch(_){decoded=response.body;}}
      if(response.statusCode<200||response.statusCode>=300){
        final message=decoded is Map?decoded['message']?.toString():null;
        throw GuardApiException(message??'Guard operation failed',statusCode:response.statusCode);
      }
      return decoded;
    } on GuardApiException { rethrow; }
      on SocketException catch(e){throw GuardApiException(e.message,transport:true);}
      on http.ClientException catch(e){throw GuardApiException(e.message,transport:true);}
  }

  Future<Map<String,dynamic>> summary() async => Map<String,dynamic>.from(await _send('GET','summary') as Map);
  Future<List<Map<String,dynamic>>> overstays() => _list('overstays');
  Future<List<Map<String,dynamic>>> watchlist() => _list('watchlist');
  Future<List<Map<String,dynamic>>> passes() => _list('passes');
  Future<List<Map<String,dynamic>>> checkpoints() => _list('patrol/checkpoints');
  Future<List<Map<String,dynamic>>> incidents() => _list('incidents');
  Future<List<Map<String,dynamic>>> shiftHandovers() => _list('shift-handovers');

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
