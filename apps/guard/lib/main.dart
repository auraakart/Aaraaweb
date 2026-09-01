import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const AaraagateGuardApp());

class GuardApi {
  GuardApi({required this.baseUrl, this.token = '', this.societyId = ''});
  final String baseUrl; String token; String societyId;
  Map<String,String> get headers => {'Authorization':'Bearer $token','Content-Type':'application/json'};
  Future<dynamic> request(String method,String path,{Map<String,dynamic>? body}) async { final uri=Uri.parse('$baseUrl$path'); final r=method=='GET'?await http.get(uri,headers:headers):await http.post(uri,headers:headers,body:jsonEncode(body??{})); final d=r.body.isEmpty?null:jsonDecode(r.body); if(r.statusCode<200||r.statusCode>=300) throw Exception(d is Map?d['message']??'Request failed (${r.statusCode})':'Request failed (${r.statusCode})'); return d; }
  Future<Map<String,dynamic>> login(String challengeId,String code) async { final d=await request('POST','/auth/otp/verify',body:{'challengeId':challengeId,'code':code}); return Map<String,dynamic>.from(d as Map); }
  Future<Map<String,dynamic>> selectSociety(String userId,String id) async { final d=await request('POST','/auth/society/select',body:{'userId':userId,'societyId':id}); return Map<String,dynamic>.from(d as Map); }
  Future<List<dynamic>> gates() async { final d=await request('GET','/gates'); return List<dynamic>.from(d as List); }
  Future<Map<String,dynamic>> visitor(String path,String gateId,String credential) async { final d=await request('POST',path,body:{'gateId':gateId,'credential':credential}); return Map<String,dynamic>.from(d as Map); }
}

class AaraagateGuardApp extends StatelessWidget { const AaraagateGuardApp({super.key}); @override Widget build(BuildContext context)=>MaterialApp(title:'aaraagate Guard',debugShowCheckedModeBanner:false,theme:ThemeData(useMaterial3:true,colorSchemeSeed:const Color(0xFF176B4D)),home:const GuardDashboard()); }
class GuardDashboard extends StatefulWidget { const GuardDashboard({super.key}); @override State<GuardDashboard> createState()=>_GuardDashboardState(); }
class _GuardDashboardState extends State<GuardDashboard> {
  final api=GuardApi(baseUrl:const String.fromEnvironment('AARAAGATE_API_URL',defaultValue:'http://localhost:3000'));
  final challenge=TextEditingController(), code=TextEditingController(), credential=TextEditingController();
  String status='Sign in to start a security shift'; bool busy=false; Map<String,dynamic>? session; List<dynamic> memberships=[]; List<dynamic> gates=[]; String? gateId;
  Future<void> verifyOtp() async { await _busy('Verifying OTP…',() async { final r=await api.login(challenge.text.trim(),code.text.trim()); session=r; memberships=List<dynamic>.from(r['memberships']??[]); if(r['session']!=null){_applySession(Map<String,dynamic>.from(r['session'])); await loadGates();} status=memberships.length>1?'Select your society':'Authenticated'; }); }
  void _applySession(Map<String,dynamic> s){api.token=s['accessToken']??''; api.societyId=session?['societyId']??s['societyId']??'';}
  Future<void> selectSociety(String id) async { await _busy('Selecting society…',() async { final r=await api.selectSociety(session!['userId'],id); _applySession(Map<String,dynamic>.from(r['session'])); await loadGates(); status='Select active gate'; }); }
  Future<void> loadGates() async { gates=await api.gates(); if(gates.isNotEmpty) gateId=gates.first['id'] as String; }
  Future<void> _busy(String text,Future<void> Function() work) async {setState((){busy=true;status=text;});try{await work();setState((){});}catch(e){setState(()=>status=e.toString().replaceFirst('Exception: ',''));}finally{if(mounted)setState(()=>busy=false);}}
  @override void dispose(){challenge.dispose();code.dispose();credential.dispose();super.dispose();}
  @override Widget build(BuildContext context){ final authenticated=api.token.isNotEmpty; return Scaffold(appBar:AppBar(title:const Text('Gate Operations')),body:SafeArea(child:ListView(padding:const EdgeInsets.all(16),children:[
    if(!authenticated) ...[_field(challenge,'OTP challenge ID'),_field(code,'6-digit OTP'),FilledButton(onPressed:busy?null:verifyOtp,child:const Text('SIGN IN'))] else ...[
      Card(child:ListTile(leading:const Icon(Icons.shield_outlined,size:32),title:const Text('Security shift'),subtitle:Text(gateId==null?'Select an active gate':(gates.firstWhere((g)=>g['id']==gateId,orElse:()=>{'name':gateId})['name']??'Active gate')))),
      if(memberships.length>1) DropdownButtonFormField<String>(value:api.societyId.isEmpty?null:api.societyId,decoration:const InputDecoration(labelText:'Society',border:OutlineInputBorder()),items:memberships.map((m)=>DropdownMenuItem<String>(value:m['societyId'],child:Text(m['societyId']))).toList(),onChanged:busy?null:(v)=>v==null?null:selectSociety(v)),
      DropdownButtonFormField<String>(value:gateId,decoration:const InputDecoration(labelText:'Active gate',border:OutlineInputBorder()),items:gates.map((g)=>DropdownMenuItem<String>(value:g['id'],child:Text(g['name']??g['code']??g['id']))).toList(),onChanged:(v)=>setState(()=>gateId=v)),
      const SizedBox(height:16),_field(credential,'Visitor pass / QR credential'),FilledButton.icon(onPressed:busy||gateId==null?null:()=>_busy('Verifying…',() async {await api.visitor('/visitors/verify',gateId!,credential.text.trim());status='Pass verified';}),icon:const Icon(Icons.verified_user),label:const Text('VERIFY PASS')),const SizedBox(height:8),Row(children:[Expanded(child:FilledButton.tonal(onPressed:busy||gateId==null?null:()=>_busy('Checking in…',() async {await api.visitor('/visitors/check-in',gateId!,credential.text.trim());status='Visitor checked in';}),child:const Text('CHECK IN'))),const SizedBox(width:8),Expanded(child:OutlinedButton(onPressed:busy||gateId==null?null:()=>_busy('Checking out…',() async {await api.visitor('/visitors/check-out',gateId!,credential.text.trim());status='Visitor checked out';}),child:const Text('CHECK OUT')))]),
      const SizedBox(height:20),ListTile(leading:const Icon(Icons.cloud_done),title:const Text('Connected'),subtitle:Text(status)),
    ]
  ]))); }
  Widget _field(TextEditingController c,String label)=>Padding(padding:const EdgeInsets.only(bottom:12),child:TextField(controller:c,decoration:InputDecoration(labelText:label,border:const OutlineInputBorder())));
}
