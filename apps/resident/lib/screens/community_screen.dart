import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/resident_data_controller.dart';
import 'community_events_screen.dart';
import 'community_polls_screen.dart';
import 'notices_screen.dart';
import 'resident_requests_screen.dart';
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
  List<Map<String,dynamic>> meetings=const[], governanceDocuments=const[], societyDocuments=const[], polls=const[], _tickets=const[];
  @override void initState(){super.initState();_load();}
  Future<void> _load() async {
    setState(() { loading=true; error=null; });
    try {
      final results=await Future.wait([
        widget.controller.repository.communityMeetings(),
        widget.controller.repository.communityDocuments(),
        widget.controller.repository.societyDocuments(),
        widget.controller.repository.communityPolls(),
        widget.controller.repository.helpdeskTickets(),
      ]);
      if(!mounted)return;
      final unitId=widget.controller.primaryUnitId;
      final scopedTickets=results[4].where((t)=>unitId!=null&&t['unitId']?.toString()==unitId).toList(growable:false);
      setState(() { meetings=results[0]; governanceDocuments=results[1]; societyDocuments=results[2]; polls=results[3]; _tickets=scopedTickets; });
    } catch (_) {
      if(mounted)setState(()=>error='Community information could not be loaded.');
    } finally { if(mounted)setState(()=>loading=false); }
  }
  Future<List<Map<String,dynamic>>> _reloadPolls() async {
    final fresh=await widget.controller.repository.communityPolls();
    if(mounted)setState(()=>polls=fresh);
    return fresh;
  }

  static Map<String,dynamic>? _pollById(List<Map<String,dynamic>> source,String id){
    for(final poll in source){
      if(poll['id']?.toString()==id)return poll;
    }
    return null;
  }

  static String? _pollOptionLabel(Map<String,dynamic> poll,String? optionId){
    if(optionId==null)return null;
    final raw=poll['options'];
    if(raw is! List)return null;
    for(final item in raw){
      if(item is Map&&item['id']?.toString()==optionId)return item['label']?.toString();
    }
    return null;
  }

  static String _pollSubtitle(Map<String,dynamic> poll){
    final myOptionId=poll['myOptionId']?.toString();
    final recorded=_pollOptionLabel(poll,myOptionId);
    if(myOptionId!=null)return recorded==null?'Response recorded':'Response recorded · $recorded';
    final status=(poll['status']?.toString()??'OPEN').toUpperCase();
    if(status=='CLOSED')return 'Closed community poll · no response recorded';
    return 'Open community poll · review before responding';
  }

  Future<void> _openPoll(Map<String,dynamic> poll) async {
    final pollId=poll['id']?.toString();
    if(pollId==null||pollId.isEmpty)return;
    final rawOptions=poll['options'];
    final options=rawOptions is List
        ? rawOptions.whereType<Map>().map((item)=>Map<String,dynamic>.from(item)).where((item)=>item['id']!=null).toList(growable:false)
        : const <Map<String,dynamic>>[];
    final title=poll['question']?.toString()??poll['title']?.toString()??'Community poll';
    final description=poll['description']?.toString().trim()??'';
    final status=(poll['status']?.toString()??'OPEN').toUpperCase();
    final currentOptionId=poll['myOptionId']?.toString();
    String? selectedOptionId=currentOptionId;
    bool submitting=false;
    String? actionError;

    await showModalBottomSheet<void>(
      context:context,
      isScrollControlled:true,
      builder:(sheetContext)=>StatefulBuilder(
        builder:(sheetContext,setModalState){
          final theme=Theme.of(sheetContext),scheme=theme.colorScheme;
          final canRespond=status=='OPEN'&&currentOptionId==null&&options.isNotEmpty;
          final recordedLabel=_pollOptionLabel(poll,currentOptionId);
          return SafeArea(
            child:Padding(
              padding:EdgeInsets.fromLTRB(
                AaraagateTokens.pageGutter,
                AaraagateTokens.space5,
                AaraagateTokens.pageGutter,
                MediaQuery.viewInsetsOf(sheetContext).bottom+AaraagateTokens.space5,
              ),
              child:SingleChildScrollView(
                child:Column(
                  mainAxisSize:MainAxisSize.min,
                  crossAxisAlignment:CrossAxisAlignment.start,
                  children:[
                    Text('Community poll',style:theme.textTheme.labelLarge?.copyWith(color:scheme.primary,fontWeight:FontWeight.w800)),
                    const SizedBox(height:AaraagateTokens.space2),
                    Text(title,style:theme.textTheme.headlineSmall),
                    if(description.isNotEmpty)...[
                      const SizedBox(height:AaraagateTokens.space2),
                      Text(description,style:theme.textTheme.bodyMedium?.copyWith(color:scheme.onSurfaceVariant)),
                    ],
                    const SizedBox(height:AaraagateTokens.space4),
                    PremiumSurface(
                      color:scheme.surfaceContainerLow,
                      child:Row(
                        crossAxisAlignment:CrossAxisAlignment.start,
                        children:[
                          Icon(Icons.info_outline_rounded,color:scheme.primary),
                          const SizedBox(width:AaraagateTokens.space3),
                          const Expanded(child:Text('Community poll only — not statutory voting. A recorded response cannot be changed from the Resident app.')),
                        ],
                      ),
                    ),
                    const SizedBox(height:AaraagateTokens.space4),
                    if(options.isEmpty)
                      const AppStateCard(icon:Icons.how_to_vote_outlined,message:'No response options are available for this poll.')
                    else
                      for(final option in options)...[
                        InkWell(
                          key:ValueKey('poll-option-${option['id']}'),
                          onTap:canRespond&&!submitting?()=>setModalState(()=>selectedOptionId=option['id'].toString()):null,
                          borderRadius:BorderRadius.circular(AaraagateTokens.radiusControl),
                          child:Padding(
                            padding:const EdgeInsets.symmetric(vertical:AaraagateTokens.space2),
                            child:Row(children:[
                              Icon(
                                selectedOptionId==option['id']?.toString()?Icons.radio_button_checked_rounded:Icons.radio_button_unchecked_rounded,
                                color:selectedOptionId==option['id']?.toString()?scheme.primary:scheme.onSurfaceVariant,
                              ),
                              const SizedBox(width:AaraagateTokens.space3),
                              Expanded(child:Text(option['label']?.toString()??'Option',style:theme.textTheme.bodyLarge)),
                            ]),
                          ),
                        ),
                      ],
                    if(currentOptionId!=null)...[
                      const SizedBox(height:AaraagateTokens.space3),
                      Text('Your recorded response: ${recordedLabel??'Recorded option'}',style:theme.textTheme.bodyMedium?.copyWith(fontWeight:FontWeight.w700)),
                    ],
                    if(status=='CLOSED'&&currentOptionId==null)...[
                      const SizedBox(height:AaraagateTokens.space3),
                      Text('This poll is closed. No response is recorded for your account.',style:theme.textTheme.bodyMedium?.copyWith(color:scheme.onSurfaceVariant)),
                    ],
                    if(actionError!=null)...[
                      const SizedBox(height:AaraagateTokens.space3),
                      Text(actionError!,style:theme.textTheme.bodySmall?.copyWith(color:scheme.error)),
                    ],
                    if(canRespond)...[
                      const SizedBox(height:AaraagateTokens.space5),
                      SizedBox(
                        width:double.infinity,
                        child:FilledButton.icon(
                          key:ValueKey('poll-confirm-$pollId'),
                          onPressed:submitting?null:() async {
                            final chosen=selectedOptionId;
                            if(chosen==null){
                              setModalState(()=>actionError='Choose one option before confirming your response.');
                              return;
                            }
                            setModalState((){submitting=true;actionError=null;});
                            var requestReturned=false;
                            try{
                              await widget.controller.repository.respondToCommunityPoll(pollId:pollId,optionId:chosen);
                              requestReturned=true;
                            }catch(_){}

                            try{
                              final fresh=await _reloadPolls();
                              final authoritative=_pollById(fresh,pollId)?['myOptionId']?.toString();
                              if(authoritative==chosen){
                                if(sheetContext.mounted)Navigator.pop(sheetContext);
                                if(mounted){
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(requestReturned?'Response recorded.':'Response confirmed after refresh.')));
                                }
                                return;
                              }
                              if(sheetContext.mounted){
                                setModalState((){
                                  submitting=false;
                                  actionError=authoritative==null
                                      ? 'Response could not be verified. Review your selection and retry.'
                                      : 'A different response is already recorded for this poll. Refresh before taking another action.';
                                });
                              }
                            }catch(_){
                              if(sheetContext.mounted){
                                setModalState((){
                                  submitting=false;
                                  actionError=requestReturned
                                      ? 'Response was sent but confirmation could not be verified. Refresh before trying again.'
                                      : 'Response could not be verified. Review your selection and retry.';
                                });
                              }
                            }
                          },
                          icon:submitting
                              ? const SizedBox(width:18,height:18,child:CircularProgressIndicator(strokeWidth:2))
                              : const Icon(Icons.how_to_vote_rounded),
                          label:Text(submitting?'Confirming…':'Confirm response'),
                        ),
                      ),
                    ],
                    const SizedBox(height:AaraagateTokens.space2),
                    SizedBox(width:double.infinity,child:TextButton(onPressed:submitting?null:()=>Navigator.pop(sheetContext),child:const Text('Close'))),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _openSocietyDocument(String id) async {
    try {
      final intent=await widget.controller.repository.societyDocumentDownloadIntent(id);
      final raw=(intent['downloadUrl']??intent['url'])?.toString();
      final uri=raw==null?null:Uri.tryParse(raw);
      if(uri==null||!await launchUrl(uri,mode:LaunchMode.externalApplication)){
        throw Exception('Document link could not be opened');
      }
    } catch (_) {
      if(!mounted)return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Document could not be opened. Please try again.')));
    }
  }

  String _documentSubtitle(Map<String,dynamic> d){
    final parts=<String>[];
    final category=d['category']?.toString();
    final audience=d['audience']?.toString();
    final version=d['version']?.toString();
    final building=d['buildingName']?.toString();
    final unit=d['unitNumber']?.toString();
    if(category!=null&&category.isNotEmpty)parts.add(_label(category));
    if(audience!=null&&audience.isNotEmpty)parts.add(_label(audience));
    if(version!=null&&version.isNotEmpty)parts.add('v$version · Current');
    if(building!=null&&building.isNotEmpty&&unit!=null&&unit.isNotEmpty)parts.add('$building · $unit');
    if(d['supersedesDocumentId']!=null)parts.add('Replaces previous version');
    return parts.join(' · ');
  }

  @override Widget build(BuildContext context){
    final theme=Theme.of(context), scheme=theme.colorScheme;
    final notices=widget.controller.notices.take(3).toList();
    final openTickets=_tickets.where((t)=>!{'RESOLVED','CLOSED'}.contains((t['status']?.toString()??'').toUpperCase())).take(2).toList();
    return SafeArea(child:RefreshIndicator(onRefresh:() async{await widget.controller.load();await _load();},child:ListView(
      physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.fromLTRB(AaraagateTokens.pageGutter,AaraagateTokens.space4,AaraagateTokens.pageGutter,AaraagateTokens.space8),children:[
      Text('Community',style:theme.textTheme.headlineMedium?.copyWith(fontWeight:FontWeight.w800)),
      const SizedBox(height:AaraagateTokens.space1),Text('Society updates, meetings, documents and polls with your access rules applied.',style:theme.textTheme.bodyLarge?.copyWith(color:scheme.onSurfaceVariant)),
      const SizedBox(height:AaraagateTokens.space4),
      _CommunityShortcutBar(
        onOpenUpdates:()=>Navigator.of(context).push(MaterialPageRoute(builder:(_)=>NoticesScreen(controller:widget.controller))),
        onOpenPolls:()=>Navigator.of(context).push(MaterialPageRoute(builder:(_)=>CommunityPollsScreen(repository:widget.controller.repository))),
        onOpenEvents:()=>Navigator.of(context).push(MaterialPageRoute(builder:(_)=>CommunityEventsScreen(repository:widget.controller.repository))),
      ),
      const SizedBox(height:AaraagateTokens.space4),
      PremiumSurface(
        color:scheme.primaryContainer.withValues(alpha: .45),
        child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Icon(Icons.verified_user_outlined,color:scheme.onPrimaryContainer),
          const SizedBox(width:AaraagateTokens.space3),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('Community, not a promotion feed',style:theme.textTheme.titleSmall?.copyWith(fontWeight:FontWeight.w800,color:scheme.onPrimaryContainer)),
            const SizedBox(height:AaraagateTokens.space1),
            Text('This space is for society notices, governance and your property-scoped requests. Commercial discovery stays under Services, and content here follows your active relationship and access rules.',style:theme.textTheme.bodySmall?.copyWith(color:scheme.onPrimaryContainer.withValues(alpha: .82))),
          ])),
        ]),
      ),
      const SizedBox(height:AaraagateTokens.space4),
      PremiumSurface(
        padding:EdgeInsets.zero,
        child:_Tile(
          icon:Icons.request_page_outlined,
          title:'Resident requests & certificates',
          subtitle:'NOC, no-dues, address proof, move-out and parking permissions through the audited society workflow.',
          actionLabel:'Open requests',
          onAction:()=>Navigator.of(context).push(MaterialPageRoute(builder:(_)=>ResidentRequestsScreen(controller:widget.controller))),
        ),
      ),
      if(loading)...[const SizedBox(height:AaraagateTokens.space4),const AppStateCard(icon:Icons.sync_rounded,message:'Loading community hub…',loading:true)],
      if(error!=null)...[const SizedBox(height:AaraagateTokens.space4),AppStateCard(icon:Icons.error_outline_rounded,message:error!,actionLabel:'Retry',onAction:_load)],
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Latest updates',supportingText:'Recent updates published for your society.'),const SizedBox(height:AaraagateTokens.space3),
      if(notices.isEmpty)const AppStateCard(icon:Icons.campaign_outlined,message:'No current notices.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<notices.length;i++)...[_Tile(icon:Icons.campaign_outlined,title:notices[i]['title']?.toString()??'Society notice',subtitle:notices[i]['requiresAcknowledgement']==true?(notices[i]['acknowledgedAt']!=null?'Acknowledged':'Acknowledgement requested'):'Published update'),if(i<notices.length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Meetings & decisions',supportingText:'Community-visible governance meetings and closure information.'),const SizedBox(height:AaraagateTokens.space3),
      if(meetings.isEmpty)const AppStateCard(icon:Icons.groups_outlined,message:'No community-visible meetings.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<meetings.take(3).length;i++)...[_Tile(icon:Icons.groups_outlined,title:meetings[i]['title']?.toString()??'Society meeting',subtitle:_meetingSubtitle(meetings[i])),if(i<meetings.take(3).length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Society documents',supportingText:'Published documents authorized for your current relationship and property.'),const SizedBox(height:AaraagateTokens.space3),
      if(societyDocuments.isEmpty)const AppStateCard(icon:Icons.folder_open_outlined,message:'No published society documents available.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<societyDocuments.take(5).length;i++)...[_Tile(icon:Icons.description_outlined,title:societyDocuments[i]['title']?.toString()??'Society document',subtitle:_documentSubtitle(societyDocuments[i]),actionLabel:'Open document',onAction:()=>_openSocietyDocument(societyDocuments[i]['id'].toString())),if(i<societyDocuments.take(5).length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Governance references',supportingText:'Meeting-related document references published through governance workflows.'),const SizedBox(height:AaraagateTokens.space3),
      if(governanceDocuments.isEmpty)const AppStateCard(icon:Icons.folder_open_outlined,message:'No governance references available.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<governanceDocuments.take(3).length;i++)...[_Tile(icon:Icons.description_outlined,title:_label(governanceDocuments[i]['kind']?.toString()??'Document'),subtitle:governanceDocuments[i]['note']?.toString()??'Governance document'),if(i<governanceDocuments.take(3).length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Community events',supportingText:'Upcoming non-statutory society activities with privacy-preserving RSVP.'),const SizedBox(height:AaraagateTokens.space3),
      PremiumSurface(padding:EdgeInsets.zero,child:_Tile(icon:Icons.event_available_outlined,title:'Events & RSVP',subtitle:'See upcoming activities, capacity and your response.',actionLabel:'View events',onAction:()=>Navigator.of(context).push(MaterialPageRoute(builder:(_)=>CommunityEventsScreen(repository:widget.controller.repository))))),
      const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Polls',supportingText:'Current non-statutory community participation.'),const SizedBox(height:AaraagateTokens.space3),
      if(polls.isEmpty)const AppStateCard(icon:Icons.how_to_vote_outlined,message:'No community polls open.') else PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<polls.take(3).length;i++)...[_Tile(icon:Icons.how_to_vote_outlined,title:polls[i]['question']?.toString()??polls[i]['title']?.toString()??'Community poll',subtitle:_pollSubtitle(polls[i]),actionLabel:polls[i]['myOptionId']!=null||(polls[i]['status']?.toString()??'OPEN').toUpperCase()=='CLOSED'?'Review':'Respond',onAction:()=>_openPoll(polls[i])),if(i<polls.take(3).length-1)Divider(height:1,color:scheme.outlineVariant)]])),
      if(openTickets.isNotEmpty)...[const SizedBox(height:AaraagateTokens.space6),const PremiumSectionHeader(title:'Your open helpdesk',supportingText:'Requests from this selected property.'),const SizedBox(height:AaraagateTokens.space3),PremiumSurface(padding:EdgeInsets.zero,child:Column(children:[for(var i=0;i<openTickets.length;i++)...[_Tile(icon:Icons.support_agent_outlined,title:openTickets[i]['title']?.toString()??'Helpdesk request',subtitle:_label(openTickets[i]['status']?.toString()??'Open')),if(i<openTickets.length-1)Divider(height:1,color:scheme.outlineVariant)]]))]
    ])));
  }
  static String _meetingSubtitle(Map<String,dynamic> m){final status=_label(m['status']?.toString()??'Scheduled');final at=DateTime.tryParse(m['scheduledAt']?.toString()??'')?.toLocal();return at==null?status:'$status · ${at.day.toString().padLeft(2,'0')}/${at.month.toString().padLeft(2,'0')}/${at.year}';}
  static String _label(String value)=>value.toLowerCase().split('_').map((w)=>w.isEmpty?w:'${w[0].toUpperCase()}${w.substring(1)}').join(' ');
}

class _CommunityShortcutBar extends StatelessWidget {
  const _CommunityShortcutBar({
    required this.onOpenUpdates,
    required this.onOpenPolls,
    required this.onOpenEvents,
  });

  final VoidCallback onOpenUpdates;
  final VoidCallback onOpenPolls;
  final VoidCallback onOpenEvents;

  @override
  Widget build(BuildContext context) {
    const compactPadding=EdgeInsets.symmetric(horizontal:AaraagateTokens.space2);
    const minimumSize=Size(0,AaraagateTokens.minTouchTarget);
    return PremiumSurface(
      key:const ValueKey('community-shortcuts-bar'),
      padding:const EdgeInsets.all(AaraagateTokens.space1),
      child:Row(
        children:[
          Expanded(
            child:FilledButton.tonalIcon(
              style:FilledButton.styleFrom(padding:compactPadding,minimumSize:minimumSize),
              onPressed:onOpenUpdates,
              icon:const Icon(Icons.campaign_outlined,size:18),
              label:const Text('Updates'),
            ),
          ),
          const SizedBox(width:AaraagateTokens.space1),
          Expanded(
            child:OutlinedButton.icon(
              style:OutlinedButton.styleFrom(padding:compactPadding,minimumSize:minimumSize),
              onPressed:onOpenPolls,
              icon:const Icon(Icons.poll_outlined,size:18),
              label:const Text('Polls'),
            ),
          ),
          const SizedBox(width:AaraagateTokens.space1),
          Expanded(
            child:OutlinedButton.icon(
              style:OutlinedButton.styleFrom(padding:compactPadding,minimumSize:minimumSize),
              onPressed:onOpenEvents,
              icon:const Icon(Icons.event_available_outlined,size:18),
              label:const Text('Events'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget{
  const _Tile({required this.icon,required this.title,required this.subtitle,this.actionLabel,this.onAction});final IconData icon;final String title,subtitle;final String? actionLabel;final VoidCallback? onAction;
  @override Widget build(BuildContext context){final theme=Theme.of(context),scheme=theme.colorScheme;return ListTile(minTileHeight:AaraagateTokens.minTouchTarget,contentPadding:const EdgeInsets.symmetric(horizontal:AaraagateTokens.space4,vertical:AaraagateTokens.space2),leading:Container(width:AaraagateTokens.iconContainer,height:AaraagateTokens.iconContainer,alignment:Alignment.center,decoration:BoxDecoration(color:scheme.surfaceContainerHighest,borderRadius:BorderRadius.circular(AaraagateTokens.radiusSmall)),child:Icon(icon,color:scheme.primary)),title:Text(title,maxLines:2,overflow:TextOverflow.ellipsis,style:theme.textTheme.titleSmall?.copyWith(fontWeight:FontWeight.w700)),subtitle:Text(subtitle,maxLines:3,overflow:TextOverflow.ellipsis),trailing:onAction==null?null:TextButton(onPressed:onAction,child:Text(actionLabel??'Open')));}
}
