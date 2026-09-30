import 'package:flutter/material.dart';
import '../data/resident_error_message.dart';
import '../data/resident_repository.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class CommunityEventsScreen extends StatefulWidget{
  const CommunityEventsScreen({super.key,required this.repository});
  final ResidentRepository repository;
  @override State<CommunityEventsScreen> createState()=>_CommunityEventsScreenState();
}

class _CommunityEventsScreenState extends State<CommunityEventsScreen>{
  List<Map<String,dynamic>> events=const[];
  bool loading=true;
  String? error,busyEventId;
  int _loadGeneration=0;

  @override void initState(){super.initState();_load();}

  Future<void> _load() async{
    if(!mounted)return;
    final generation=++_loadGeneration;
    setState((){loading=true;error=null;});
    // Only the latest refresh may publish data, errors or loading state.
    try{final value=await widget.repository.communityEvents();if(mounted&&generation==_loadGeneration)setState(()=>events=value);}
    catch(e){if(mounted&&generation==_loadGeneration)setState(()=>error=residentErrorMessage(e,fallback:'Community events could not be loaded. Check your connection and try again.'));}
    finally{if(mounted&&generation==_loadGeneration)setState(()=>loading=false);}
  }

  Future<void> _respond(Map<String,dynamic> event,String status) async{
    final id=event['id']?.toString();if(id==null||busyEventId!=null)return;
    setState(()=>busyEventId=id);
    try{
      await widget.repository.respondCommunityEvent(eventId:id,status:status);
      // The resident may have navigated away while the mutation was pending.
      if(!mounted)return;
      await _load();
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(status=='GOING'?'RSVP confirmed.':'Response updated.')));
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(residentErrorMessage(e,fallback:'Your RSVP could not be updated. Please try again.'))));
    }finally{if(mounted)setState(()=>busyEventId=null);}
  }

  @override Widget build(BuildContext context){
    final theme=Theme.of(context);
    return Scaffold(
      appBar:AppBar(title:const Text('Community events')),
      body:RefreshIndicator(
        onRefresh:_load,
        child:ListView(
          physics:const AlwaysScrollableScrollPhysics(),
          padding:const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter,AaraagateTokens.space4,AaraagateTokens.pageGutter,AaraagateTokens.space8),
          children:[
            Text('Upcoming activities',style:theme.textTheme.headlineSmall?.copyWith(fontWeight:FontWeight.w900)),
            const SizedBox(height:6),
            Text('RSVP helps organizers plan capacity. It is not a vote, quorum record, legal meeting attendance or statutory consent.',style:theme.textTheme.bodyMedium?.copyWith(color:theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height:AaraagateTokens.space5),
            if(loading&&events.isEmpty)
              const AppStateCard(icon:Icons.event_available_outlined,message:'Loading community events…',loading:true)
            else if(error!=null)
              AppStateCard(icon:Icons.error_outline_rounded,message:error!,actionLabel:'Retry',onAction:_load)
            else if(events.isEmpty)
              const AppStateCard(icon:Icons.event_busy_outlined,message:'No upcoming community events are available.')
            else
              for(final event in events)...[
                _CommunityEventCard(event:event,busy:busyEventId==event['id']?.toString(),onRespond:(status)=>_respond(event,status)),
                const SizedBox(height:12),
              ],
          ],
        ),
      ),
    );
  }
}

class _CommunityEventCard extends StatelessWidget{
  const _CommunityEventCard({required this.event,required this.busy,required this.onRespond});
  final Map<String,dynamic> event;
  final bool busy;
  final ValueChanged<String> onRespond;

  @override Widget build(BuildContext context){
    final theme=Theme.of(context),scheme=theme.colorScheme;
    final starts=DateTime.tryParse(event['startsAt']?.toString()??'')?.toLocal();
    final ends=DateTime.tryParse(event['endsAt']?.toString()??'')?.toLocal();
    final going=_int(event['goingCount']),capacity=event['capacity']==null?null:_int(event['capacity']);
    final my=event['myRsvp']?.toString();
    final full=capacity!=null&&going>=capacity&&my!='GOING';
    return PremiumSurface(
      elevated:true,
      padding:const EdgeInsets.all(AaraagateTokens.space4),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[
          Expanded(child:Text(event['title']?.toString()??'Community event',style:theme.textTheme.titleMedium?.copyWith(fontWeight:FontWeight.w900))),
          AaraagateStatusPill(label:(event['audienceScope']?.toString()??'COMMUNITY').replaceAll('_',' ').toLowerCase(),tone:AaraagateStatusTone.info),
        ]),
        if((event['description']?.toString()??'').isNotEmpty)...[const SizedBox(height:6),Text(event['description'].toString())],
        const SizedBox(height:10),
        Text(_dateRange(starts,ends),style:theme.textTheme.bodyMedium?.copyWith(fontWeight:FontWeight.w700)),
        if((event['location']?.toString()??'').isNotEmpty)Text(event['location'].toString(),style:theme.textTheme.bodySmall?.copyWith(color:scheme.onSurfaceVariant)),
        const SizedBox(height:8),
        Text(capacity==null?'$going going':'$going / $capacity going'+(full?' · full':''),style:theme.textTheme.bodySmall?.copyWith(color:full?scheme.error:scheme.onSurfaceVariant)),
        const SizedBox(height:12),
        Row(children:[
          Expanded(child:my=='GOING'
            ?FilledButton.tonalIcon(onPressed:null,icon:const Icon(Icons.check_circle_outline),label:const Text('Going'))
            :FilledButton(onPressed:busy||full?null:()=>onRespond('GOING'),child:Text(full?'Event full':'I’m going'))),
          const SizedBox(width:8),
          Expanded(child:my=='NOT_GOING'
            ?OutlinedButton.icon(onPressed:null,icon:const Icon(Icons.check),label:const Text('Can’t go'))
            :OutlinedButton(onPressed:busy?null:()=>onRespond('NOT_GOING'),child:const Text('Can’t go'))),
        ]),
        if(my!=null)...[const SizedBox(height:8),Text('Your RSVP: '+my.replaceAll('_',' ').toLowerCase(),style:theme.textTheme.bodySmall?.copyWith(color:scheme.primary))],
      ]),
    );
  }

  static int _int(dynamic value)=>value is int?value:int.tryParse(value?.toString()??'')??0;
  static String _dateRange(DateTime? start,DateTime? end){
    if(start==null)return 'Schedule unavailable';
    String two(int v)=>v.toString().padLeft(2,'0');
    final date=two(start.day)+'/'+two(start.month)+'/'+start.year.toString()+' '+two(start.hour)+':'+two(start.minute);
    if(end==null)return date;
    return date+' → '+two(end.hour)+':'+two(end.minute);
  }
}
