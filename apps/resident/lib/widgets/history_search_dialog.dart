import 'package:flutter/material.dart';
import '../localization/aaraagate_strings.dart';

class HistorySearchDialog extends StatefulWidget {
  const HistorySearchDialog({super.key,required this.initialQuery});
  final String initialQuery;
  @override
  State<HistorySearchDialog> createState()=>_HistorySearchDialogState();
}

class _HistorySearchDialogState extends State<HistorySearchDialog> {
  late final TextEditingController _input;
  @override
  void initState(){super.initState();_input=TextEditingController(text:widget.initialQuery);}
  @override
  void dispose(){_input.dispose();super.dispose();}
  @override
  Widget build(BuildContext context){
    final strings=AaraagateStrings.device();
    return AlertDialog(scrollable:true,
      title:Text(strings.text('historySearch')),
      content:TextField(controller:_input,maxLength:120,autofocus:true,
        decoration:InputDecoration(hintText:strings.text('historySearchHint')),
        onSubmitted:(value)=>Navigator.pop(context,value)),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(context),child:Text(strings.text('historyCancel'))),
        TextButton(onPressed:()=>Navigator.pop(context,_input.text),child:Text(strings.text('historySearch'))),
      ],
    );
  }
}
