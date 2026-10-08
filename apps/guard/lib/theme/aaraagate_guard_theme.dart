import 'package:flutter/material.dart';

class AaraagateGuardTokens {
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double radiusSmall = 12;
  static const double radiusControl = 16;
  static const double radiusCard = 16;
  static const double radiusSheet = 24;
  static const double radiusPill = 999;
  static const double minTouchTarget = 56;
  static const double primaryActionHeight = 64;
}

class AaraagateGuardMotion {
  static const Duration quick = Duration(milliseconds: 110);
  static const Duration standard = Duration(milliseconds: 200);
  static Duration duration(BuildContext context, Duration normal) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : normal;
  static const Curve emphasized = Curves.easeOutCubic;
}

class AaraagateGuardElevation {
  static List<BoxShadow> raised(Color shadow) => [
        BoxShadow(
          color: shadow.withValues(alpha: .07),
          blurRadius: 20,
          offset: const Offset(0, 4),
        ),
      ];
}

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
      onPrimary: const Color(0xFF001014),
      secondary: brand,
      surface: Colors.white,
      surfaceContainerLowest: Colors.white,
      surfaceContainerLow: const Color(0xFFF8FCFD),
      surfaceContainer: const Color(0xFFF0F8F9),
      surfaceContainerHigh: const Color(0xFFE7F3F5),
      onSurface: ink,
      outline: const Color(0xFF6C858B),
      outlineVariant: const Color(0xFFE7F1F3),
    );
    return _build(scheme: scheme, scaffoldBackground: canvas, divider: line);
  }

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: brand,
      brightness: Brightness.dark,
      surface: const Color(0xFF152126),
    ).copyWith(
      primary: const Color(0xFF55D5E1),
      secondary: brand,
      surface: const Color(0xFF152126),
      surfaceContainerLowest: const Color(0xFF101A1E),
      surfaceContainerLow: const Color(0xFF18262B),
      surfaceContainer: const Color(0xFF1D2D32),
      surfaceContainerHigh: const Color(0xFF24373D),
      outline: const Color(0xFF80999F),
      outlineVariant: const Color(0xFF293E44),
    );
    return _build(
      scheme: scheme,
      scaffoldBackground: const Color(0xFF101A1E),
      divider: const Color(0xFF293E44),
    );
  }

  static ThemeData _build({
    required ColorScheme scheme,
    required Color scaffoldBackground,
    required Color divider,
  }) {
    final baseText = ThemeData(brightness: scheme.brightness).textTheme;
    return ThemeData(
      useMaterial3: true,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffoldBackground,
      dividerColor: divider,
      textTheme: baseText.copyWith(
        headlineSmall: baseText.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -.4),
        titleLarge: baseText.titleLarge?.copyWith(fontWeight: FontWeight.w700),
        titleMedium: baseText.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        labelLarge: baseText.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scaffoldBackground,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      cardTheme: CardThemeData(
        margin: EdgeInsets.zero,
        elevation: 0,
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusCard)),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size.square(AaraagateGuardTokens.minTouchTarget),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusSmall)),
        ),
      ),
      listTileTheme: ListTileThemeData(
        minVerticalPadding: AaraagateGuardTokens.space3,
        contentPadding: const EdgeInsets.symmetric(horizontal: AaraagateGuardTokens.space4, vertical: AaraagateGuardTokens.space2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusControl)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          minimumSize: const Size(AaraagateGuardTokens.minTouchTarget, AaraagateGuardTokens.primaryActionHeight),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusControl)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: scheme.onSurface,
          minimumSize: const Size(AaraagateGuardTokens.minTouchTarget, AaraagateGuardTokens.minTouchTarget),
          side: BorderSide(color: scheme.outline),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusControl)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: scheme.onSurface,
          minimumSize: const Size(
            AaraagateGuardTokens.minTouchTarget,
            AaraagateGuardTokens.minTouchTarget,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusSmall),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        floatingLabelStyle: TextStyle(color: scheme.onSurface),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusControl),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusControl),
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusControl),
          borderSide: BorderSide(color: scheme.primary, width: 1.8),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surfaceContainer,
        selectedColor: scheme.primaryContainer,
        checkmarkColor: scheme.onPrimaryContainer,
        side: BorderSide.none,
        padding: const EdgeInsets.symmetric(horizontal: AaraagateGuardTokens.space1),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusPill)),
        labelStyle: TextStyle(
          color: scheme.onSurface,
          fontWeight: FontWeight.w700,
        ),
        secondaryLabelStyle: TextStyle(
          color: scheme.onPrimaryContainer,
          fontWeight: FontWeight.w700,
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AaraagateGuardTokens.radiusSheet)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusSheet)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: TextStyle(color: scheme.onInverseSurface, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusControl)),
      ),
      tooltipTheme: TooltipThemeData(
        waitDuration: const Duration(milliseconds: 450),
        decoration: BoxDecoration(
          color: scheme.inverseSurface,
          borderRadius: BorderRadius.circular(AaraagateGuardTokens.radiusSmall),
        ),
        textStyle: TextStyle(color: scheme.onInverseSurface),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}
