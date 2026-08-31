import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const AaraagateGuardApp());

class GuardApi {
  GuardApi({required this.baseUrl, required this.token, required this.societyId});
  final String baseUrl; final String token; final String societyId;
  Map<String,String> get headers => {'Authorization':'Bearer $token','Content-Type':'application/json','X-Society-Id':societyId};
  Future<Map<String,dynamic>> post(String path, Map<String,dynamic> body) async { final r=await http.post(Uri.parse('$baseUrl$path'),headers:headers,body:jsonEncode(body)); final d=r.body.isEmpty?<String,dynamic>{}:jsonDecode(r.body) as Map<String,dynamic>; if(r.statusCode<200||r.statusCode>=300) throw Exception(d['message']??'Request failed (${r.statusCode})'); return d; }
  Future<Map<String,dynamic>> verify(String gateId,String credential)=>post('/visitors/verify',{'gateId':gateId,'credential':credential});
  Future<Map<String,dynamic>> checkIn(String gateId,String credential)=>post('/visitors/check-in',{'gateId':gateId,'credential':credential});
  Future<Map<String,dynamic>> checkOut(String gateId,String credential)=>post('/visitors/check-out',{'gateId':gateId,'credential':credential});
}

class AaraagateGuardApp extends StatelessWidget { const AaraagateGuardApp({super.key}); @override Widget build(BuildContext context)=>MaterialApp(title:'aaraagate Guard',debugShowCheckedModeBanner:false,theme:ThemeData(useMaterial3:true,colorSchemeSeed:const Color(0xFF176B4D)),home:const GuardDashboard()); }
class GuardDashboard extends StatefulWidget { const GuardDashboard({super.key}); @override State<GuardDashboard> createState()=>_GuardDashboardState(); }
class _GuardDashboardState extends State<GuardDashboard> {
  final credential=TextEditingController();
  final api=GuardApi(baseUrl:const String.fromEnvironment('AARAAGATE_API_URL',defaultValue:'http://localhost:3000'),token:const String.fromEnvironment('AARAAGATE_TOKEN'),societyId:const String.fromEnvironment('AARAAGATE_SOCIETY_ID'));
  final gateId=const String.fromEnvironment('AARAAGATE_GATE_ID');
  String status='Ready to verify'; bool busy=false; Map<String,dynamic>? visitor;
  @override void dispose(){credential.dispose();super.dispose();}
  Future<void> verify() async { await _run('Verifying pass…',( )=>api.verify(gateId,credential.text.trim()),'Pass verified'); }
  Future<void> transition(bool checkIn) async { await _run(checkIn?'Checking visitor in…':'Checking visitor out…',()=>checkIn?api.checkIn(gateId,credential.text.trim()):api.checkOut(gateId,credential.text.trim()),checkIn?'Visitor checked in':'Visitor checked out'); }
  Future<void> _run(String loading,Future<Map<String,dynamic>> Function() call,String success) async { if(credential.text.trim().isEmpty||gateId.isEmpty){setState(()=>status=gateId.isEmpty?'Active gate is not configured':'Enter or scan a visitor pass');return;} setState((){busy=true;status=loading;}); try{visitor=await call();setState(()=>status=success);}catch(e){setState(()=>status=e.toString().replaceFirst('Exception: ',''));}finally{if(mounted)setState(()=>busy=false);} }
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Gate Operations'),actions:[IconButton(onPressed:(){},tooltip:'Language',icon:const Icon(Icons.language))]),body:SafeArea(child:ListView(padding:const EdgeInsets.all(16),children:[
    Card(child:ListTile(leading:const Icon(Icons.shield_outlined,size:34),title:Text(gateId.isEmpty?'Gate not configured':'Gate 1',style:const TextStyle(fontSize:22,fontWeight:FontWeight.w700)),subtitle:Text(gateId.isEmpty?'Configure authenticated gate session':'Security shift active'))),const SizedBox(height:18),
    const Text('Visitor verification',style:TextStyle(fontSize:20,fontWeight:FontWeight.w700)),const SizedBox(height:8),TextField(controller:credential,textInputAction:TextInputAction.done,onSubmitted:(_)=>verify(),decoration:const InputDecoration(labelText:'Pass code',hintText:'Enter or scan credential',prefixIcon:Icon(Icons.qr_code_2),border:OutlineInputBorder())),const SizedBox(height:12),
    FilledButton.icon(onPressed:busy?null:verify,icon:const Icon(Icons.verified_user),label:Padding(padding:const EdgeInsets.symmetric(vertical:14),child:Text(busy?'VERIFYING…':'VERIFY PASS'))),const SizedBox(height:12),
    if(visitor!=null)Card(child:ListTile(leading:const Icon(Icons.person),title:Text(visitor!['visitor']?['name']??visitor!['name']??'Visitor'),subtitle:const Text('Verified by server'))),
    Row(children:[Expanded(child:FilledButton.tonalIcon(onPressed:busy?null:()=>transition(true),icon:const Icon(Icons.login),label:const Text('CHECK IN'))),const SizedBox(width:10),Expanded(child:OutlinedButton.icon(onPressed:busy?null:()=>transition(false),icon:const Icon(Icons.logout),label:const Text('CHECK OUT')))]),const SizedBox(height:24),
    ListTile(leading:Icon(busy?Icons.sync:Icons.info_outline),title:const Text('Verification status'),subtitle:Text(status)),
  ]))); }
