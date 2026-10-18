import 'package:aaraagate_resident/layout/resident_responsive_layout.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('residentCompactHomeQuickActionColumns', () {
    test('uses a compact four-action row on normal 320px and 390px phones', () {
      expect(residentCompactHomeQuickActionColumns(maxWidth: 288, textScale: 1), 4);
      expect(residentCompactHomeQuickActionColumns(maxWidth: 358, textScale: 1), 4);
    });
    test('keeps accessible stacks at narrow widths and larger text', () {
      expect(residentCompactHomeQuickActionColumns(maxWidth: 272, textScale: 1), 1);
      expect(residentCompactHomeQuickActionColumns(maxWidth: 288, textScale: 2), 1);
      expect(residentCompactHomeQuickActionColumns(maxWidth: 420, textScale: 1.3), 1);
    });
  });

  group('residentQuickActionColumns', () {
    test('uses one column on compact widths', () {
      expect(
        residentQuickActionColumns(maxWidth: 320, textScale: 1.0),
        1,
      );
    });

    test('uses one column for large accessibility text', () {
      expect(
        residentQuickActionColumns(maxWidth: 420, textScale: 1.3),
        1,
      );
    });

    test('uses two columns on standard phone widths', () {
      expect(
        residentQuickActionColumns(maxWidth: 360, textScale: 1.0),
        2,
      );
    });
  });
}
