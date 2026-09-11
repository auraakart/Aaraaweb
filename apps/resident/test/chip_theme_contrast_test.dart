import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  void expectReadableChipTheme(bool dark) {
    final theme = dark ? AaraagateTheme.dark() : AaraagateTheme.light();
    final scheme = theme.colorScheme;
    final chip = theme.chipTheme;

    expect(chip.backgroundColor, scheme.surfaceContainer);
    expect(chip.labelStyle?.color, scheme.onSurface);
    expect(chip.selectedColor, scheme.primaryContainer);
    expect(chip.secondaryLabelStyle?.color, scheme.onPrimaryContainer);
    expect(chip.checkmarkColor, scheme.onPrimaryContainer);
  }

  test('light theme keeps unselected and selected chip labels readable', () {
    expectReadableChipTheme(false);
  });

  test('dark theme keeps unselected and selected chip labels readable', () {
    expectReadableChipTheme(true);
  });
}
