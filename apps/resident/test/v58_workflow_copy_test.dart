import 'package:aaraagate_resident/localization/v58_workflow_copy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('eight-language workflow copy preserves all placeholders', () {
    final english = v58WorkflowCopy['en']!;
    expect(v58WorkflowCopy.keys.toSet(), {'en','hi','ta','te','kn','ml','mr','bn'});
    Set<String> placeholders(String value) => RegExp(r'\{[^}]+\}').allMatches(value).map((match)=>match.group(0)!).toSet();
    for(final language in v58WorkflowCopy.entries) {
      expect(language.value.keys.toSet(), english.keys.toSet());
      for(final entry in english.entries) {
        expect(language.value[entry.key]!.trim(), isNotEmpty);
        expect(placeholders(language.value[entry.key]!), placeholders(entry.value),reason:'${language.key}/${entry.key}');
      }
    }
  });
}
