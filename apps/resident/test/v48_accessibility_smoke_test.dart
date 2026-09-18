import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/ai_assistant_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main(){
  testWidgets('V4.8 assistant remains usable with large text scaling',(tester) async {
    final api=ApiClient(baseUrl:'http://example.test',accessToken:'token');
    await tester.pumpWidget(
      MediaQuery(
        data:const MediaQueryData(textScaler:TextScaler.linear(2.0)),
        child:MaterialApp(home:AiAssistantScreen(apiClient:api,unitId:null)),
      ),
    );
    await tester.pump();

    expect(find.text('Aaraagate Assistant'),findsOneWidget);
    expect(find.text('Grounded operations assistant'),findsOneWidget);
    expect(find.textContaining('cannot change society data directly'),findsOneWidget);
    expect(find.text('Ask'),findsOneWidget);
    expect(tester.takeException(),isNull);
  });
}
