import 'package:aaraagate_resident/layout/resident_responsive_layout.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
