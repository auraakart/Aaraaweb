import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/voice/guard_arrival_voice_parser.dart';

void main() {
  final units = <Map<String, dynamic>>[
    {'id': 'u-a204', 'number': '204', 'building': {'code': 'A', 'name': 'Alpha'}},
    {'id': 'u-b204', 'number': '204', 'building': {'code': 'B', 'name': 'Beta'}},
    {'id': 'u-c305', 'number': '305', 'building': {'code': 'C', 'name': 'Cedar'}},
  ];

  test('parses delivery provider and strong building-unit destination', () {
    final draft = GuardArrivalVoiceParser.parse(transcript: 'Swiggy B 204 delivery', units: units);
    expect(draft.subjectType, 'DELIVERY');
    expect(draft.provider, 'Swiggy');
    expect(draft.unitId, 'u-b204');
  });

  test('parses cab provider and unique unit number', () {
    final draft = GuardArrivalVoiceParser.parse(transcript: 'Uber to 305', units: units);
    expect(draft.subjectType, 'CAB');
    expect(draft.provider, 'Uber');
    expect(draft.unitId, 'u-c305');
  });

  test('never guesses when a spoken unit number is ambiguous', () {
    final draft = GuardArrivalVoiceParser.parse(transcript: 'Zomato delivery for 204', units: units);
    expect(draft.provider, 'Zomato');
    expect(draft.unitId, isNull);
  });

  test('preserves transcript for guard review when provider is unknown', () {
    final draft = GuardArrivalVoiceParser.parse(transcript: 'Local courier Cedar 305', units: units);
    expect(draft.subjectType, 'DELIVERY');
    expect(draft.provider, isNull);
    expect(draft.unitId, 'u-c305');
    expect(draft.transcript, 'Local courier Cedar 305');
  });
}
