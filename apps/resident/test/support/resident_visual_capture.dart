import 'dart:io';
import 'dart:ui' as ui;
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

// Use the SDK's bundled fonts rather than Ahem blocks in captured Flutter images.
Future<void> loadSdkFonts() async {
  var root = Directory(Platform.environment['FLUTTER_ROOT'] ?? File(Platform.resolvedExecutable).parent.path);
  for (var level = 0; level < 8; level++) {
    final directory = Directory('${root.path}/bin/cache/artifacts/material_fonts');
    if (directory.existsSync()) {
      for (final entry in [('Roboto', 'Roboto-Regular.ttf'), ('MaterialIcons', 'MaterialIcons-Regular.otf')]) {
        final file = File('${directory.path}/${entry.$2}');
        if (file.existsSync()) {
          final loader = FontLoader(entry.$1)..addFont(file.readAsBytes().then(ByteData.sublistView));
          await loader.load();
        }
      }
      return;
    }
    root = root.parent;
  }
}

// Unspecified button font families use FlutterTest blocks in a widget test.
// Supply the native Android family for captures, preserving every style value.
ThemeData captureTheme(bool dark) {
  final theme = dark ? AaraagateTheme.dark() : AaraagateTheme.light();
  ButtonStyle font(ButtonStyle style) => style.copyWith(
    textStyle: WidgetStateProperty.resolveWith((states) =>
      (style.textStyle?.resolve(states) ?? theme.textTheme.labelLarge!).copyWith(fontFamily: 'Roboto')),
  );
  return theme.copyWith(
    filledButtonTheme: FilledButtonThemeData(style: font(theme.filledButtonTheme.style!)),
    outlinedButtonTheme: OutlinedButtonThemeData(style: font(theme.outlinedButtonTheme.style!)),
    textButtonTheme: TextButtonThemeData(style: font(theme.textButtonTheme.style!)),
  );
}

Future<void> captureResidentScreen(WidgetTester tester, GlobalKey key, String name) async {
  await tester.runAsync(() async {
    final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      final directory = Directory('coverage/resident-ux');
      await directory.create(recursive: true);
      await File('${directory.path}/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    } finally {
      image.dispose();
    }
  });
}

