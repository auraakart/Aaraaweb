import 'package:flutter/material.dart';
import '../guard_controller.dart';

class GuardQuickArrivalScreen extends StatefulWidget {
  const GuardQuickArrivalScreen({super.key,required this.controller});
  final GuardController controller;
  @override State<GuardQuickArrivalScreen> createState()=>_GuardQuickArrivalScreenState();
}

class _GuardQuickArrivalScreenState extends State<GuardQuickArrivalScreen>{
  final search=TextEditingController(),name=TextEditingController(),phone=TextEditingController(),vehicle=TextEditingController(),note=TextEditingController();
  String subjectType='DELIVERY',provider=''; String? unitId; bool busy=false; String? error;
  static const deliveryProviders=['Swiggy','Zomato','Zepto','Blinkit','Amazon','Flipkart','BigBasket'];
  static const cabProviders=['Ola','Uber','Rapido'];

  @override void dispose(){search.dispose();name.dispose();phone.dispose();vehicle.dispose();note.dispose();super.dispose();}
  List<Map<String,dynamic>> get units {final q=search.text.trim().toLowerCase();final all=widget.controller.units;if(q.isEmpty)return all.take(30).toList();return all.where((u)=>_label(u).toLowerCase().contains(q)).take(30).toList();}
  List<String> get providers=>subjectType=='DELIVERY'?deliveryProviders:cabProviders;

  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Quick arrival')),body:SafeArea(child:ListView(padding:const EdgeInsets.all(16),children:[
    SegmentedButton<String>(segments:const [ButtonSegment(value:'DELIVERY',label:Text('Delivery'),icon:Icon(Icons.delivery_dining_rounded)),ButtonSegment(value:'CAB',label:Text('Cab'),icon:Icon(Icons.local_taxi_rounded))],selected:{subjectType},onSelectionChanged:(value)=>setState((){subjectType=value.first;provider='';})),
    const SizedBox(height:14),Text('Provider',style:Theme.of(context).textTheme.titleMedium),const SizedBox(height:8),Wrap(spacing:8,runSpacing:8,children:providers.map((p)=>ChoiceChip(label:Text(p),selected:provider==p,onSelected:(_)=>setState((){provider=p;name.text=p;}))).toList()),
    const SizedBox(height:18),TextField(controller:search,onChanged:(_)=>setState((){}),decoration:const InputDecoration(labelText:'Find building / unit',prefixIcon:Icon(Icons.search_rounded))),const SizedBox(height:8),
    if(unitId==null)...units.map((u)=>Card(child:ListTile(dense:true,title:Text(_label(u),style:const TextStyle(fontWeight:FontWeight.w800)),onTap:()=>setState(()=>unitId=u['id']?.toString())))) else Card(child:ListTile(leading:const Icon(Icons.apartment_rounded),title:Text(_label(widget.controller.units.firstWhere((u)=>u['id']?.toString()==unitId))),trailing:IconButton(icon:const Icon(Icons.close_rounded),onPressed:()=>setState(()=>unitId=null)))),
    const SizedBox(height:12),TextField(controller:name,decoration:const InputDecoration(labelText:'Person / provider name')),TextField(controller:phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Phone (optional)')),TextField(controller:vehicle,textCapitalization:TextCapitalization.characters,decoration:const InputDecoration(labelText:'Vehicle (optional)')),TextField(controller:note,decoration:const InputDecoration(labelText:'Note (optional)')),
    if(error!=null)Padding(padding:const EdgeInsets.only(top:10),child:Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),const SizedBox(height:16),FilledButton.icon(onPressed:busy||unitId==null||name.text.trim().isEmpty?null:_submit,icon:const Icon(Icons.send_rounded),label:Text(busy?'SENDING…':'REQUEST APPROVAL')),
  ])));

  Future<void> _submit()async{setState((){busy=true;error=null;});await widget.controller.createGateArrival(unitId:unitId!,subjectType:subjectType,name:name.text.trim(),provider:provider.isEmpty?null:provider,phone:phone.text.trim(),vehicleNumber:vehicle.text.trim(),note:note.text.trim());if(!mounted)return;if(widget.controller.error!=null){setState((){busy=false;error=widget.controller.error;});return;}Navigator.pop(context);}
}

String _label(Map<String,dynamic> unit){final b=unit['building'] is Map?Map<String,dynamic>.from(unit['building'] as Map):const <String,dynamic>{};return '${b['name']??b['code']??'Building'} · ${unit['number']??'Unit'}';}
