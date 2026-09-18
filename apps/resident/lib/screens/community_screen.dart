import 'package:flutter/material.dart';
import '../data/resident_data_controller.dart';
import '../theme/aaraagate_theme.dart';
import '../widgets/app_state_card.dart';
import '../widgets/premium_ui.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key, required this.controller});
  final ResidentDataController controller;
  @override State<CommunityScreen> createState()=>_CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  bool loading=true;
  String? error;
  List<Map<String,dynamic>> meetings=const[], documents=const[], polls=const[];
  @override void initState(){super.initState();_load();}
  Future<void> _load() async {
    setState(()=>{loading=true,error=null});
    try {
      final results=await Future.wait([
        widget.controller.repository.communityMeetings(),
        widget.controller.repository.communityDocuments(),
        widget.controller.repository.communityPolls(),
      ]);
      if(!mounted)return;
      setState(()=>{meetings=results[0],documents=results[1],polls=results[2]});
    } catch (_) {
      if(mounted)setState(()=>error='Community information could not be loaded.');
    } finally { if(mounted)setState(()=>loading=false); }
  }
  @override Widget build(BuildContext context){
    final theme=Theme.of(context), scheme=theme.colorScheme;
    final notices=widget.controller.notices.take(3).toList();
    final openTickets=widget.controller.helpdeskTickets.where((t)=>!{'RESOLVED','CLOSED'}.contains((t['status']?.toString()??'').toUpperCase())).take(2).toList();
    return SafeArea(child:RefreshIndicator(onRefresh:() async{await widget.controller.load();await _load();},child:ListView(
      physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter,AaraagateTokens.space4,AaraagateTokens.pageGutter,AaraagateTokens.space8),children:[
      Text('Community',style:theme.textTheme.headlineMedium?.copyWith(fontWeight:FontWeight.w800)),
      const SizedBox(height:AaraagateTokens.space1),Text('Society updates, meetings, documents and polls with your access rules applied.',style:theme.textTheme.bodyLarge?.copyWith(color:scheme.onSurfaceVariant)),
      if(loading)...[const SizedBox(height:AaraagateTokens.space4),const AppStateCard(icon:Icons.sync_rounded,message:'Loading community hub…',loading:true)],
      if(error!=null)...[const SizedBox(height:AaraagateTokens.space4),AppStateCard(icon:Icons.error_outline_rounded,message:error!,actionLabel:'Retry',onAction:_load)],
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Latest notices',supportingText:'Recent updates published for your society.'),const SizedBox(height:AaraagateTokens.space3),
      if(notices.isEmpty)const AppStateCard(icon:Icons.campaign_outlined,message:'No current notices.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<notices.length;i++)...[_Tile(icon:Icons.campaign_outlined,title:notices[i]['title']?.toString()??'Society notice',subtitle:notices[i]['requiresAcknowledgement']==true?'Acknowledgement requested':'Published update'),if(i<notices.length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Meetings & decisions',supportingText:'Community-visible governance meetings and closure information.'),const SizedBox(height:AaraagateTokens.space3),
      if(meetings.isEmpty)const AppStateCard(icon:Icons.groups_outlined,message:'No community-visible meetings.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<meetings.take(3).length;i++)...[_Tile(icon:Icons.groups_outlined,title:meetings[i]['title']?.toString()??'Society meeting',subtitle:_meetingSubtitle(meetings[i])),if(i<meetings.take(3).length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Community documents',supportingText:'Documents visible to your current relationship and audience.'),const SizedBox(height:AaraagateTokens.space3),
      if(documents.isEmpty)const AppStateCard(icon:Icons.folder_open_outlined,message:'No community documents available.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<documents.take(3).length;i++)...[_Tile(icon:Icons.description_outlined,title:_label(documents[i]['kind']?.toString()??'Document'),subtitle:documents[i]['note']?.toString()??'Governance document'),if(i<documents.take(3).length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Polls',supportingText:'Current non-statutory community participation.'),const SizedBox(height:AaraagateTokens.space3),
      if(polls.isEmpty)const AppStateCard(icon:Icons.how_to_vote_outlined,message:'No community polls open.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<polls.take(3).length;i++)...[_Tile(icon:Icons.how_to_vote_outlined,title:polls[i]['question']?.toString()??polls[i]['title']?.toString()??'Community poll',subtitle:'Open community poll'),if(i<polls.take(3).length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      if(openTickets.isNotEmpty)...[const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Your open helpdesk',supportingText:'Requests from this selected property.'),const SizedBox(height:AaraagateTokens.space3),PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<openTickets.length;i++)...[_Tile(icon:Icons.support_agent_outlined,title:openTickets[i]['title']?.toString()??'Helpdesk request',subtitle:_label(openTickets[i]['status']?.toString()??'Open')),if(i<openTickets.length-1)Divider(height:1,color:scheme.outlineVariant)]]))]
    ])));
  }
  static String _meetingSubtitle(Map<String,dynamic> m){final status=_label(m['status']?.toString()??'Scheduled');final at=DateTime.tryParse(m['scheduledAt']?.toString()??'')?.toLocal();return at==null?status:'$status · ${at.day.toString().padLeft(2,'0')}/${at.month.toString().padLeft(2,'0')}/${at.year}';}
  static String _label(String value)=>value.toLowerCase().split('_').map((w)=>w.isEmpty?w:'${w[0].toUpperCase()}${w.substring(1)}').join(' ');
}

class _Tile extends StatelessWidget{
  const _Tile({required this.icon,required this.title,required this.subtitle});final IconData icon;final String title,subtitle;
  @override Widget build(BuildContext context){final theme=Theme.of(context),scheme=theme.colorScheme;return ListTile(minTileHeight:AaraagateTokens.minTouchTarget,contentPadding:const EdgeInsets.symmetric(horizontal:AaraagateTokens.space4,vertical:AaraagateTokens.space2),leading:Container(width:AaraagateTokens.iconContainer,height:AaraagateTokens.iconContainer,alignment:Alignment.center,decoration:BoxDecoration(color:scheme.surfaceContainerHighest,borderRadius:BorderRadius.circular(AaraagateTokens.radiusSmall)),child:Icon(icon,color:scheme.primary)),title:Text(title,maxLines:2,overflow:TextOverflow.ellipsis,style:theme.textTheme.titleSmall?.copyWith(fontWeight:FontWeight.w700)),subtitle:Text(subtitle,maxLines:2,overflow:TextOverflow.ellipsis));}
}
