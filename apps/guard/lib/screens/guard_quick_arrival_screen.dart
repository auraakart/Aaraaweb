import 'package:flutter/material.dart';
import '../data/guard_recent_arrival_store.dart';
import '../guard_controller.dart';
import '../voice/guard_arrival_voice_parser.dart';
import '../voice/guard_speech.dart';

class GuardQuickArrivalScreen extends StatefulWidget {
  const GuardQuickArrivalScreen({
    super.key,
    required this.controller,
    this.recentStore = const GuardRecentArrivalStore(),
    this.speech,
  });
  final GuardController controller;
  final GuardRecentArrivalStore recentStore;
  final GuardSpeech? speech;
  @override State<GuardQuickArrivalScreen> createState()=>_GuardQuickArrivalScreenState();
}

class _GuardQuickArrivalScreenState extends State<GuardQuickArrivalScreen>{
  final search=TextEditingController(),name=TextEditingController(),phone=TextEditingController(),vehicle=TextEditingController(),note=TextEditingController();
  String subjectType='DELIVERY',provider=''; String? unitId; bool busy=false; String? error;
  List<GuardRecentArrival> recent=const [];
  late final GuardSpeech speech;
  bool listening=false;
  String? voiceStatus;
  static const deliveryProviders=['Swiggy','Zomato','Zepto','Blinkit','Amazon','Flipkart','BigBasket'];
  static const cabProviders=['Ola','Uber','Rapido'];

  @override void initState(){super.initState();speech=widget.speech??DeviceGuardSpeech();_loadRecent();}
  @override void dispose(){speech.stop();search.dispose();name.dispose();phone.dispose();vehicle.dispose();note.dispose();super.dispose();}
  List<Map<String,dynamic>> get units {final q=search.text.trim().toLowerCase();final all=widget.controller.units;if(q.isEmpty)return all.take(30).toList();return all.where((u)=>_label(u).toLowerCase().contains(q)).take(30).toList();}
  List<String> get providers=>subjectType=='DELIVERY'?deliveryProviders:cabProviders;

  Future<void> _loadRecent() async {
    final session=widget.controller.session;
    if(session==null)return;
    final rows=await widget.recentStore.readFor(societyId:session.societyId,guardUserId:session.userId);
    if(mounted)setState(()=>recent=rows.where((item)=>widget.controller.units.any((u)=>u['id']?.toString()==item.unitId)).toList(growable:false));
  }

  void _applyRecent(GuardRecentArrival item){
    setState((){
      subjectType=item.subjectType;
      provider=item.provider??'';
      unitId=item.unitId;
      name.text=item.name;
      phone.text=item.phone??'';
      vehicle.text=item.vehicleNumber??'';
      search.clear();
      error=null;
    });
  }

  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Quick arrival')),body:SafeArea(child:ListView(padding:const EdgeInsets.all(16),children:[
    if(recent.isNotEmpty)...[
      Row(children:[const Icon(Icons.history_rounded),const SizedBox(width:8),Text('Repeat arrival',style:Theme.of(context).textTheme.titleMedium)]),
      const SizedBox(height:8),
      Text('Reuse a recent destination and provider in one tap.',style:Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height:8),
      Wrap(spacing:8,runSpacing:8,children:recent.take(6).map((item){final unit=widget.controller.units.firstWhere((u)=>u['id']?.toString()==item.unitId);final label='${item.provider??item.name} · ${_label(unit)}';return ActionChip(avatar:Icon(item.subjectType=='CAB'?Icons.local_taxi_rounded:Icons.delivery_dining_rounded,size:18),label:Text(label),onPressed:()=>_applyRecent(item));}).toList()),
      const SizedBox(height:18),
    ],
    SegmentedButton<String>(segments:const [ButtonSegment(value:'DELIVERY',label:Text('Delivery'),icon:Icon(Icons.delivery_dining_rounded)),ButtonSegment(value:'CAB',label:Text('Cab'),icon:Icon(Icons.local_taxi_rounded))],selected:{subjectType},onSelectionChanged:(value)=>setState((){subjectType=value.first;provider='';name.clear();})),
    const SizedBox(height:12),OutlinedButton.icon(onPressed:busy||listening?null:_captureVoice,icon:Icon(listening?Icons.hearing_rounded:Icons.mic_rounded),label:Text(listening?'LISTENING…':'VOICE QUICK FILL')),
    if(voiceStatus!=null)Padding(padding:const EdgeInsets.only(top:8),child:Text(voiceStatus!,style:Theme.of(context).textTheme.bodySmall)),
    const SizedBox(height:14),Text('Provider',style:Theme.of(context).textTheme.titleMedium),const SizedBox(height:8),Wrap(spacing:8,runSpacing:8,children:providers.map((p)=>ChoiceChip(label:Text(p),selected:provider==p,onSelected:(_)=>setState((){provider=p;name.text=p;}))).toList()),
    const SizedBox(height:18),TextField(controller:search,onChanged:(_)=>setState((){}),decoration:const InputDecoration(labelText:'Find building / unit',prefixIcon:Icon(Icons.search_rounded))),const SizedBox(height:8),
    if(unitId==null)...units.map((u)=>Card(child:ListTile(dense:true,title:Text(_label(u),style:const TextStyle(fontWeight:FontWeight.w800)),onTap:()=>setState(()=>unitId=u['id']?.toString())))) else Card(child:ListTile(leading:const Icon(Icons.apartment_rounded),title:Text(_label(widget.controller.units.firstWhere((u)=>u['id']?.toString()==unitId))),trailing:IconButton(icon:const Icon(Icons.close_rounded),onPressed:()=>setState(()=>unitId=null)))),
    const SizedBox(height:12),TextField(controller:name,decoration:const InputDecoration(labelText:'Person / provider name')),TextField(controller:phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Phone (optional)')),TextField(controller:vehicle,textCapitalization:TextCapitalization.characters,decoration:const InputDecoration(labelText:'Vehicle (optional)')),TextField(controller:note,decoration:const InputDecoration(labelText:'Note (optional)')),
    if(error!=null)Padding(padding:const EdgeInsets.only(top:10),child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),const SizedBox(height:16),FilledButton.icon(onPressed:busy||unitId==null||name.text.trim().isEmpty?null:_submit,icon:const Icon(Icons.send_rounded),label:Text(busy?'SENDING…':'REQUEST APPROVAL')),
  ])));

  Future<void> _captureVoice()async{
    setState((){listening=true;error=null;voiceStatus='Say the provider and destination, for example “Swiggy B 204”.';});
    final transcript=await speech.listenOnce(languageCode:widget.controller.languageCode);
    if(!mounted)return;
    if(transcript==null||transcript.trim().isEmpty){
      setState((){listening=false;voiceStatus=null;error='Voice input was not available. Continue with the manual fields.';});
      return;
    }
    final draft=GuardArrivalVoiceParser.parse(transcript:transcript,units:widget.controller.units);
    setState((){
      listening=false;
      subjectType=draft.subjectType;
      provider=draft.provider??'';
      if(draft.provider!=null)name.text=draft.provider!;
      unitId=draft.unitId;
      note.text=draft.transcript;
      voiceStatus=draft.unitId==null
          ? 'Voice captured. Select the destination before requesting approval.'
          : 'Voice captured. Review the draft before requesting approval.';
    });
  }

  Future<void> _submit()async{
    setState((){busy=true;error=null;});
    await widget.controller.createGateArrival(unitId:unitId!,subjectType:subjectType,name:name.text.trim(),provider:provider.isEmpty?null:provider,phone:phone.text.trim(),vehicleNumber:vehicle.text.trim(),note:note.text.trim());
    if(!mounted)return;
    if(widget.controller.error!=null){setState((){busy=false;error=widget.controller.error;});return;}
    final session=widget.controller.session;
    if(session!=null){
      await widget.recentStore.remember(GuardRecentArrival(
        societyId:session.societyId,
        guardUserId:session.userId,
        unitId:unitId!,
        subjectType:subjectType,
        name:name.text.trim(),
        provider:provider.isEmpty?null:provider,
        phone:_optional(phone.text),
        vehicleNumber:_optional(vehicle.text),
        lastUsedAt:DateTime.now().toUtc(),
      ));
    }
    if(mounted)Navigator.pop(context);
  }
}

String _label(Map<String,dynamic> unit){final b=unit['building'] is Map?Map<String,dynamic>.from(unit['building'] as Map):const <String,dynamic>{};return '${b['name']??b['code']??'Building'} · ${unit['number']??'Unit'}';}
String? _optional(String value){final text=value.trim();return text.isEmpty?null:text;}
