import 'package:flutter/material.dart';
import '../data/guard_operations_client.dart';
import '../guard_controller.dart';
import '../localization/guard_strings.dart';
import '../widgets/guard_operation_ui.dart';
import '../widgets/guard_field_section_header.dart';
import '../widgets/guard_field_attention_header.dart';
import '../widgets/guard_field_handover_card.dart';
import '../widgets/guard_field_action_card.dart';
import '../widgets/guard_field_pass_card.dart';
import '../widgets/guard_field_pass_dialog.dart';
import '../widgets/guard_field_incident_dialog.dart';
import '../widgets/guard_field_handover_dialog.dart';
import '../widgets/guard_field_info_card.dart';
import '../widgets/guard_field_metric.dart';
import '../widgets/guard_field_recovery_notice.dart';

class GuardFieldOperationsScreen extends StatefulWidget {
  const GuardFieldOperationsScreen({super.key,required this.controller});
  final GuardController controller;
  @override State<GuardFieldOperationsScreen> createState()=>_GuardFieldOperationsScreenState();
}

class _GuardFieldOperationsScreenState extends State<GuardFieldOperationsScreen>{
  late final GuardOperationsClient client=GuardOperationsClient(widget.controller.api);
  bool loading=true,busy=false; String? error;
  Map<String,dynamic> summary=const {},command=const {};
  List<Map<String,dynamic>> overstays=const [],watchlist=const [],passes=const [],checkpoints=const [],patrolStatus=const [],incidents=const [],handovers=const [];

  @override void initState(){super.initState();load();}
  Future<void> load() async {setState(()=>loading=true);try{final values=await Future.wait([client.summary(),client.overstays(),client.watchlist(),client.passes(),client.checkpoints(),client.patrolStatus(),client.incidents(),client.shiftHandovers(),client.commandSummary()]);if(!mounted)return;setState((){summary=values[0] as Map<String,dynamic>;overstays=values[1] as List<Map<String,dynamic>>;watchlist=values[2] as List<Map<String,dynamic>>;passes=values[3] as List<Map<String,dynamic>>;checkpoints=values[4] as List<Map<String,dynamic>>;patrolStatus=values[5] as List<Map<String,dynamic>>;incidents=values[6] as List<Map<String,dynamic>>;handovers=values[7] as List<Map<String,dynamic>>;command=values[8] as Map<String,dynamic>;error=null;});}catch(_){if(mounted)setState(()=>error='Field operations could not be refreshed. Check your connection and try again.');}finally{if(mounted)setState(()=>loading=false);}}
  Future<void> run(Future<void> Function() action)async{setState(()=>busy=true);try{await action();await load();}catch(_){if(mounted)setState(()=>error='The action status could not be confirmed. Refresh the latest status before trying again.');}finally{if(mounted)setState(()=>busy=false);}}

  @override Widget build(BuildContext context){
    final strings = GuardStrings(widget.controller.languageCode);
    return Scaffold(appBar:AppBar(title:Text(strings.get('fieldOperations')),actions:[IconButton(tooltip:strings.get('fieldRefresh'),onPressed:busy?null:load,icon:const Icon(Icons.refresh_rounded))]),body:SafeArea(child:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.fromLTRB(16,10,16,40),children:[
      if(error!=null)GuardFieldRecoveryNotice(message:error!,onRefresh:busy?null:load,refreshLabel:strings.get('fieldRefreshStatus')),
      _attentionNow(),const SizedBox(height:12),_metrics(),const SizedBox(height:18),
      _heading(strings.get('fieldOverstays'),Icons.timer_outlined),...overstays.take(20).map((x) => GuardFieldActionCard(
        icon: Icons.schedule_rounded,
        title: "${x['subjectName'] ?? 'Visitor'} · ${x['buildingName'] ?? ''} ${x['unitNumber'] ?? ''}",
        subtitle: "${x['minutesInside'] ?? 0} min inside",
        actionLabel: 'ESCALATE',
        strongTitle: true,
        onPressed: busy ? null : () => run(
          () => client.escalateOverstay(x['id'].toString()).then((_) {}),
        ),
      )),if(overstays.isEmpty)_empty('No overstays at the current threshold.'),
      const SizedBox(height:18),_heading(strings.get('fieldWatchlist'),Icons.policy_outlined),...watchlist.take(20).map((x)=>_tile('${x['kind']} · ${x['subjectName']}',x['reason']?.toString()??'',x['kind']=='DENY'?Icons.block_rounded:Icons.visibility_outlined)),if(watchlist.isEmpty)_empty('No active watchlist entries.'),
      const SizedBox(height:18),_sectionHeader(strings.get('fieldPasses'),Icons.local_shipping_outlined,TextButton.icon(onPressed:busy?null:_createPass,icon:const Icon(Icons.add_rounded),label:const Text('NEW PASS'))),...passes.take(30).map((x) => GuardFieldPassCard(
        title: '${x['referenceCode']} · ${x['movementType']}',
        subtitle: '${x['subjectName']} · ${x['itemDescription']}',
        status: x['status']?.toString() ?? '',
        action: x['status'] == 'OPEN'
            ? FilledButton(
                onPressed: busy ? null : () => run(
                  () => client.processPass(x['id'].toString()).then((_) {}),
                ),
                child: const Text('PROCESS'),
              )
            : null,
      )),if(passes.isEmpty)_empty('No gate passes recorded.'),
      const SizedBox(height:18),_heading(strings.get('fieldPatrol'),Icons.qr_code_scanner_rounded),...checkpoints.map((x) {
        final status = patrolStatus.firstWhere(
          (s) => s['id'] == x['id'],
          orElse: () => const <String, dynamic>{},
        );
        final stale = status['stale'] == true;
        final age = status['hoursSinceLastScan'];
        return GuardFieldActionCard(
          title: "${x['code']} · ${x['name']}",
          subtitle: "${x['location']?.toString() ?? 'Checkpoint'} · ${status['lastScannedAt'] == null ? 'Never scanned' : stale ? 'Coverage overdue · ${age ?? '?'}h since scan' : 'Coverage current · ${age ?? 0}h since scan'}",
          actionLabel: stale ? 'SCAN NOW' : 'SCAN',
          onPressed: busy ? null : () => run(
            () => client.scanCheckpoint(
              x['id'].toString(),
              gateId: widget.controller.gateId,
            ).then((_) {}),
          ),
        );
      }),if(checkpoints.isEmpty)_empty('No active patrol checkpoints configured.'),
      const SizedBox(height:18),_sectionHeader(strings.get('fieldHandover'),Icons.handshake_outlined,TextButton.icon(onPressed:busy?null:_createHandover,icon:const Icon(Icons.note_add_rounded),label:const Text('HAND OVER'))),...handovers.take(20).map((x)=>_handoverTile(x)),if(handovers.isEmpty)_empty('No shift handovers recorded.'),
      const SizedBox(height:18),_sectionHeader(strings.get('fieldIncidents'),Icons.report_problem_outlined,TextButton.icon(onPressed:busy?null:_createIncident,icon:const Icon(Icons.add_alert_rounded),label:const Text('REPORT'))),...incidents.take(30).map((x){final refs=(x['mediaRefs'] is List)?(x['mediaRefs'] as List).length:0;return _tile('${x['severity']} · ${x['title']}', '${x['category']} · ${x['status']}${refs>0?' · $refs evidence ref${refs==1?'':'s'}':''}',Icons.warning_amber_rounded);}),if(incidents.isEmpty)_empty('No incidents recorded.'),
    ]))));
  }

  Widget _metrics(){final strings=GuardStrings(widget.controller.languageCode);return GuardOperationSurface(child:Wrap(spacing:10,runSpacing:10,children:[_metric(strings.get('fieldOverstays'),summary['overstayCount']),_metric(strings.get('fieldWatchlist'),summary['watchlistCount']),_metric(strings.get('fieldOpenPasses'),summary['openPassCount']),_metric(strings.get('fieldIncidents'),summary['openIncidentCount']),_metric(strings.get('fieldCheckpoints'),summary['activeCheckpointCount'])]));}
  Widget _attentionNow(){
    final overstayCount=(command['overstays'] as num?)?.toInt()??(summary['overstayCount'] as num?)?.toInt()??0;
    final watchCount=(command['activeDenyWatchlist'] as num?)?.toInt()??(summary['watchlistCount'] as num?)?.toInt()??0;
    final incidentCount=(command['openIncidents'] as num?)?.toInt()??(summary['openIncidentCount'] as num?)?.toInt()??0;
    final criticalIncidentCount=(command['criticalIncidents'] as num?)?.toInt()??0;
    final handoverCount=(command['openHandovers'] as num?)?.toInt()??handovers.where((x)=>x['status']=='OPEN').length;
    final handoverOlder30m=(command['handoverOlder30m'] as num?)?.toInt()??0;
    final oldestOpenHandoverMinutes=(command['oldestOpenHandoverMinutes'] as num?)?.toInt()??0;
    final pendingApprovalsOlder10m=(command['pendingApprovalsOlder10m'] as num?)?.toInt()??0;
    final activeEntries=(command['activeEntries'] as num?)?.toInt()??0;
    final oldestActiveEntryMinutes=(command['oldestActiveEntryMinutes'] as num?)?.toInt()??0;
    final stalePatrolCount=(command['stalePatrol'] as num?)?.toInt()??patrolStatus.where((x)=>x['stale']==true).length;
    final urgent=overstayCount+watchCount+incidentCount+handoverCount+pendingApprovalsOlder10m+stalePatrolCount;
    final operatingMode=command['operatingMode']?.toString()??(criticalIncidentCount>0?'EMERGENCY_ATTENTION':urgent>0?'ELEVATED':'NORMAL');
    final continuityStatus=command['continuityStatus']?.toString()??'CLEAR';
    final gatesWithOpenIncidents=(command['gatesWithOpenIncidents'] as num?)?.toInt()??0;
    final multiGateAttention=command['multiGateAttention']==true;
    final nextActions=(command['nextActions'] is List)?(command['nextActions'] as List).map((e)=>e.toString()).toList(growable:false):const <String>[];
    final theme=Theme.of(context),scheme=theme.colorScheme;
    return GuardOperationSurface(
      semanticLabel: urgent==0?'Gate attention queue is clear':'$urgent gate attention items',
      color: urgent==0?scheme.primaryContainer.withValues(alpha: .28):scheme.errorContainer.withValues(alpha: .40),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        GuardFieldAttentionHeader(urgent: urgent,attentionLabel:GuardStrings(widget.controller.languageCode).get('fieldAttentionNow'),clearLabel:GuardStrings(widget.controller.languageCode).get('fieldAttentionClear')),
        const SizedBox(height:8),
        Text(urgent==0?'No overstays, ageing resident approvals, active deny-watchlist records, open incidents, stale patrol coverage or unacknowledged handovers need action.':'Prioritise safety and continuity before routine gate processing.',style:theme.textTheme.bodyMedium?.copyWith(color:scheme.onSurfaceVariant)),
        const SizedBox(height:6),Text('Operating mode: ${operatingMode.replaceAll('_',' ')} · advisory only',style:theme.textTheme.labelMedium?.copyWith(fontWeight:FontWeight.w800)),
        const SizedBox(height:4),Text('Shift continuity: ${continuityStatus.replaceAll('_',' ')} · ${gatesWithOpenIncidents} gate${gatesWithOpenIncidents==1?'':'s'} with open incidents${multiGateAttention?' · multi-gate attention':''}',style:theme.textTheme.bodySmall?.copyWith(color:scheme.onSurfaceVariant)),
        const SizedBox(height:4),Text('Live gate: $activeEntries inside now${oldestActiveEntryMinutes>0?' · oldest active ${oldestActiveEntryMinutes}m':''}${handoverOlder30m>0?' · oldest handover ${oldestOpenHandoverMinutes}m':''}',style:theme.textTheme.bodySmall?.copyWith(color:scheme.onSurfaceVariant)),
        if(nextActions.isNotEmpty)...[const SizedBox(height:6),Text(nextActions.first,style:theme.textTheme.bodySmall?.copyWith(color:scheme.onSurfaceVariant))],
        if(urgent>0)...[const SizedBox(height:10),Wrap(spacing:8,runSpacing:8,children:[
          if(overstayCount>0)_attentionChip(Icons.timer_outlined,'$overstayCount overstay${overstayCount==1?'':'s'}'),
          if(watchCount>0)_attentionChip(Icons.policy_outlined,'$watchCount watchlist'),
          if(incidentCount>0)_attentionChip(Icons.report_problem_outlined,'$incidentCount incident${incidentCount==1?'':'s'}'),
          if(handoverCount>0)_attentionChip(Icons.handshake_outlined,handoverOlder30m>0?'$handoverCount handover${handoverCount==1?'':'s'} · >30m':'$handoverCount handover${handoverCount==1?'':'s'}'),
          if(pendingApprovalsOlder10m>0)_attentionChip(Icons.hourglass_top_rounded,'$pendingApprovalsOlder10m approval follow-up${pendingApprovalsOlder10m==1?'':'s'}'),
          if(stalePatrolCount>0)_attentionChip(Icons.qr_code_scanner_rounded,'$stalePatrolCount patrol due'),
        ])],
      ])
    );
  }
  Widget _attentionChip(IconData icon,String label)=>Chip(avatar:Icon(icon,size:18),label:Text(label,style:const TextStyle(fontWeight:FontWeight.w700)));
  Widget _metric(String label, dynamic value) =>
      GuardFieldMetric(label: label, value: value);
  Widget _heading(String text,IconData icon)=>GuardFieldSectionHeader(title:text,icon:icon);
  Widget _sectionHeader(String text,IconData icon,Widget action)=>GuardFieldSectionHeader(title:text,icon:icon,action:action);
  Widget _tile(String title, String subtitle, IconData icon) =>
      GuardFieldInfoCard(title: title, subtitle: subtitle, icon: icon);
  Widget _empty(String text)=>Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(text,style:TextStyle(color:Theme.of(context).colorScheme.onSurfaceVariant)));
  Widget _handoverTile(Map<String, dynamic> handover) =>
      GuardFieldHandoverCard(
        handover: handover,
        busy: busy,
        onAcknowledge: () => run(
          () => client
              .acknowledgeShiftHandover(handover['id'].toString())
              .then((_) {}),
        ),
      );

  Future<void> _createIncident()async{final result=await showDialog<Map<String,String>>(context:context,builder:(context)=>const GuardFieldIncidentDialog());if(result==null)return;final refs=(result['mediaRefs']??'').split('\n').map((e)=>e.trim()).where((e)=>e.isNotEmpty).toList(growable:false);await run(()=>client.createIncident(severity:result['severity']!,category:result['category']!,title:result['title']!,description:result['description'],gateId:widget.controller.gateId,mediaRefs:refs).then((_){}));}
  Future<void> _createPass()async{final result=await showDialog<Map<String,String>>(context:context,builder:(context)=>const GuardFieldPassDialog());if(result==null)return;await run(()=>client.createPass(referenceCode:result['referenceCode']!,movementType:result['movementType']!,subjectName:result['subjectName']!,itemDescription:result['itemDescription']!,vehicleNumber:result['vehicleNumber'],gateId:widget.controller.gateId).then((_){}));}
  Future<void> _createHandover()async{final result=await showDialog<Map<String,dynamic>>(context:context,builder:(context)=>const GuardFieldHandoverDialog());if(result==null)return;await run(()=>client.createShiftHandover(summary:result['summary'] as String,openItems:(result['openItems'] as List<String>),gateId:widget.controller.gateId).then((_){}));}
}
