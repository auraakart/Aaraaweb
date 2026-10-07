import 'dart:async';

import 'package:speech_to_text/speech_to_text.dart';

abstract class ResidentSpeech {
  Future<String?> listenOnce({required String languageCode});
  Future<void> stop();
}

class DeviceResidentSpeech implements ResidentSpeech {
  DeviceResidentSpeech({SpeechToText? speech}) : _speech = speech ?? SpeechToText();

  final SpeechToText _speech;

  bool _initialized = false;
  Future<bool>? _initializing;
  Completer<String?>? _activeCompleter;
  String _latestWords = '';

  static const localeByLanguage = <String, String>{
    'en': 'en_IN',
    'hi': 'hi_IN',
    'ta': 'ta_IN',
    'te': 'te_IN',
    'kn': 'kn_IN',
    'ml': 'ml_IN',
    'mr': 'mr_IN',
    'bn': 'bn_IN',
  };

  static String bestLocaleId({
    required String languageCode,
    required Iterable<String> availableLocaleIds,
    String? systemLocaleId,
  }) {
    final preferred = localeByLanguage[languageCode] ?? localeByLanguage['en']!;
    final available = availableLocaleIds.where((value) => value.trim().isNotEmpty).toList(growable: false);
    String normalize(String value) => value.replaceAll('-', '_').toLowerCase();

    final preferredNormalized = normalize(preferred);
    for (final locale in available) {
      if (normalize(locale) == preferredNormalized) return locale;
    }

    final languageNormalized = languageCode.toLowerCase();
    for (final locale in available) {
      final normalized = normalize(locale);
      if (normalized == languageNormalized || normalized.startsWith('${languageNormalized}_')) return locale;
    }

    if (systemLocaleId != null && systemLocaleId.trim().isNotEmpty) {
      final normalizedSystem = normalize(systemLocaleId);
      for (final locale in available) {
        if (normalize(locale) == normalizedSystem) return locale;
      }
      return systemLocaleId;
    }

    if (available.isNotEmpty) return available.first;
    return preferred;
  }

  Future<bool> _ensureInitialized() async {
    if (_initialized) return true;
    final pending = _initializing;
    if (pending != null) return pending;

    final future = _speech.initialize(
      onError: (_) => _completeActive(),
      onStatus: (status) {
        final normalized = status.toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');
        if (normalized == 'done' || normalized == 'notlistening') {
          _completeActive();
        }
      },
    );
    _initializing = future;
    try {
      _initialized = await future;
      return _initialized;
    } catch (_) {
      _initialized = false;
      return false;
    } finally {
      _initializing = null;
    }
  }

  Future<String> _resolveLocaleId(String languageCode) async {
    try {
      final locales = await _speech.locales();
      final systemLocale = await _speech.systemLocale();
      return bestLocaleId(
        languageCode: languageCode,
        availableLocaleIds: locales.map((locale) => locale.localeId),
        systemLocaleId: systemLocale?.localeId,
      );
    } catch (_) {
      return localeByLanguage[languageCode] ?? localeByLanguage['en']!;
    }
  }

  String? _capturedOrNull() {
    final words = _latestWords.trim();
    return words.isEmpty ? null : words;
  }

  void _completeActive([String? words]) {
    final completer = _activeCompleter;
    if (completer == null || completer.isCompleted) return;
    final clean = words?.trim();
    completer.complete(clean?.isNotEmpty == true ? clean : _capturedOrNull());
  }

  @override
  Future<String?> listenOnce({required String languageCode}) async {
    if (_activeCompleter?.isCompleted == false) {
      await stop();
    }

    final available = await _ensureInitialized();
    if (!available) return null;

    final completer = Completer<String?>();
    _activeCompleter = completer;
    _latestWords = '';

    try {
      final localeId = await _resolveLocaleId(languageCode);
      await _speech.listen(
        listenOptions: SpeechListenOptions(
          localeId: localeId,
          listenFor: const Duration(seconds: 20),
          pauseFor: const Duration(seconds: 3),
          partialResults: true,
          cancelOnError: false,
        ),
        onResult: (result) {
          final words = result.recognizedWords.trim();
          if (words.isNotEmpty) _latestWords = words;
          if (result.finalResult) _completeActive(words);
        },
      );

      return await completer.future.timeout(
        const Duration(seconds: 22),
        onTimeout: _capturedOrNull,
      );
    } catch (_) {
      return _capturedOrNull();
    } finally {
      if (identical(_activeCompleter, completer)) {
        _activeCompleter = null;
      }
      try {
        await _speech.stop();
      } catch (_) {
        // Device/plugin shutdown failures are non-fatal for voice drafting.
      }
    }
  }

  @override
  Future<void> stop() async {
    _completeActive();
    try {
      await _speech.stop();
    } catch (_) {
      // Treat plugin/device stop failures as already stopped.
    }
  }
}

class SilentResidentSpeech implements ResidentSpeech {
  const SilentResidentSpeech();
  @override
  Future<String?> listenOnce({required String languageCode}) async => null;
  @override
  Future<void> stop() async {}
}

/// Small, safety-critical voice-draft vocabulary. Speech only fills a draft
/// for a complaint or Assistant query; it never submits, pays, or approves an operation.
class ResidentVoiceCopy {
  static const languageLabels = <String, String>{
    'en': 'English',
    'hi': 'हिंदी',
    'ta': 'தமிழ்',
    'te': 'తెలుగు',
    'kn': 'ಕನ್ನಡ',
    'ml': 'മലയാളം',
    'mr': 'मराठी',
    'bn': 'বাংলা',
  };

  static String languageLabel(String languageCode) =>
      languageLabels[languageCode] ?? languageLabels['en']!;

  static String text(String languageCode, String key) =>
      (_copy[languageCode] ?? _copy['en']!)[key] ?? _copy['en']![key] ?? key;

  static const _copy = <String, Map<String, String>>{
    'en': {
      'action': 'Speak',
      'listening': 'Listening… describe the issue.',
      'review': 'Got it. Review the text before submitting.',
      'unavailable': 'I could not hear you. Check microphone access and try again, or type instead.',
      'assistantAction': 'Speak',
      'assistantListening': 'Listening…',
      'assistantReview': 'Got it. Review your question, then tap Ask.',
      'assistantUnavailable': 'I could not hear you. Check microphone access and try again, or type your question.',
    },
    'hi': {
      'action': 'बोलें',
      'listening': 'सुन रहा हूँ… समस्या बताइए।',
      'review': 'समझ गया। भेजने से पहले लिखे हुए विवरण को जाँच लें।',
      'unavailable': 'आवाज़ सुनाई नहीं दी। माइक्रोफ़ोन अनुमति जाँचें और फिर कोशिश करें, या टाइप करें।',
      'assistantAction': 'बोलें',
      'assistantListening': 'सुन रहा हूँ…',
      'assistantReview': 'समझ गया। प्रश्न जाँचें, फिर पूछें पर टैप करें।',
      'assistantUnavailable': 'आवाज़ सुनाई नहीं दी। माइक्रोफ़ोन अनुमति जाँचें और फिर कोशिश करें, या प्रश्न टाइप करें।',
    },
    'ta': {
      'action': 'பேசுங்கள்',
      'listening': 'கேட்கிறேன்… பிரச்சினையைச் சொல்லுங்கள்.',
      'review': 'புரிந்தது. அனுப்பும் முன் உரையை சரிபார்க்கவும்.',
      'unavailable': 'உங்கள் குரல் கேட்கவில்லை. மைக்ரோஃபோன் அனுமதியை சரிபார்த்து மீண்டும் முயற்சிக்கவும் அல்லது தட்டச்சு செய்யவும்.',
      'assistantAction': 'பேசுங்கள்',
      'assistantListening': 'கேட்கிறேன்…',
      'assistantReview': 'புரிந்தது. கேள்வியை சரிபார்த்து, பிறகு கேள் என்பதைத் தட்டவும்.',
      'assistantUnavailable': 'உங்கள் குரல் கேட்கவில்லை. மைக்ரோஃபோன் அனுமதியை சரிபார்த்து மீண்டும் முயற்சிக்கவும் அல்லது கேள்வியை தட்டச்சு செய்யவும்.',
    },
    'te': {
      'action': 'మాట్లాడండి',
      'listening': 'వింటున్నాను… సమస్యను చెప్పండి.',
      'review': 'అర్థమైంది. పంపే ముందు వచనాన్ని పరిశీలించండి.',
      'unavailable': 'మీ మాట వినిపించలేదు. మైక్రోఫోన్ అనుమతిని చూసి మళ్లీ ప్రయత్నించండి లేదా టైప్ చేయండి.',
      'assistantAction': 'మాట్లాడండి',
      'assistantListening': 'వింటున్నాను…',
      'assistantReview': 'అర్థమైంది. ప్రశ్నను పరిశీలించి, తరువాత అడుగు నొక్కండి.',
      'assistantUnavailable': 'మీ మాట వినిపించలేదు. మైక్రోఫోన్ అనుమతిని చూసి మళ్లీ ప్రయత్నించండి లేదా ప్రశ్నను టైప్ చేయండి.',
    },
    'kn': {
      'action': 'ಮಾತನಾಡಿ',
      'listening': 'ಕೇಳುತ್ತಿದ್ದೇನೆ… ಸಮಸ್ಯೆಯನ್ನು ಹೇಳಿ.',
      'review': 'ಅರ್ಥವಾಯಿತು. ಕಳುಹಿಸುವ ಮೊದಲು ಪಠ್ಯವನ್ನು ಪರಿಶೀಲಿಸಿ.',
      'unavailable': 'ನಿಮ್ಮ ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಟೈಪ್ ಮಾಡಿ.',
      'assistantAction': 'ಮಾತನಾಡಿ',
      'assistantListening': 'ಕೇಳುತ್ತಿದ್ದೇನೆ…',
      'assistantReview': 'ಅರ್ಥವಾಯಿತು. ಪ್ರಶ್ನೆಯನ್ನು ಪರಿಶೀಲಿಸಿ, ನಂತರ ಕೇಳಿ ಒತ್ತಿರಿ.',
      'assistantUnavailable': 'ನಿಮ್ಮ ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ ಪ್ರಶ್ನೆಯನ್ನು ಟೈಪ್ ಮಾಡಿ.',
    },
    'ml': {
      'action': 'പറയൂ',
      'listening': 'കേൾക്കുന്നു… പ്രശ്നം പറയൂ.',
      'review': 'മനസ്സിലായി. അയയ്ക്കുന്നതിന് മുമ്പ് വാചകം പരിശോധിക്കുക.',
      'unavailable': 'നിങ്ങളുടെ ശബ്ദം കേൾക്കാനായില്ല. മൈക്രോഫോൺ അനുമതി പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കൂ, അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യൂ.',
      'assistantAction': 'പറയൂ',
      'assistantListening': 'കേൾക്കുന്നു…',
      'assistantReview': 'മനസ്സിലായി. ചോദ്യം പരിശോധിച്ച് ശേഷം ചോദിക്കുക അമർത്തൂ.',
      'assistantUnavailable': 'നിങ്ങളുടെ ശബ്ദം കേൾക്കാനായില്ല. മൈക്രോഫോൺ അനുമതി പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കൂ, അല്ലെങ്കിൽ ചോദ്യം ടൈപ്പ് ചെയ്യൂ.',
    },
    'mr': {
      'action': 'बोला',
      'listening': 'ऐकत आहे… समस्या सांगा.',
      'review': 'समजले. पाठवण्यापूर्वी मजकूर तपासा.',
      'unavailable': 'तुमचा आवाज ऐकू आला नाही. मायक्रोफोन परवानगी तपासा आणि पुन्हा प्रयत्न करा किंवा टाइप करा.',
      'assistantAction': 'बोला',
      'assistantListening': 'ऐकत आहे…',
      'assistantReview': 'समजले. प्रश्न तपासा आणि नंतर विचारा वर टॅप करा.',
      'assistantUnavailable': 'तुमचा आवाज ऐकू आला नाही. मायक्रोफोन परवानगी तपासा आणि पुन्हा प्रयत्न करा किंवा प्रश्न टाइप करा.',
    },
    'bn': {
      'action': 'বলুন',
      'listening': 'শুনছি… সমস্যাটি বলুন।',
      'review': 'বুঝেছি। পাঠানোর আগে লেখাটি দেখে নিন।',
      'unavailable': 'আপনার কথা শোনা যায়নি। মাইক্রোফোন অনুমতি দেখে আবার চেষ্টা করুন, অথবা টাইপ করুন।',
      'assistantAction': 'বলুন',
      'assistantListening': 'শুনছি…',
      'assistantReview': 'বুঝেছি। প্রশ্নটি দেখে তারপর জিজ্ঞাসা করুন চাপুন।',
      'assistantUnavailable': 'আপনার কথা শোনা যায়নি। মাইক্রোফোন অনুমতি দেখে আবার চেষ্টা করুন, অথবা প্রশ্নটি টাইপ করুন।',
    },
  };
}
