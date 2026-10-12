import 'dart:math' as math;

/// Presentation-only context. Never use color or brand ID to decide access.
class SocietyBrandTokens {
  const SocietyBrandTokens._({
    required this.societyId,
    required this.revision,
    required this.displayName,
    required this.primaryArgb,
    required this.primaryDeepArgb,
    this.supportEmail,
    this.supportPhone,
  });

  final String societyId;
  final String revision;
  final String displayName;
  final int primaryArgb;
  final int primaryDeepArgb;
  final String? supportEmail;
  final String? supportPhone;

  int get onPrimaryArgb => _onColor(primaryArgb);
  int get onPrimaryDeepArgb => _onColor(primaryDeepArgb);

  static final RegExp _color = RegExp(r'^#[0-9A-Fa-f]{6}$');
  static final RegExp _version = RegExp(r'^v[1-9][0-9]*

  /// Discard a stale, cross-society or corrupt network/offline response.
  /// The caller must already have an authenticated society session.
  static SocietyBrandTokens? tryParseContext(
    Object? response, {
    required String societyId,
  }) {
    if (societyId.isEmpty || response is! Map) return null;
    final society = response['society'];
    final branding = response['branding'];
    if (society is! Map || society['id'] != societyId || branding is! Map) return null;
    if (branding['schemaVersion'] != 1) return null;
    final revision = branding['revision'];
    final brand = branding['brand'];
    if (revision is! String || brand is! Map || brand['id'] != 'aaraagate') return null;
    if (brand.keys.any((key) => !{'id', 'displayName', 'colors', 'support'}.contains(key))) return null;
    final name = brand['displayName'];
    if (name is! String || name.trim().isEmpty || name.trim().length > 80 ||
        RegExp(r'[<>\x00-\x1f\x7f]').hasMatch(name)) return null;
    final colors = brand['colors'];
    if (colors is! Map || colors.length != 2 ||
        colors.keys.any((key) => !{'primary', 'primaryDeep'}.contains(key))) return null;
    final primary = colors['primary'], deep = colors['primaryDeep'];
    if (primary is! String || deep is! String ||
        !_color.hasMatch(primary) || !_color.hasMatch(deep)) return null;
    String? email;
    String? phone;
    if (brand.containsKey('support')) {
      final support = brand['support'];
      if (support is! Map || support.isEmpty ||
          support.keys.any((key) => !{'email', 'phone'}.contains(key))) return null;
      if (support.containsKey('email')) {
        final candidate = support['email'];
        if (candidate is! String || candidate.length > 254 ||
            candidate.trim() != candidate ||
            candidate != candidate.toLowerCase() ||
            !_supportEmail.hasMatch(candidate) || candidate.contains('..')) return null;
        email = candidate;
      }
      if (support.containsKey('phone')) {
        final candidate = support['phone'];
        if (candidate is! String || !_supportPhone.hasMatch(candidate)) return null;
        phone = candidate;
      }
    }
    if (revision != 'aaraagate-default-v1') {
      final prefix = 'society-$societyId-';
      if (!revision.startsWith(prefix) || !_version.hasMatch(revision.substring(prefix.length))) return null;
    }
    return SocietyBrandTokens._(
      societyId: societyId,
      revision: revision,
      displayName: name.trim(),
      primaryArgb: _parseColor(primary),
      primaryDeepArgb: _parseColor(deep),
      supportEmail: email,
      supportPhone: phone,
    );
  }

  static int _parseColor(String hex) => 0xFF000000 | int.parse(hex.substring(1), radix: 16);

  static int _onColor(int color) {
    final r = ((color >> 16) & 255) / 255;
    final g = ((color >> 8) & 255) / 255;
    final b = (color & 255) / 255;
    double channel(double x) => x <= 0.04045 ? x / 12.92 : math.pow((x + 0.055) / 1.055, 2.4).toDouble();
    final luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return (luminance + 0.05) / 0.05 >= 4.5 ? 0xFF000000 : 0xFFFFFFFF;
  }

}
);
  static final RegExp _supportPhone = RegExp(r'^\+[1-9][0-9]{7,14}

  /// Discard a stale, cross-society or corrupt network/offline response.
  /// The caller must already have an authenticated society session.
  static SocietyBrandTokens? tryParseContext(
    Object? response, {
    required String societyId,
  }) {
    if (societyId.isEmpty || response is! Map) return null;
    final society = response['society'];
    final branding = response['branding'];
    if (society is! Map || society['id'] != societyId || branding is! Map) return null;
    if (branding['schemaVersion'] != 1) return null;
    final revision = branding['revision'];
    final brand = branding['brand'];
    if (revision is! String || brand is! Map || brand['id'] != 'aaraagate') return null;
    if (brand.keys.any((key) => !{'id', 'displayName', 'colors'}.contains(key))) return null;
    final name = brand['displayName'];
    if (name is! String || name.trim().isEmpty || name.trim().length > 80 ||
        RegExp(r'[<>\x00-\x1f\x7f]').hasMatch(name)) return null;
    final colors = brand['colors'];
    if (colors is! Map || colors.length != 2 ||
        colors.keys.any((key) => !{'primary', 'primaryDeep'}.contains(key))) return null;
    final primary = colors['primary'], deep = colors['primaryDeep'];
    if (primary is! String || deep is! String ||
        !_color.hasMatch(primary) || !_color.hasMatch(deep)) return null;
    if (revision != 'aaraagate-default-v1') {
      final prefix = 'society-$societyId-';
      if (!revision.startsWith(prefix) || !_version.hasMatch(revision.substring(prefix.length))) return null;
    }
    return SocietyBrandTokens._(
      societyId: societyId,
      revision: revision,
      displayName: name.trim(),
      primaryArgb: _parseColor(primary),
      primaryDeepArgb: _parseColor(deep),
    );
  }

  static int _parseColor(String hex) => 0xFF000000 | int.parse(hex.substring(1), radix: 16);

  static int _onColor(int color) {
    final r = ((color >> 16) & 255) / 255;
    final g = ((color >> 8) & 255) / 255;
    final b = (color & 255) / 255;
    double channel(double x) => x <= 0.04045 ? x / 12.92 : math.pow((x + 0.055) / 1.055, 2.4).toDouble();
    final luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return (luminance + 0.05) / 0.05 >= 4.5 ? 0xFF000000 : 0xFFFFFFFF;
  }

}
);
  static final RegExp _supportEmail = RegExp(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}

  /// Discard a stale, cross-society or corrupt network/offline response.
  /// The caller must already have an authenticated society session.
  static SocietyBrandTokens? tryParseContext(
    Object? response, {
    required String societyId,
  }) {
    if (societyId.isEmpty || response is! Map) return null;
    final society = response['society'];
    final branding = response['branding'];
    if (society is! Map || society['id'] != societyId || branding is! Map) return null;
    if (branding['schemaVersion'] != 1) return null;
    final revision = branding['revision'];
    final brand = branding['brand'];
    if (revision is! String || brand is! Map || brand['id'] != 'aaraagate') return null;
    if (brand.keys.any((key) => !{'id', 'displayName', 'colors'}.contains(key))) return null;
    final name = brand['displayName'];
    if (name is! String || name.trim().isEmpty || name.trim().length > 80 ||
        RegExp(r'[<>\x00-\x1f\x7f]').hasMatch(name)) return null;
    final colors = brand['colors'];
    if (colors is! Map || colors.length != 2 ||
        colors.keys.any((key) => !{'primary', 'primaryDeep'}.contains(key))) return null;
    final primary = colors['primary'], deep = colors['primaryDeep'];
    if (primary is! String || deep is! String ||
        !_color.hasMatch(primary) || !_color.hasMatch(deep)) return null;
    if (revision != 'aaraagate-default-v1') {
      final prefix = 'society-$societyId-';
      if (!revision.startsWith(prefix) || !_version.hasMatch(revision.substring(prefix.length))) return null;
    }
    return SocietyBrandTokens._(
      societyId: societyId,
      revision: revision,
      displayName: name.trim(),
      primaryArgb: _parseColor(primary),
      primaryDeepArgb: _parseColor(deep),
    );
  }

  static int _parseColor(String hex) => 0xFF000000 | int.parse(hex.substring(1), radix: 16);

  static int _onColor(int color) {
    final r = ((color >> 16) & 255) / 255;
    final g = ((color >> 8) & 255) / 255;
    final b = (color & 255) / 255;
    double channel(double x) => x <= 0.04045 ? x / 12.92 : math.pow((x + 0.055) / 1.055, 2.4).toDouble();
    final luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return (luminance + 0.05) / 0.05 >= 4.5 ? 0xFF000000 : 0xFFFFFFFF;
  }

}
);

  /// Discard a stale, cross-society or corrupt network/offline response.
  /// The caller must already have an authenticated society session.
  static SocietyBrandTokens? tryParseContext(
    Object? response, {
    required String societyId,
  }) {
    if (societyId.isEmpty || response is! Map) return null;
    final society = response['society'];
    final branding = response['branding'];
    if (society is! Map || society['id'] != societyId || branding is! Map) return null;
    if (branding['schemaVersion'] != 1) return null;
    final revision = branding['revision'];
    final brand = branding['brand'];
    if (revision is! String || brand is! Map || brand['id'] != 'aaraagate') return null;
    if (brand.keys.any((key) => !{'id', 'displayName', 'colors'}.contains(key))) return null;
    final name = brand['displayName'];
    if (name is! String || name.trim().isEmpty || name.trim().length > 80 ||
        RegExp(r'[<>\x00-\x1f\x7f]').hasMatch(name)) return null;
    final colors = brand['colors'];
    if (colors is! Map || colors.length != 2 ||
        colors.keys.any((key) => !{'primary', 'primaryDeep'}.contains(key))) return null;
    final primary = colors['primary'], deep = colors['primaryDeep'];
    if (primary is! String || deep is! String ||
        !_color.hasMatch(primary) || !_color.hasMatch(deep)) return null;
    if (revision != 'aaraagate-default-v1') {
      final prefix = 'society-$societyId-';
      if (!revision.startsWith(prefix) || !_version.hasMatch(revision.substring(prefix.length))) return null;
    }
    return SocietyBrandTokens._(
      societyId: societyId,
      revision: revision,
      displayName: name.trim(),
      primaryArgb: _parseColor(primary),
      primaryDeepArgb: _parseColor(deep),
    );
  }

  static int _parseColor(String hex) => 0xFF000000 | int.parse(hex.substring(1), radix: 16);

  static int _onColor(int color) {
    final r = ((color >> 16) & 255) / 255;
    final g = ((color >> 8) & 255) / 255;
    final b = (color & 255) / 255;
    double channel(double x) => x <= 0.04045 ? x / 12.92 : math.pow((x + 0.055) / 1.055, 2.4).toDouble();
    final luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return (luminance + 0.05) / 0.05 >= 4.5 ? 0xFF000000 : 0xFFFFFFFF;
  }

}
