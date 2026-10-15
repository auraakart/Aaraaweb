class GuardArrivalVoiceDraft {
  const GuardArrivalVoiceDraft({
    required this.transcript,
    required this.subjectType,
    this.provider,
    this.unitId,
  });

  final String transcript;
  final String subjectType;
  final String? provider;
  final String? unitId;
}

class GuardArrivalVoiceParser {
  static const _deliveryProviders = <String, String>{
    'swiggy': 'Swiggy',
    'zomato': 'Zomato',
    'zepto': 'Zepto',
    'blinkit': 'Blinkit',
    'amazon': 'Amazon',
    'flipkart': 'Flipkart',
    'bigbasket': 'BigBasket',
  };

  static const _cabProviders = <String, String>{
    'ola': 'Ola',
    'uber': 'Uber',
    'rapido': 'Rapido',
  };

  static GuardArrivalVoiceDraft parse({
    required String transcript,
    required List<Map<String, dynamic>> units,
  }) {
    final normalized = _normalize(transcript);
    final cabProvider = _findProvider(normalized, _cabProviders);
    final deliveryProvider = _findProvider(normalized, _deliveryProviders);
    final explicitCab = _containsWord(normalized, 'cab') ||
        _containsWord(normalized, 'taxi') ||
        cabProvider != null;
    final provider = cabProvider ?? deliveryProvider;

    return GuardArrivalVoiceDraft(
      transcript: transcript.trim(),
      subjectType: explicitCab ? 'CAB' : 'DELIVERY',
      provider: provider,
      unitId: _matchUnit(normalized, units),
    );
  }

  static String? _findProvider(
    String normalized,
    Map<String, String> providers,
  ) {
    for (final entry in providers.entries) {
      if (_containsWord(normalized, entry.key)) return entry.value;
    }
    return null;
  }

  static String? _matchUnit(
    String normalized,
    List<Map<String, dynamic>> units,
  ) {
    final transcriptCompact = _compact(normalized);
    final strongMatches = <String>{};

    for (final unit in units) {
      final id = unit['id']?.toString();
      final number = unit['number']?.toString();
      if (id == null || number == null || number.trim().isEmpty) continue;

      final building = unit['building'] is Map
          ? Map<String, dynamic>.from(unit['building'] as Map)
          : const <String, dynamic>{};
      final buildingTokens = <String>[
        building['code']?.toString() ?? '',
        building['name']?.toString() ?? '',
      ].where((value) => value.trim().isNotEmpty);

      for (final token in buildingTokens) {
        final composite = _compact('$token $number');
        if (composite.length >= 2 && transcriptCompact.contains(composite)) {
          strongMatches.add(id);
        }
      }
    }

    if (strongMatches.length == 1) return strongMatches.first;
    if (strongMatches.length > 1) return null;

    final numberMatches = <String>{};
    for (final unit in units) {
      final id = unit['id']?.toString();
      final number = unit['number']?.toString();
      if (id == null || number == null || number.trim().isEmpty) continue;
      final compactNumber = _compact(number);
      if (compactNumber.length >= 2 && transcriptCompact.contains(compactNumber)) {
        numberMatches.add(id);
      }
    }

    return numberMatches.length == 1 ? numberMatches.first : null;
  }

  static bool _containsWord(String input, String word) =>
      ' $input '.contains(' $word ');

  static String _normalize(String input) => input
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9\s-]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  static String _compact(String input) =>
      _normalize(input).replaceAll(RegExp(r'[^a-z0-9]'), '');
}
