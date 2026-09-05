import 'package:flutter/material.dart';

class AaraagateTheme {
  // Product palette derived from the supplied corporate logo. The company
  // identity itself is intentionally not rendered in the Aaraagate UI.
  static const Color brand = Color(0xFF0EABBE);
  static const Color brandDeep = Color(0xFF05879A);
  static const Color canvas = Color(0xFFF5FBFC);
  static const Color aquaSoft = Color(0xFFD4F2F4);
  static const Color ink = Color(0xFF17323A);
  static const Color line = Color(0xFFD5E8EB);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: brandDeep,
      brightness: Brightness.light,
      surface: Colors.white,
    ).copyWith(
      primary: brandDeep,
      secondary: brand,
      surface: Colors.white,
      onSurface: ink,
      outline: line,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: canvas,
      dividerColor: line,
      appBarTheme: const AppBarTheme(
        backgroundColor: canvas,
        foregroundColor: ink,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardTheme(
        margin: EdgeInsets.zero,
        elevation: 0,
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: line),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 72,
        backgroundColor: Colors.white,
        indicatorColor: aquaSoft,
        surfaceTintColor: Colors.transparent,
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brandDeep,
          foregroundColor: Colors.white,
          minimumSize: const Size(48, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brandDeep,
          minimumSize: const Size(48, 52),
          side: const BorderSide(color: line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: brandDeep, width: 1.6),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: aquaSoft,
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: brandDeep),
    );
  }
}
