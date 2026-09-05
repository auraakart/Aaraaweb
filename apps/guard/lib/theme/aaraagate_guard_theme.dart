import 'package:flutter/material.dart';

class AaraagateGuardTheme {
  // Same Aaraagate visual language as Resident, tuned for faster operational
  // scanning and larger touch targets at the gate.
  static const Color brand = Color(0xFF0EABBE);
  static const Color brandDeep = Color(0xFF05879A);
  static const Color canvas = Color(0xFFF2FAFB);
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
      ),
      cardTheme: CardTheme(
        margin: EdgeInsets.zero,
        elevation: 0,
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brandDeep,
          foregroundColor: Colors.white,
          minimumSize: const Size(56, 56),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brandDeep,
          minimumSize: const Size(56, 56),
          side: const BorderSide(color: line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: brandDeep, width: 1.8),
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
