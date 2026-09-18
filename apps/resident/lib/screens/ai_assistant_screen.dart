import 'dart:convert';
import 'package:flutter/material.dart';
import '../data/api_client.dart';

class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({super.key, required this.apiClient, required this.unitId});
  final ApiClient apiClient;
  final String? unitId;

  @override
  State<AiAssistantScreen> createState()=>_AiAssistantScreenState();
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  final TextEditingController _controller=TextEditingController();
  bool _busy=false;
  String? _error;
  Map<String,dynamic>? _result;
  Map<String,dynamic>? _proposal;

  @override
  void dispose(){_controller.dispose();super.dispose();}

  Future<void> _ask() async {
    final message=_controller.text.trim();
    if(message.length<2)return;
    setState((){_busy=true;_error=null;_result=null;});
    try{
      final raw=await widget.apiClient.post('/api/v1/ai-operations/assistant/query',{
        'message':message,
        if(widget.unitId!=null)'unitId':widget.unitId,
      });
      if(!mounted)return;
      setState(()=>_result=Map<String,dynamic>.from(raw as Map));
    }catch(e){
      if(mounted)setState(()=>_error=e.toString());
    }finally{if(mounted)setState(()=>_busy=false);}
  }

  Future<void> _draftComplaint() async {
    final message=_controller.text.trim();
    final unitId=widget.unitId;
    if(message.length<5||unitId==null)return;
    setState((){_busy=true;_error=null;});
    try{
      final raw=await widget.apiClient.post('/api/v1/ai-operations/assistant/helpdesk-from-text',{'unitId':unitId,'text':message});
      if(!mounted)return;
      setState(()=>_proposal=Map<String,dynamic>.from(raw as Map));
    }catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_busy=false);}
  }

  Future<void> _proposalAction(bool confirm) async {
    final id=_proposal?['id']?.toString()??_proposal?['proposalId']?.toString();
    if(id==null)return;
    setState((){_busy=true;_error=null;});
    try{
      final raw=await widget.apiClient.post('/api/v1/ai-operations/proposals/$id/${confirm?'confirm':'cancel'}');
      if(!mounted)return;
      setState(()=>_proposal=Map<String,dynamic>.from(raw as Map));
    }catch(e){if(mounted)setState(()=>_error=e.toString());}
    finally{if(mounted)setState(()=>_busy=false);}
  }

  @override
  Widget build(BuildContext context){
    final theme=Theme.of(context);
    return Scaffold(
      appBar:AppBar(title:const Text('Aaraagate Assistant')),
      body:ListView(
        padding:const EdgeInsets.fromLTRB(18,14,18,32),
        children:[
          Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Row(children:[Icon(Icons.auto_awesome_rounded,color:theme.colorScheme.primary),const SizedBox(width:10),const Expanded(child:Text('Grounded operations assistant',style:TextStyle(fontWeight:FontWeight.w900,fontSize:18)))]),
            const SizedBox(height:8),
            const Text('Answers use authorized Aaraagate records only. The assistant cannot change society data directly; actions require an explicit confirmation.'),
            const SizedBox(height:16),
            TextField(
              controller:_controller,
              minLines:3,maxLines:6,
              decoration:const InputDecoration(
                labelText:'Ask about dues, receipts, bookings, complaints, amenities or services',
                hintText:'Example: What is the status of my maintenance dues?',
                border:OutlineInputBorder(),
              ),
            ),
            const SizedBox(height:12),
            Row(children:[
              Expanded(child:FilledButton.icon(onPressed:_busy?null:_ask,icon:const Icon(Icons.send_rounded),label:Text(_busy?'Checking…':'Ask'))),
              if(widget.unitId!=null)...[
                const SizedBox(width:10),
                Expanded(child:OutlinedButton.icon(onPressed:_busy?null:_draftComplaint,icon:const Icon(Icons.edit_note_rounded),label:const Text('Complaint draft'))),
              ],
            ]),
          ])),
          if(_error!=null)Padding(padding:const EdgeInsets.only(top:12),child:Card(color:theme.colorScheme.errorContainer,child:Padding(padding:const EdgeInsets.all(14),child:Text(_error!,style:TextStyle(color:theme.colorScheme.onErrorContainer))))),
          if(_result!=null)Padding(padding:const EdgeInsets.only(top:12),child:Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(_result!['answer']?.toString()??'Grounded result',style:theme.textTheme.titleMedium?.copyWith(fontWeight:FontWeight.w900)),
            const SizedBox(height:10),
            Text(const JsonEncoder.withIndent('  ').convert(_result!['facts']??{}),style:theme.textTheme.bodySmall),
            const SizedBox(height:10),
            Text('Sources: ${((_result!['sources'] as List?)??const []).join(', ')}',style:theme.textTheme.labelMedium),
          ])))),
          if(_proposal!=null)Padding(padding:const EdgeInsets.only(top:12),child:Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('Complaint action proposal',style:TextStyle(fontWeight:FontWeight.w900,fontSize:17)),
            const SizedBox(height:6),
            Text('Status: ${_proposal!['status']??'PROPOSED'}'),
            const SizedBox(height:6),
            const Text('Nothing is submitted until you confirm. Normal complaint authorization and validation still apply.'),
            if((_proposal!['status']?.toString()??'PROPOSED')=='PROPOSED')...[
              const SizedBox(height:14),
              Row(children:[
                Expanded(child:OutlinedButton(onPressed:_busy?null:()=>_proposalAction(false),child:const Text('Cancel'))),
                const SizedBox(width:10),
                Expanded(child:FilledButton(onPressed:_busy?null:()=>_proposalAction(true),child:const Text('Confirm complaint'))),
              ]),
            ],
          ])))),
        ],
      ),
    );
  }
}
