import 'dart:async';

import 'package:speech_to_text/speech_to_text.dart';

abstract class ResidentSpeech {
  Future<String?> listenOnce({required String languageCode});
  Future<void> stop();
}

class DeviceResidentSpeech implements ResidentSpeech {
  DeviceResidentSpeech({SpeechToText? speech}) : _speech = speech ?? SpeechToText();

  final SpeechToText _speech;

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

  @override
  Future<String?> listenOnce({required String languageCode}) async {
    final completer = Completer<String?>();
    final available = await _speech.initialize(
      onError: (_) {
        if (!completer.isCompleted) completer.complete(null);
      },
    );
    if (!available) return null;
    try {
      await _speech.listen(
        listenOptions: SpeechListenOptions(
          localeId: localeByLanguage[languageCode] ?? 'en_IN',
          listenFor: const Duration(seconds: 15),
          pauseFor: const Duration(seconds: 2),
          partialResults: false,
          cancelOnError: true,
        ),
        onResult: (result) {
          if (!result.finalResult || completer.isCompleted) return;
          final words = result.recognizedWords.trim();
          completer.complete(words.isEmpty ? null : words);
        },
      );
      return await completer.future.timeout(const Duration(seconds: 17), onTimeout: () => null);
    } finally {
      await _speech.stop();
    }
  }

  @override
  Future<void> stop() => _speech.stop();
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
  static String text(String languageCode, String key) =>
      (_copy[languageCode] ?? _copy['en']!)[key] ?? _copy['en']![key] ?? key;

  static const _copy = <String, Map<String, String>>{
    'en': {
      'action': 'Describe by voice',
      'listening': 'Listening… describe the issue in your own words.',
      'review': 'Voice captured. Review the draft before submitting.',
      'unavailable': 'Voice input was not available. Continue by typing.',
      'assistantAction': 'Ask by voice',
      'assistantListening': 'Listening… ask about dues, gate, staff, services or society updates.',
      'assistantReview': 'Voice captured. Review the question before asking.',
      'assistantUnavailable': 'Voice input was not available. Continue by typing.',
    },
    'hi': {
      'action': 'आवाज़ से बताएं',
      'listening': 'सुन रहा है… समस्या अपने शब्दों में बताएं।',
      'review': 'आवाज़ दर्ज हुई। भेजने से पहले मसौदा जांचें।',
      'unavailable': 'आवाज़ इनपुट उपलब्ध नहीं है। टाइप करके जारी रखें।',
      'assistantAction': 'आवाज़ से पूछें',
      'assistantListening': 'सुन रहा है… बकाया, गेट, स्टाफ, सेवाओं या सोसायटी अपडेट के बारे में पूछें।',
      'assistantReview': 'आवाज़ दर्ज हुई। पूछने से पहले प्रश्न जांचें।',
      'assistantUnavailable': 'आवाज़ इनपुट उपलब्ध नहीं है। टाइप करके जारी रखें।',
    },
    'ta': {
      'action': 'குரலில் சொல்லுங்கள்',
      'listening': 'கேட்கிறது… பிரச்சினையை உங்கள் சொற்களில் சொல்லுங்கள்.',
      'review': 'குரல் பதிவு செய்யப்பட்டது. அனுப்பும் முன் வரைவை சரிபார்க்கவும்.',
      'unavailable': 'குரல் உள்ளீடு கிடைக்கவில்லை. தட்டச்சு செய்து தொடரவும்.',
      'assistantAction': 'குரலில் கேளுங்கள்',
      'assistantListening': 'கேட்கிறது… நிலுவை, கேட், பணியாளர், சேவை அல்லது சங்க தகவலைக் கேளுங்கள்.',
      'assistantReview': 'குரல் பதிவு செய்யப்பட்டது. கேட்பதற்கு முன் கேள்வியை சரிபார்க்கவும்.',
      'assistantUnavailable': 'குரல் உள்ளீடு கிடைக்கவில்லை. தட்டச்சு செய்து தொடரவும்.',
    },
    'te': {
      'action': 'వాయిస్‌తో వివరించండి',
      'listening': 'వింటోంది… సమస్యను మీ మాటల్లో చెప్పండి.',
      'review': 'వాయిస్ నమోదు అయింది. పంపే ముందు డ్రాఫ్ట్‌ను చూడండి.',
      'unavailable': 'వాయిస్ ఇన్‌పుట్ అందుబాటులో లేదు. టైప్ చేసి కొనసాగండి.',
      'assistantAction': 'వాయిస్‌తో అడగండి',
      'assistantListening': 'వింటోంది… బకాయిలు, గేట్, సిబ్బంది, సేవలు లేదా సంఘ అప్‌డేట్ల గురించి అడగండి.',
      'assistantReview': 'వాయిస్ నమోదు అయింది. అడిగే ముందు ప్రశ్నను చూడండి.',
      'assistantUnavailable': 'వాయిస్ ఇన్‌పుట్ అందుబాటులో లేదు. టైప్ చేసి కొనసాగండి.',
    },
    'kn': {
      'action': 'ಧ್ವನಿಯಲ್ಲಿ ವಿವರಿಸಿ',
      'listening': 'ಕೇಳುತ್ತಿದೆ… ಸಮಸ್ಯೆಯನ್ನು ನಿಮ್ಮ ಮಾತಿನಲ್ಲಿ ಹೇಳಿ.',
      'review': 'ಧ್ವನಿ ದಾಖಲಾಗಿದೆ. ಕಳುಹಿಸುವ ಮೊದಲು ಕರಡನ್ನು ಪರಿಶೀಲಿಸಿ.',
      'unavailable': 'ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಲಭ್ಯವಿಲ್ಲ. ಟೈಪ್ ಮಾಡಿ ಮುಂದುವರಿಯಿರಿ.',
      'assistantAction': 'ಧ್ವನಿಯಲ್ಲಿ ಕೇಳಿ',
      'assistantListening': 'ಕೇಳುತ್ತಿದೆ… ಬಾಕಿ, ಗೇಟ್, ಸಿಬ್ಬಂದಿ, ಸೇವೆಗಳು ಅಥವಾ ಸಂಘದ ಮಾಹಿತಿಯನ್ನು ಕೇಳಿ.',
      'assistantReview': 'ಧ್ವನಿ ದಾಖಲಾಗಿದೆ. ಕೇಳುವ ಮೊದಲು ಪ್ರಶ್ನೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.',
      'assistantUnavailable': 'ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಲಭ್ಯವಿಲ್ಲ. ಟೈಪ್ ಮಾಡಿ ಮುಂದುವರಿಯಿರಿ.',
    },
    'ml': {
      'action': 'ശബ്ദത്തിൽ വിവരിക്കുക',
      'listening': 'കേൾക്കുന്നു… പ്രശ്നം നിങ്ങളുടെ വാക്കുകളിൽ പറയുക.',
      'review': 'ശബ്ദം രേഖപ്പെടുത്തി. അയയ്ക്കുന്നതിന് മുമ്പ് ഡ്രാഫ്റ്റ് പരിശോധിക്കുക.',
      'unavailable': 'ശബ്ദ ഇൻപുട്ട് ലഭ്യമല്ല. ടൈപ്പ് ചെയ്ത് തുടരുക.',
      'assistantAction': 'ശബ്ദത്തിൽ ചോദിക്കുക',
      'assistantListening': 'കേൾക്കുന്നു… കുടിശ്ശിക, ഗേറ്റ്, സ്റ്റാഫ്, സേവനങ്ങൾ അല്ലെങ്കിൽ സൊസൈറ്റി അപ്‌ഡേറ്റുകൾ ചോദിക്കുക.',
      'assistantReview': 'ശബ്ദം രേഖപ്പെടുത്തി. ചോദിക്കുന്നതിന് മുമ്പ് ചോദ്യം പരിശോധിക്കുക.',
      'assistantUnavailable': 'ശബ്ദ ഇൻപുട്ട് ലഭ്യമല്ല. ടൈപ്പ് ചെയ്ത് തുടരുക.',
    },
    'mr': {
      'action': 'आवाजात सांगा',
      'listening': 'ऐकत आहे… समस्या तुमच्या शब्दांत सांगा.',
      'review': 'आवाज नोंदवला. पाठवण्यापूर्वी मसुदा तपासा.',
      'unavailable': 'आवाज इनपुट उपलब्ध नाही. टाइप करून पुढे जा.',
      'assistantAction': 'आवाजात विचारा',
      'assistantListening': 'ऐकत आहे… थकबाकी, गेट, कर्मचारी, सेवा किंवा सोसायटी अपडेटबद्दल विचारा.',
      'assistantReview': 'आवाज नोंदवला. विचारण्यापूर्वी प्रश्न तपासा.',
      'assistantUnavailable': 'आवाज इनपुट उपलब्ध नाही. टाइप करून पुढे जा.',
    },
    'bn': {
      'action': 'কণ্ঠে বলুন',
      'listening': 'শুনছি… সমস্যাটি নিজের ভাষায় বলুন।',
      'review': 'কণ্ঠ ধরা হয়েছে। পাঠানোর আগে খসড়া দেখুন।',
      'unavailable': 'ভয়েস ইনপুট পাওয়া যায়নি। টাইপ করে চালিয়ে যান।',
      'assistantAction': 'কণ্ঠে জিজ্ঞাসা করুন',
      'assistantListening': 'শুনছি… বকেয়া, গেট, কর্মী, পরিষেবা বা সোসাইটি আপডেট সম্পর্কে জিজ্ঞাসা করুন।',
      'assistantReview': 'কণ্ঠ ধরা হয়েছে। জিজ্ঞাসার আগে প্রশ্নটি দেখুন।',
      'assistantUnavailable': 'ভয়েস ইনপুট পাওয়া যায়নি। টাইপ করে চালিয়ে যান।',
    },
  };
}
