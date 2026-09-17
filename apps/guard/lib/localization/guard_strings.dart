class GuardLanguage {
  const GuardLanguage(this.code, this.label, this.nativeLabel);
  final String code;
  final String label;
  final String nativeLabel;
}

const guardLanguages = <GuardLanguage>[
  GuardLanguage('en', 'English', 'English'),
  GuardLanguage('hi', 'Hindi', 'हिन्दी'),
  GuardLanguage('ta', 'Tamil', 'தமிழ்'),
  GuardLanguage('te', 'Telugu', 'తెలుగు'),
  GuardLanguage('kn', 'Kannada', 'ಕನ್ನಡ'),
  GuardLanguage('ml', 'Malayalam', 'മലയാളം'),
  GuardLanguage('mr', 'Marathi', 'मराठी'),
  GuardLanguage('bn', 'Bengali', 'বাংলা'),
];

class GuardStrings {
  const GuardStrings(this.languageCode);
  final String languageCode;
  String get(String key) => _values[languageCode]?[key] ?? _values['en']?[key] ?? key;

  static const _values = <String, Map<String, String>>{
    'en': {
      'tools':'Guard tools','language':'Language','operationsOverview':'Operations overview','activeGate':'Active gate',
      'realtime':'Realtime','connected':'Connected','disconnected':'Disconnected','offlineQueue':'Offline queue','pendingActions':'pending actions',
      'retrySync':'Retry safe sync','unitDirectory':'Unit directory','searchUnit':'Search building or unit','noUnits':'No matching occupied units','ready':'Ready',
      'reviewRequired':'Supervisor review','cachedDirectory':'Offline directory','cachedLookup':'Cached lookup active',
    },
    'hi': {
      'tools':'गार्ड टूल्स','language':'भाषा','operationsOverview':'ऑपरेशन स्थिति','activeGate':'सक्रिय गेट','realtime':'रीयल टाइम','connected':'कनेक्टेड','disconnected':'डिस्कनेक्टेड',
      'offlineQueue':'ऑफलाइन कतार','pendingActions':'लंबित कार्य','retrySync':'सुरक्षित सिंक फिर करें','unitDirectory':'फ्लैट सूची','searchUnit':'बिल्डिंग या फ्लैट खोजें','noUnits':'कोई मिलती इकाई नहीं','ready':'तैयार',
      'reviewRequired':'सुपरवाइज़र समीक्षा','cachedDirectory':'ऑफलाइन डायरेक्टरी','cachedLookup':'कैश खोज सक्रिय',
    },
    'ta': {
      'tools':'காவலர் கருவிகள்','language':'மொழி','operationsOverview':'செயல்பாட்டு நிலை','activeGate':'செயலில் உள்ள வாயில்','realtime':'நேரடி இணைப்பு','connected':'இணைக்கப்பட்டது','disconnected':'இணைப்பு இல்லை',
      'offlineQueue':'ஆஃப்லைன் வரிசை','pendingActions':'நிலுவை செயல்கள்','retrySync':'பாதுகாப்பான ஒத்திசைவை மீண்டும் செய்','unitDirectory':'வீட்டு பட்டியல்','searchUnit':'கட்டிடம் அல்லது வீடு தேடவும்','noUnits':'பொருந்தும் வீடுகள் இல்லை','ready':'தயார்',
      'reviewRequired':'மேற்பார்வையாளர் ஆய்வு','cachedDirectory':'ஆஃப்லைன் பட்டியல்','cachedLookup':'சேமித்த தேடல் செயலில்',
    },
    'te': {
      'tools':'గార్డ్ టూల్స్','language':'భాష','operationsOverview':'ఆపరేషన్ స్థితి','activeGate':'యాక్టివ్ గేట్','realtime':'రియల్ టైమ్','connected':'కనెక్ట్ అయింది','disconnected':'డిస్‌కనెక్ట్ అయింది',
      'offlineQueue':'ఆఫ్‌లైన్ క్యూ','pendingActions':'పెండింగ్ చర్యలు','retrySync':'సురక్షిత సింక్ మళ్లీ చేయండి','unitDirectory':'యూనిట్ జాబితా','searchUnit':'బిల్డింగ్ లేదా యూనిట్ వెతకండి','noUnits':'సరిపోలిన యూనిట్లు లేవు','ready':'సిద్ధం',
      'reviewRequired':'సూపర్‌వైజర్ సమీక్ష','cachedDirectory':'ఆఫ్‌లైన్ డైరెక్టరీ','cachedLookup':'క్యాష్ శోధన సక్రియం',
    },
    'kn': {
      'tools':'ಗಾರ್ಡ್ ಉಪಕರಣಗಳು','language':'ಭಾಷೆ','operationsOverview':'ಕಾರ್ಯಾಚರಣೆ ಸ್ಥಿತಿ','activeGate':'ಸಕ್ರಿಯ ಗೇಟ್','realtime':'ನೇರ ಸಂಪರ್ಕ','connected':'ಸಂಪರ್ಕಿತ','disconnected':'ಸಂಪರ್ಕ ಕಡಿತ',
      'offlineQueue':'ಆಫ್‌ಲೈನ್ ಸರತಿ','pendingActions':'ಬಾಕಿ ಕಾರ್ಯಗಳು','retrySync':'ಸುರಕ್ಷಿತ ಸಿಂಕ್ ಮರುಪ್ರಯತ್ನ','unitDirectory':'ಮನೆಗಳ ಪಟ್ಟಿ','searchUnit':'ಕಟ್ಟಡ ಅಥವಾ ಮನೆ ಹುಡುಕಿ','noUnits':'ಹೊಂದುವ ಮನೆಗಳಿಲ್ಲ','ready':'ಸಿದ್ಧ',
      'reviewRequired':'ಮೇಲ್ವಿಚಾರಕರ ಪರಿಶೀಲನೆ','cachedDirectory':'ಆಫ್‌ಲೈನ್ ಡೈರೆಕ್ಟರಿ','cachedLookup':'ಕ್ಯಾಶ್ ಹುಡುಕಾಟ ಸಕ್ರಿಯ',
    },
    'ml': {
      'tools':'ഗാർഡ് ഉപകരണങ്ങൾ','language':'ഭാഷ','operationsOverview':'പ്രവർത്തന നില','activeGate':'സജീവ ഗേറ്റ്','realtime':'തത്സമയ ബന്ധം','connected':'ബന്ധിപ്പിച്ചു','disconnected':'ബന്ധം നഷ്ടപ്പെട്ടു',
      'offlineQueue':'ഓഫ്‌ലൈൻ ക്യൂ','pendingActions':'ബാക്കി പ്രവർത്തനങ്ങൾ','retrySync':'സുരക്ഷിത സിങ്ക് വീണ്ടും ശ്രമിക്കുക','unitDirectory':'യൂണിറ്റ് പട്ടിക','searchUnit':'ബിൽഡിംഗ് അല്ലെങ്കിൽ യൂണിറ്റ് തിരയുക','noUnits':'പൊരുത്തപ്പെടുന്ന യൂണിറ്റുകളില്ല','ready':'തയ്യാർ',
      'reviewRequired':'സൂപ്പർവൈസർ പരിശോധന','cachedDirectory':'ഓഫ്‌ലൈൻ ഡയറക്ടറി','cachedLookup':'കാഷ് തിരച്ചിൽ സജീവം',
    },
    'mr': {
      'tools':'गार्ड साधने','language':'भाषा','operationsOverview':'ऑपरेशन स्थिती','activeGate':'सक्रिय गेट','realtime':'रिअल टाइम','connected':'जोडलेले','disconnected':'डिस्कनेक्ट',
      'offlineQueue':'ऑफलाइन रांग','pendingActions':'प्रलंबित कृती','retrySync':'सुरक्षित सिंक पुन्हा करा','unitDirectory':'युनिट सूची','searchUnit':'इमारत किंवा युनिट शोधा','noUnits':'जुळणारी युनिट नाहीत','ready':'तयार',
      'reviewRequired':'पर्यवेक्षक पुनरावलोकन','cachedDirectory':'ऑफलाइन निर्देशिका','cachedLookup':'कॅश शोध सक्रिय',
    },
    'bn': {
      'tools':'গার্ড টুলস','language':'ভাষা','operationsOverview':'অপারেশন অবস্থা','activeGate':'সক্রিয় গেট','realtime':'রিয়েল টাইম','connected':'সংযুক্ত','disconnected':'সংযোগ বিচ্ছিন্ন',
      'offlineQueue':'অফলাইন কিউ','pendingActions':'অপেক্ষমান কাজ','retrySync':'নিরাপদ সিঙ্ক আবার চেষ্টা করুন','unitDirectory':'ইউনিট তালিকা','searchUnit':'বিল্ডিং বা ইউনিট খুঁজুন','noUnits':'কোনো মিল পাওয়া যায়নি','ready':'প্রস্তুত',
      'reviewRequired':'সুপারভাইজার পর্যালোচনা','cachedDirectory':'অফলাইন ডিরেক্টরি','cachedLookup':'ক্যাশ অনুসন্ধান সক্রিয়',
    },
  };
}
