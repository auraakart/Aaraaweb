import 'dart:ui';

/// Lightweight high-frequency-flow localization used before broader ARB rollout.
/// Falls back to English for unsupported locales and missing keys.
class AaraagateStrings {
  AaraagateStrings._(this.languageCode);

  final String languageCode;

  static const supportedLanguageCodes = <String>{'en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn'};

  static AaraagateStrings device() {
    final code = PlatformDispatcher.instance.locale.languageCode.toLowerCase();
    return AaraagateStrings._(supportedLanguageCodes.contains(code) ? code : 'en');
  }

  String text(String key) => (_values[languageCode]?[key] ?? _values['en']![key] ?? key);

  String format(String key, Map<String, Object?> values) {
    var value = text(key);
    for (final entry in values.entries) {
      value = value.replaceAll('{${entry.key}}', '${entry.value ?? ''}');
    }
    return value;
  }

  static const _values = <String, Map<String, String>>{
    'en': {
      'gateTitle': 'Gate & access',
      'gateSubtitle': 'Approve arrivals and create visitor passes.',
      'inviteGuest': 'Invite guest',
      'needsAttention': 'Needs your attention',
      'recentActivity': 'Recent activity',
      'invite': 'Invite',
      'loadingActivity': 'Loading access activity…',
      'loadFailed': 'Could not load access activity.',
      'retry': 'Retry',
      'emptyActivity': 'No gate activity yet. Create a visitor pass when you need one.',
      'waiting': 'Waiting',
      'inside': 'Inside',
      'today': 'Today',
      'deny': 'Deny',
      'allow': 'Allow',
      'allowEntry': 'Allow entry',
      'cancelPass': 'Cancel pass',
      'visitorPassReady': 'Visitor pass ready',
      'sharePass': 'Share pass',
      'copyCredential': 'Copy credential',
      'passCopied': 'Pass copied',
      'inviteTitle': 'Invite a guest',
      'inviteSubtitle': 'Create a secure pass you can share instantly.',
      'guestName': 'Guest name',
      'guestNameError': 'Enter the guest name',
      'phoneOptional': 'Phone (optional)',
      'purposeOptional': 'Purpose (optional)',
      'createPass': 'Create visitor pass',
      'approvalRequired': 'Approval required',
      'allow15': 'Allow for the next 15 minutes',
      'allow30': 'Allow for the next 30 minutes',
      'visitor': 'Visitor',
      'entry': 'Entry',
      'cab': 'Cab',
      'delivery': 'Delivery',
      'approvedSecurity': '{label} approved. Security has been updated.',
      'validUntil': 'Valid until {time}',
      'visitorQr': 'Visitor access QR code',
    },
    'hi': {
      'gateTitle': 'गेट और प्रवेश', 'gateSubtitle': 'आगमन स्वीकृत करें और विज़िटर पास बनाएं.', 'inviteGuest': 'मेहमान बुलाएँ', 'needsAttention': 'आपकी स्वीकृति चाहिए', 'recentActivity': 'हाल की गतिविधि', 'invite': 'बुलाएँ', 'loadingActivity': 'प्रवेश गतिविधि लोड हो रही है…', 'loadFailed': 'प्रवेश गतिविधि लोड नहीं हो सकी.', 'retry': 'फिर प्रयास करें', 'emptyActivity': 'अभी कोई गेट गतिविधि नहीं है. जरूरत पर विज़िटर पास बनाएं.', 'waiting': 'प्रतीक्षा', 'inside': 'अंदर', 'today': 'आज', 'deny': 'अस्वीकार', 'allow': 'अनुमति दें', 'allowEntry': 'प्रवेश दें', 'cancelPass': 'पास रद्द करें', 'visitorPassReady': 'विज़िटर पास तैयार है', 'sharePass': 'पास साझा करें', 'copyCredential': 'कोड कॉपी करें', 'passCopied': 'पास कॉपी हुआ', 'inviteTitle': 'मेहमान बुलाएँ', 'inviteSubtitle': 'तुरंत साझा करने योग्य सुरक्षित पास बनाएं.', 'guestName': 'मेहमान का नाम', 'guestNameError': 'मेहमान का नाम दर्ज करें', 'phoneOptional': 'फोन (वैकल्पिक)', 'purposeOptional': 'उद्देश्य (वैकल्पिक)', 'createPass': 'विज़िटर पास बनाएं', 'approvalRequired': 'स्वीकृति आवश्यक', 'allow15': 'अगले 15 मिनट के लिए अनुमति दें', 'allow30': 'अगले 30 मिनट के लिए अनुमति दें', 'visitor': 'विज़िटर', 'entry': 'प्रवेश', 'cab': 'कैब', 'delivery': 'डिलीवरी', 'approvedSecurity': '{label} स्वीकृत. सुरक्षा को अपडेट कर दिया गया है.', 'validUntil': '{time} तक मान्य', 'visitorQr': 'विज़िटर प्रवेश QR कोड',
    },
    'ta': {
      'gateTitle': 'கேட் மற்றும் அணுகல்', 'gateSubtitle': 'வருகைகளை அனுமதித்து விருந்தினர் பாஸ் உருவாக்கவும்.', 'inviteGuest': 'விருந்தினரை அழைக்கவும்', 'needsAttention': 'உங்கள் அனுமதி தேவை', 'recentActivity': 'சமீபத்திய செயல்பாடு', 'invite': 'அழைக்கவும்', 'loadingActivity': 'அணுகல் செயல்பாடு ஏற்றப்படுகிறது…', 'loadFailed': 'அணுகல் செயல்பாட்டை ஏற்ற முடியவில்லை.', 'retry': 'மீண்டும் முயற்சி', 'emptyActivity': 'இதுவரை கேட் செயல்பாடு இல்லை. தேவையெனில் விருந்தினர் பாஸ் உருவாக்கவும்.', 'waiting': 'காத்திருப்பு', 'inside': 'உள்ளே', 'today': 'இன்று', 'deny': 'மறுக்கவும்', 'allow': 'அனுமதி', 'allowEntry': 'நுழைய அனுமதி', 'cancelPass': 'பாஸ் ரத்து', 'visitorPassReady': 'விருந்தினர் பாஸ் தயாராக உள்ளது', 'sharePass': 'பாஸ் பகிரவும்', 'copyCredential': 'குறியீட்டை நகலெடுக்கவும்', 'passCopied': 'பாஸ் நகலெடுக்கப்பட்டது', 'inviteTitle': 'விருந்தினரை அழைக்கவும்', 'inviteSubtitle': 'உடனே பகிரக்கூடிய பாதுகாப்பான பாஸ் உருவாக்கவும்.', 'guestName': 'விருந்தினர் பெயர்', 'guestNameError': 'விருந்தினர் பெயரை உள்ளிடவும்', 'phoneOptional': 'தொலைபேசி (விருப்பம்)', 'purposeOptional': 'நோக்கம் (விருப்பம்)', 'createPass': 'விருந்தினர் பாஸ் உருவாக்கவும்', 'approvalRequired': 'அனுமதி தேவை', 'allow15': 'அடுத்த 15 நிமிடங்களுக்கு அனுமதி', 'allow30': 'அடுத்த 30 நிமிடங்களுக்கு அனுமதி', 'visitor': 'விருந்தினர்', 'entry': 'நுழைவு', 'cab': 'கேப்', 'delivery': 'டெலிவரி', 'approvedSecurity': '{label} அனுமதிக்கப்பட்டது. பாதுகாப்பு குழு புதுப்பிக்கப்பட்டது.', 'validUntil': '{time} வரை செல்லுபடியாகும்', 'visitorQr': 'விருந்தினர் நுழைவு QR குறியீடு',
    },
    'te': {
      'gateTitle': 'గేట్ & ప్రవేశం', 'gateSubtitle': 'రాకలను అనుమతించి విజిటర్ పాస్ రూపొందించండి.', 'inviteGuest': 'అతిథిని ఆహ్వానించండి', 'needsAttention': 'మీ అనుమతి అవసరం', 'recentActivity': 'ఇటీవలి కార్యకలాపం', 'invite': 'ఆహ్వానించండి', 'loadingActivity': 'ప్రవేశ కార్యకలాపం లోడ్ అవుతోంది…', 'loadFailed': 'ప్రవేశ కార్యకలాపం లోడ్ కాలేదు.', 'retry': 'మళ్లీ ప్రయత్నించండి', 'emptyActivity': 'ఇంకా గేట్ కార్యకలాపం లేదు. అవసరమైనప్పుడు విజిటర్ పాస్ రూపొందించండి.', 'waiting': 'వేచి ఉంది', 'inside': 'లోపల', 'today': 'ఈ రోజు', 'deny': 'తిరస్కరించండి', 'allow': 'అనుమతించండి', 'allowEntry': 'ప్రవేశం అనుమతించండి', 'cancelPass': 'పాస్ రద్దు', 'visitorPassReady': 'విజిటర్ పాస్ సిద్ధంగా ఉంది', 'sharePass': 'పాస్ షేర్ చేయండి', 'copyCredential': 'కోడ్ కాపీ చేయండి', 'passCopied': 'పాస్ కాపీ అయ్యింది', 'inviteTitle': 'అతిథిని ఆహ్వానించండి', 'inviteSubtitle': 'తక్షణం పంచుకోగల సురక్షిత పాస్ రూపొందించండి.', 'guestName': 'అతిథి పేరు', 'guestNameError': 'అతిథి పేరు నమోదు చేయండి', 'phoneOptional': 'ఫోన్ (ఐచ్చికం)', 'purposeOptional': 'ఉద్దేశ్యం (ఐచ్చికం)', 'createPass': 'విజిటర్ పాస్ రూపొందించండి', 'approvalRequired': 'అనుమతి అవసరం', 'allow15': 'తదుపరి 15 నిమిషాలకు అనుమతి', 'allow30': 'తదుపరి 30 నిమిషాలకు అనుమతి', 'visitor': 'విజిటర్', 'entry': 'ప్రవేశం', 'cab': 'క్యాబ్', 'delivery': 'డెలివరీ', 'approvedSecurity': '{label} అనుమతించబడింది. సెక్యూరిటీకి నవీకరణ పంపబడింది.', 'validUntil': '{time} వరకు చెల్లుతుంది', 'visitorQr': 'విజిటర్ ప్రవేశ QR కోడ్',
    },
    'kn': {
      'gateTitle': 'ಗೇಟ್ ಮತ್ತು ಪ್ರವೇಶ', 'gateSubtitle': 'ಆಗಮನಗಳನ್ನು ಅನುಮೋದಿಸಿ ಮತ್ತು ವಿಸಿಟರ್ ಪಾಸ್ ರಚಿಸಿ.', 'inviteGuest': 'ಅತಿಥಿಯನ್ನು ಆಹ್ವಾನಿಸಿ', 'needsAttention': 'ನಿಮ್ಮ ಅನುಮತಿ ಬೇಕು', 'recentActivity': 'ಇತ್ತೀಚಿನ ಚಟುವಟಿಕೆ', 'invite': 'ಆಹ್ವಾನಿಸಿ', 'loadingActivity': 'ಪ್ರವೇಶ ಚಟುವಟಿಕೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ…', 'loadFailed': 'ಪ್ರವೇಶ ಚಟುವಟಿಕೆ ಲೋಡ್ ಆಗಲಿಲ್ಲ.', 'retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', 'emptyActivity': 'ಇನ್ನೂ ಗೇಟ್ ಚಟುವಟಿಕೆ ಇಲ್ಲ. ಬೇಕಾದಾಗ ವಿಸಿಟರ್ ಪಾಸ್ ರಚಿಸಿ.', 'waiting': 'ಕಾಯುತ್ತಿದೆ', 'inside': 'ಒಳಗೆ', 'today': 'ಇಂದು', 'deny': 'ನಿರಾಕರಿಸಿ', 'allow': 'ಅನುಮತಿಸಿ', 'allowEntry': 'ಪ್ರವೇಶ ಅನುಮತಿಸಿ', 'cancelPass': 'ಪಾಸ್ ರದ್ದು', 'visitorPassReady': 'ವಿಸಿಟರ್ ಪಾಸ್ ಸಿದ್ಧವಾಗಿದೆ', 'sharePass': 'ಪಾಸ್ ಹಂಚಿಕೊಳ್ಳಿ', 'copyCredential': 'ಕೋಡ್ ನಕಲಿಸಿ', 'passCopied': 'ಪಾಸ್ ನಕಲಿಸಲಾಗಿದೆ', 'inviteTitle': 'ಅತಿಥಿಯನ್ನು ಆಹ್ವಾನಿಸಿ', 'inviteSubtitle': 'ತಕ್ಷಣ ಹಂಚಬಹುದಾದ ಸುರಕ್ಷಿತ ಪಾಸ್ ರಚಿಸಿ.', 'guestName': 'ಅತಿಥಿ ಹೆಸರು', 'guestNameError': 'ಅತಿಥಿ ಹೆಸರನ್ನು ನಮೂದಿಸಿ', 'phoneOptional': 'ಫೋನ್ (ಐಚ್ಛಿಕ)', 'purposeOptional': 'ಉದ್ದೇಶ (ಐಚ್ಛಿಕ)', 'createPass': 'ವಿಸಿಟರ್ ಪಾಸ್ ರಚಿಸಿ', 'approvalRequired': 'ಅನುಮತಿ ಅಗತ್ಯ', 'allow15': 'ಮುಂದಿನ 15 ನಿಮಿಷಗಳಿಗೆ ಅನುಮತಿ', 'allow30': 'ಮುಂದಿನ 30 ನಿಮಿಷಗಳಿಗೆ ಅನುಮತಿ', 'visitor': 'ವಿಸಿಟರ್', 'entry': 'ಪ್ರವೇಶ', 'cab': 'ಕ್ಯಾಬ್', 'delivery': 'ಡೆಲಿವರಿ', 'approvedSecurity': '{label} ಅನುಮೋದಿಸಲಾಗಿದೆ. ಭದ್ರತಾ ತಂಡಕ್ಕೆ ಮಾಹಿತಿ ನೀಡಲಾಗಿದೆ.', 'validUntil': '{time} ವರೆಗೆ ಮಾನ್ಯ', 'visitorQr': 'ವಿಸಿಟರ್ ಪ್ರವೇಶ QR ಕೋಡ್',
    },
    'ml': {
      'gateTitle': 'ഗേറ്റ് & പ്രവേശനം', 'gateSubtitle': 'വരവുകൾ അനുവദിച്ച് വിസിറ്റർ പാസ് സൃഷ്ടിക്കുക.', 'inviteGuest': 'അതിഥിയെ ക്ഷണിക്കുക', 'needsAttention': 'നിങ്ങളുടെ അനുമതി വേണം', 'recentActivity': 'സമീപകാല പ്രവർത്തനം', 'invite': 'ക്ഷണിക്കുക', 'loadingActivity': 'പ്രവേശന പ്രവർത്തനം ലോഡ് ചെയ്യുന്നു…', 'loadFailed': 'പ്രവേശന പ്രവർത്തനം ലോഡ് ചെയ്യാനായില്ല.', 'retry': 'വീണ്ടും ശ്രമിക്കുക', 'emptyActivity': 'ഇതുവരെ ഗേറ്റ് പ്രവർത്തനം ഇല്ല. ആവശ്യമായപ്പോൾ വിസിറ്റർ പാസ് സൃഷ്ടിക്കുക.', 'waiting': 'കാത്തിരിക്കുന്നു', 'inside': 'അകത്ത്', 'today': 'ഇന്ന്', 'deny': 'നിരസിക്കുക', 'allow': 'അനുവദിക്കുക', 'allowEntry': 'പ്രവേശനം അനുവദിക്കുക', 'cancelPass': 'പാസ് റദ്ദാക്കുക', 'visitorPassReady': 'വിസിറ്റർ പാസ് തയ്യാറാണ്', 'sharePass': 'പാസ് പങ്കിടുക', 'copyCredential': 'കോഡ് പകർത്തുക', 'passCopied': 'പാസ് പകർത്തി', 'inviteTitle': 'അതിഥിയെ ക്ഷണിക്കുക', 'inviteSubtitle': 'ഉടൻ പങ്കിടാവുന്ന സുരക്ഷിത പാസ് സൃഷ്ടിക്കുക.', 'guestName': 'അതിഥിയുടെ പേര്', 'guestNameError': 'അതിഥിയുടെ പേര് നൽകുക', 'phoneOptional': 'ഫോൺ (ഐച്ഛികം)', 'purposeOptional': 'ഉദ്ദേശ്യം (ഐച്ഛികം)', 'createPass': 'വിസിറ്റർ പാസ് സൃഷ്ടിക്കുക', 'approvalRequired': 'അനുമതി ആവശ്യമാണ്', 'allow15': 'അടുത്ത 15 മിനിറ്റിന് അനുവദിക്കുക', 'allow30': 'അടുത്ത 30 മിനിറ്റിന് അനുവദിക്കുക', 'visitor': 'വിസിറ്റർ', 'entry': 'പ്രവേശനം', 'cab': 'കാബ്', 'delivery': 'ഡെലിവറി', 'approvedSecurity': '{label} അനുവദിച്ചു. സുരക്ഷാ വിഭാഗത്തെ പുതുക്കി.', 'validUntil': '{time} വരെ സാധുവാണ്', 'visitorQr': 'വിസിറ്റർ പ്രവേശന QR കോഡ്',
    },
    'mr': {
      'gateTitle': 'गेट आणि प्रवेश', 'gateSubtitle': 'येणाऱ्यांना मंजुरी द्या आणि व्हिजिटर पास तयार करा.', 'inviteGuest': 'पाहुण्याला बोलवा', 'needsAttention': 'तुमची मंजुरी आवश्यक', 'recentActivity': 'अलीकडील हालचाल', 'invite': 'बोलवा', 'loadingActivity': 'प्रवेश हालचाल लोड होत आहे…', 'loadFailed': 'प्रवेश हालचाल लोड झाली नाही.', 'retry': 'पुन्हा प्रयत्न करा', 'emptyActivity': 'अजून गेट हालचाल नाही. गरज असेल तेव्हा व्हिजिटर पास तयार करा.', 'waiting': 'प्रतीक्षा', 'inside': 'आत', 'today': 'आज', 'deny': 'नकार द्या', 'allow': 'परवानगी द्या', 'allowEntry': 'प्रवेश द्या', 'cancelPass': 'पास रद्द करा', 'visitorPassReady': 'व्हिजिटर पास तयार आहे', 'sharePass': 'पास शेअर करा', 'copyCredential': 'कोड कॉपी करा', 'passCopied': 'पास कॉपी झाला', 'inviteTitle': 'पाहुण्याला बोलवा', 'inviteSubtitle': 'ताबडतोब शेअर करता येईल असा सुरक्षित पास तयार करा.', 'guestName': 'पाहुण्याचे नाव', 'guestNameError': 'पाहुण्याचे नाव भरा', 'phoneOptional': 'फोन (ऐच्छिक)', 'purposeOptional': 'उद्देश (ऐच्छिक)', 'createPass': 'व्हिजिटर पास तयार करा', 'approvalRequired': 'मंजुरी आवश्यक', 'allow15': 'पुढील 15 मिनिटांसाठी परवानगी', 'allow30': 'पुढील 30 मिनिटांसाठी परवानगी', 'visitor': 'व्हिजिटर', 'entry': 'प्रवेश', 'cab': 'कॅब', 'delivery': 'डिलिव्हरी', 'approvedSecurity': '{label} मंजूर. सुरक्षा विभागाला कळवले आहे.', 'validUntil': '{time} पर्यंत वैध', 'visitorQr': 'व्हिजिटर प्रवेश QR कोड',
    },
    'bn': {
      'gateTitle': 'গেট ও প্রবেশ', 'gateSubtitle': 'আগমন অনুমোদন করুন এবং ভিজিটর পাস তৈরি করুন।', 'inviteGuest': 'অতিথিকে আমন্ত্রণ', 'needsAttention': 'আপনার অনুমোদন প্রয়োজন', 'recentActivity': 'সাম্প্রতিক কার্যক্রম', 'invite': 'আমন্ত্রণ', 'loadingActivity': 'প্রবেশ কার্যক্রম লোড হচ্ছে…', 'loadFailed': 'প্রবেশ কার্যক্রম লোড করা যায়নি।', 'retry': 'আবার চেষ্টা করুন', 'emptyActivity': 'এখনও কোনো গেট কার্যক্রম নেই। প্রয়োজন হলে ভিজিটর পাস তৈরি করুন।', 'waiting': 'অপেক্ষা', 'inside': 'ভিতরে', 'today': 'আজ', 'deny': 'প্রত্যাখ্যান', 'allow': 'অনুমতি দিন', 'allowEntry': 'প্রবেশ অনুমতি', 'cancelPass': 'পাস বাতিল', 'visitorPassReady': 'ভিজিটর পাস প্রস্তুত', 'sharePass': 'পাস শেয়ার', 'copyCredential': 'কোড কপি', 'passCopied': 'পাস কপি হয়েছে', 'inviteTitle': 'অতিথিকে আমন্ত্রণ', 'inviteSubtitle': 'তাৎক্ষণিকভাবে শেয়ারযোগ্য নিরাপদ পাস তৈরি করুন।', 'guestName': 'অতিথির নাম', 'guestNameError': 'অতিথির নাম লিখুন', 'phoneOptional': 'ফোন (ঐচ্ছিক)', 'purposeOptional': 'উদ্দেশ্য (ঐচ্ছিক)', 'createPass': 'ভিজিটর পাস তৈরি', 'approvalRequired': 'অনুমোদন প্রয়োজন', 'allow15': 'পরবর্তী ১৫ মিনিটের জন্য অনুমতি', 'allow30': 'পরবর্তী ৩০ মিনিটের জন্য অনুমতি', 'visitor': 'ভিজিটর', 'entry': 'প্রবেশ', 'cab': 'ক্যাব', 'delivery': 'ডেলিভারি', 'approvedSecurity': '{label} অনুমোদিত। নিরাপত্তা বিভাগ আপডেট হয়েছে।', 'validUntil': '{time} পর্যন্ত বৈধ', 'visitorQr': 'ভিজিটর প্রবেশ QR কোড',
    },
  };
}
