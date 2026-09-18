import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('every supported V3 language contains the complete critical gate vocabulary', () {
    final source = File('lib/localization/aaraagate_strings.dart').readAsStringSync();
    const languages = <String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn'];

    Set<String> keysFor(int index) {
      final code = languages[index];
      final marker = "'$code': {";
      final start = source.indexOf(marker);
      expect(start, greaterThanOrEqualTo(0), reason: 'Missing localization map for $code');
      final contentStart = start + marker.length;
      final end = index + 1 < languages.length
          ? source.indexOf("'${languages[index + 1]}': {", contentStart)
          : source.indexOf('\n  };', contentStart);
      expect(end, greaterThan(contentStart), reason: 'Could not parse localization map for $code');
      final block = source.substring(contentStart, end);
      return RegExp(r"'([A-Za-z0-9]+)'\s*:")
          .allMatches(block)
          .map((match) => match.group(1)!)
          .toSet();
    }

    final englishKeys = keysFor(0);
    expect(englishKeys, isNotEmpty);

    for (var index = 1; index < languages.length; index++) {
      final localizedKeys = keysFor(index);
      final missing = englishKeys.difference(localizedKeys).toList()..sort();
      final unexpected = localizedKeys.difference(englishKeys).toList()..sort();
      expect(missing, isEmpty, reason: '${languages[index]} is missing critical localization keys: $missing');
      expect(unexpected, isEmpty, reason: '${languages[index]} has keys not represented in English: $unexpected');
    }
  });
}
