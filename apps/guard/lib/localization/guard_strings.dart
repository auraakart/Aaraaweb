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
      'tools':'Guard tools','nextAction':'Next action','language':'Language','operationsOverview':'Operations overview','activeGate':'Active gate',
      'realtime':'Realtime','connected':'Connected','disconnected':'Disconnected','offlineQueue':'Offline queue','pendingActions':'pending actions',
      'retrySync':'Retry safe sync','unitDirectory':'Unit directory','searchUnit':'Search building or unit','noUnits':'No matching occupied units',
      'ready':'Ready','reviewRequired':'Supervisor review','cachedDirectory':'Offline directory','cachedLookup':'Cached lookup active',
      'quick':'Quick','parcels':'Parcels','staff':'Staff','fieldOperations':'Field operations','schoolTransport':'School transport',
      'voiceCues':'Voice cues','voiceCuesHelp':'Speak short safety and access-status cues using on-device text to speech.',
      'gateOperations':'Gate operations','signOut':'Sign out','securityShiftActive':'Security shift active','selectGateBegin':'Select a gate to begin operations',
      'scanPass':'Scan a pass','scanHint':'Use QR first for the fastest verified entry.','scanQr':'Scan QR',
      'enterCredential':'Enter credential manually','manualCredential':'Manual credential','verify':'Verify','enter':'Enter','exit':'Exit',
      'quickArrival':'Quick arrival','delivery':'Delivery','cab':'Cab','walkInVisitor':'Walk-in visitor',
      'waitingApproval':'Waiting for resident approval','checkApproval':'Check approval','approvedEnter':'Approved — enter','close':'Close',
      'onlineClear':'Online operations clear','noQueuedActions':'No locally queued gate actions.','processing':'Processing gate operation…',
      'voiceAccessApproved':'Access approved. Entry is allowed.','voiceAccessBlocked':'Access is not approved. Do not allow entry.',
      'voiceWaitingApproval':'Waiting for resident approval.'
    },
    'hi': {
      'tools':'गार्ड टूल्स','nextAction':'अगला कदम','language':'भाषा','operationsOverview':'ऑपरेशन स्थिति','activeGate':'सक्रिय गेट',
      'realtime':'रीयल टाइम','connected':'कनेक्टेड','disconnected':'डिस्कनेक्टेड','offlineQueue':'ऑफलाइन कतार','pendingActions':'लंबित कार्य',
      'retrySync':'सुरक्षित सिंक फिर करें','unitDirectory':'फ्लैट सूची','searchUnit':'बिल्डिंग या फ्लैट खोजें','noUnits':'कोई मिलती इकाई नहीं',
      'ready':'तैयार','reviewRequired':'सुपरवाइज़र समीक्षा','cachedDirectory':'ऑफलाइन डायरेक्टरी','cachedLookup':'कैश खोज सक्रिय',
      'quick':'त्वरित','parcels':'पार्सल','staff':'स्टाफ','fieldOperations':'मैदानी कार्य','schoolTransport':'स्कूल वाहन',
      'voiceCues':'आवाज़ संकेत','voiceCuesHelp':'डिवाइस की आवाज़ से छोटे सुरक्षा और प्रवेश संकेत सुनाएँ।',
      'gateOperations':'गेट संचालन','signOut':'साइन आउट','securityShiftActive':'सुरक्षा ड्यूटी सक्रिय','selectGateBegin':'काम शुरू करने के लिए गेट चुनें',
      'scanPass':'पास स्कैन करें','scanHint':'तेज़ सत्यापन के लिए पहले QR स्कैन करें।','scanQr':'QR स्कैन करें',
      'enterCredential':'क्रेडेंशियल हाथ से दर्ज करें','manualCredential':'मैनुअल क्रेडेंशियल','verify':'सत्यापित करें','enter':'प्रवेश','exit':'निकास',
      'quickArrival':'त्वरित आगमन','delivery':'डिलीवरी','cab':'कैब','walkInVisitor':'बिना पास आगंतुक',
      'waitingApproval':'निवासी की मंज़ूरी की प्रतीक्षा','checkApproval':'मंज़ूरी जाँचें','approvedEnter':'मंज़ूर — प्रवेश दें','close':'बंद करें',
      'onlineClear':'ऑनलाइन संचालन सामान्य','noQueuedActions':'कोई स्थानीय लंबित गेट कार्य नहीं।','processing':'गेट कार्य जारी है…',
      'voiceAccessApproved':'प्रवेश मंज़ूर है। अंदर जाने दें।','voiceAccessBlocked':'प्रवेश मंज़ूर नहीं है। अंदर न जाने दें।','voiceWaitingApproval':'निवासी की मंज़ूरी की प्रतीक्षा है।'
    },
    'ta': {
      'tools':'காவலர் கருவிகள்','nextAction':'அடுத்த செயல்','language':'மொழி','operationsOverview':'செயல்பாட்டு நிலை','activeGate':'செயலில் உள்ள வாயில்',
      'realtime':'நேரடி இணைப்பு','connected':'இணைக்கப்பட்டது','disconnected':'இணைப்பு இல்லை','offlineQueue':'ஆஃப்லைன் வரிசை','pendingActions':'நிலுவை செயல்கள்',
      'retrySync':'பாதுகாப்பான ஒத்திசைவை மீண்டும் செய்','unitDirectory':'வீட்டு பட்டியல்','searchUnit':'கட்டிடம் அல்லது வீடு தேடவும்','noUnits':'பொருந்தும் வீடுகள் இல்லை',
      'ready':'தயார்','reviewRequired':'மேற்பார்வையாளர் ஆய்வு','cachedDirectory':'ஆஃப்லைன் பட்டியல்','cachedLookup':'சேமித்த தேடல் செயலில்',
      'quick':'விரைவு','parcels':'பார்சல்கள்','staff':'பணியாளர்','fieldOperations':'கள செயல்பாடுகள்','schoolTransport':'பள்ளி போக்குவரத்து',
      'voiceCues':'குரல் அறிவிப்புகள்','voiceCuesHelp':'சாதனத்தின் குரல் மூலம் குறுகிய பாதுகாப்பு மற்றும் அனுமதி நிலையைச் சொல்லும்.',
      'gateOperations':'வாயில் செயல்பாடுகள்','signOut':'வெளியேறு','securityShiftActive':'பாதுகாப்பு பணி செயலில்','selectGateBegin':'தொடங்க ஒரு வாயிலைத் தேர்வு செய்யவும்',
      'scanPass':'பாஸை ஸ்கேன் செய்யவும்','scanHint':'வேகமான சரிபார்ப்புக்கு முதலில் QR பயன்படுத்தவும்.','scanQr':'QR ஸ்கேன்',
      'enterCredential':'அடையாளத்தை கைமுறையாக உள்ளிடவும்','manualCredential':'கைமுறை அடையாளம்','verify':'சரிபார்','enter':'உள் நுழைவு','exit':'வெளியேறு',
      'quickArrival':'விரைவு வருகை','delivery':'டெலிவரி','cab':'கேப்','walkInVisitor':'நேரடி வருகையாளர்',
      'waitingApproval':'குடியிருப்பாளர் அனுமதிக்காக காத்திருக்கிறது','checkApproval':'அனுமதி சரிபார்','approvedEnter':'அனுமதி — உள்ளே விடவும்','close':'மூடு',
      'onlineClear':'ஆன்லைன் செயல்பாடு சரியாக உள்ளது','noQueuedActions':'நிலுவையில் உள்ள உள்ளூர் வாயில் செயல்கள் இல்லை.','processing':'வாயில் செயல் நடைபெறுகிறது…',
      'voiceAccessApproved':'அனுமதி வழங்கப்பட்டது. உள்ளே விடலாம்.','voiceAccessBlocked':'அனுமதி இல்லை. உள்ளே விட வேண்டாம்.','voiceWaitingApproval':'குடியிருப்பாளர் அனுமதிக்காக காத்திருக்கிறது.'
    },
    'te': {
      'tools':'గార్డ్ టూల్స్','nextAction':'తదుపరి చర్య','language':'భాష','operationsOverview':'ఆపరేషన్ స్థితి','activeGate':'యాక్టివ్ గేట్',
      'realtime':'రియల్ టైమ్','connected':'కనెక్ట్ అయింది','disconnected':'డిస్‌కనెక్ట్ అయింది','offlineQueue':'ఆఫ్‌లైన్ క్యూ','pendingActions':'పెండింగ్ చర్యలు',
      'retrySync':'సురక్షిత సింక్ మళ్లీ చేయండి','unitDirectory':'యూనిట్ జాబితా','searchUnit':'బిల్డింగ్ లేదా యూనిట్ వెతకండి','noUnits':'సరిపోలిన యూనిట్లు లేవు',
      'ready':'సిద్ధం','reviewRequired':'సూపర్‌వైజర్ సమీక్ష','cachedDirectory':'ఆఫ్‌లైన్ డైరెక్టరీ','cachedLookup':'క్యాష్ శోధన సక్రియం',
      'quick':'త్వరితం','parcels':'పార్సెల్లు','staff':'సిబ్బంది','fieldOperations':'ఫీల్డ్ ఆపరేషన్స్','schoolTransport':'స్కూల్ ట్రాన్స్‌పోర్ట్',
      'voiceCues':'వాయిస్ సూచనలు','voiceCuesHelp':'పరికరంలోని వాయిస్‌తో చిన్న భద్రత మరియు యాక్సెస్ స్థితి సూచనలు వినిపించండి.',
      'gateOperations':'గేట్ ఆపరేషన్స్','signOut':'సైన్ అవుట్','securityShiftActive':'సెక్యూరిటీ షిఫ్ట్ యాక్టివ్','selectGateBegin':'ప్రారంభించడానికి గేట్ ఎంచుకోండి',
      'scanPass':'పాస్ స్కాన్ చేయండి','scanHint':'త్వరిత ధృవీకరణకు ముందుగా QR ఉపయోగించండి.','scanQr':'QR స్కాన్',
      'enterCredential':'క్రెడెన్షియల్ చేతితో నమోదు చేయండి','manualCredential':'మాన్యువల్ క్రెడెన్షియల్','verify':'ధృవీకరించండి','enter':'ప్రవేశం','exit':'నిష్క్రమణ',
      'quickArrival':'త్వరిత రాక','delivery':'డెలివరీ','cab':'క్యాబ్','walkInVisitor':'వాక్-ఇన్ విజిటర్',
      'waitingApproval':'నివాసి అనుమతి కోసం వేచి ఉంది','checkApproval':'అనుమతి చూడండి','approvedEnter':'అనుమతి — లోపలికి పంపండి','close':'మూసివేయి',
      'onlineClear':'ఆన్‌లైన్ ఆపరేషన్స్ సరిగా ఉన్నాయి','noQueuedActions':'లోకల్ పెండింగ్ గేట్ చర్యలు లేవు.','processing':'గేట్ చర్య జరుగుతోంది…',
      'voiceAccessApproved':'ప్రవేశం అనుమతించబడింది. లోపలికి పంపండి.','voiceAccessBlocked':'ప్రవేశానికి అనుమతి లేదు. లోపలికి పంపవద్దు.','voiceWaitingApproval':'నివాసి అనుమతి కోసం వేచి ఉంది.'
    },
    'kn': {
      'tools':'ಗಾರ್ಡ್ ಉಪಕರಣಗಳು','nextAction':'ಮುಂದಿನ ಕ್ರಮ','language':'ಭಾಷೆ','operationsOverview':'ಕಾರ್ಯಾಚರಣೆ ಸ್ಥಿತಿ','activeGate':'ಸಕ್ರಿಯ ಗೇಟ್',
      'realtime':'ನೇರ ಸಂಪರ್ಕ','connected':'ಸಂಪರ್ಕಿತ','disconnected':'ಸಂಪರ್ಕ ಕಡಿತ','offlineQueue':'ಆಫ್‌ಲೈನ್ ಸರತಿ','pendingActions':'ಬಾಕಿ ಕಾರ್ಯಗಳು',
      'retrySync':'ಸುರಕ್ಷಿತ ಸಿಂಕ್ ಮರುಪ್ರಯತ್ನ','unitDirectory':'ಮನೆಗಳ ಪಟ್ಟಿ','searchUnit':'ಕಟ್ಟಡ ಅಥವಾ ಮನೆ ಹುಡುಕಿ','noUnits':'ಹೊಂದುವ ಮನೆಗಳಿಲ್ಲ',
      'ready':'ಸಿದ್ಧ','reviewRequired':'ಮೇಲ್ವಿಚಾರಕರ ಪರಿಶೀಲನೆ','cachedDirectory':'ಆಫ್‌ಲೈನ್ ಡೈರೆಕ್ಟರಿ','cachedLookup':'ಕ್ಯಾಶ್ ಹುಡುಕಾಟ ಸಕ್ರಿಯ',
      'quick':'ತ್ವರಿತ','parcels':'ಪಾರ್ಸೆಲ್‌ಗಳು','staff':'ಸಿಬ್ಬಂದಿ','fieldOperations':'ಕ್ಷೇತ್ರ ಕಾರ್ಯಾಚರಣೆ','schoolTransport':'ಶಾಲಾ ಸಾರಿಗೆ',
      'voiceCues':'ಧ್ವನಿ ಸೂಚನೆಗಳು','voiceCuesHelp':'ಸಾಧನದ ಧ್ವನಿಯಿಂದ ಚಿಕ್ಕ ಸುರಕ್ಷತೆ ಮತ್ತು ಪ್ರವೇಶ ಸ್ಥಿತಿ ಸೂಚನೆಗಳನ್ನು ಹೇಳಿ.',
      'gateOperations':'ಗೇಟ್ ಕಾರ್ಯಾಚರಣೆ','signOut':'ಸೈನ್ ಔಟ್','securityShiftActive':'ಭದ್ರತಾ ಪಾಳಿ ಸಕ್ರಿಯ','selectGateBegin':'ಪ್ರಾರಂಭಿಸಲು ಗೇಟ್ ಆಯ್ಕೆಮಾಡಿ',
      'scanPass':'ಪಾಸ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ','scanHint':'ವೇಗದ ಪರಿಶೀಲನೆಗೆ ಮೊದಲು QR ಬಳಸಿ.','scanQr':'QR ಸ್ಕ್ಯಾನ್',
      'enterCredential':'ಗುರುತನ್ನು ಕೈಯಾರೆ ನಮೂದಿಸಿ','manualCredential':'ಕೈಯಾರೆ ಗುರುತು','verify':'ಪರಿಶೀಲಿಸಿ','enter':'ಪ್ರವೇಶ','exit':'ನಿರ್ಗಮನ',
      'quickArrival':'ತ್ವರಿತ ಆಗಮನ','delivery':'ಡೆಲಿವರಿ','cab':'ಕ್ಯಾಬ್','walkInVisitor':'ನೇರ ಭೇಟಿ',
      'waitingApproval':'ನಿವಾಸಿಯ ಅನುಮತಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ','checkApproval':'ಅನುಮತಿ ಪರಿಶೀಲಿಸಿ','approvedEnter':'ಅನುಮೋದನೆ — ಒಳಗೆ ಬಿಡಿ','close':'ಮುಚ್ಚಿ',
      'onlineClear':'ಆನ್‌ಲೈನ್ ಕಾರ್ಯಾಚರಣೆ ಸರಿಯಾಗಿದೆ','noQueuedActions':'ಸ್ಥಳೀಯ ಬಾಕಿ ಗೇಟ್ ಕಾರ್ಯಗಳಿಲ್ಲ.','processing':'ಗೇಟ್ ಕಾರ್ಯ ನಡೆಯುತ್ತಿದೆ…',
      'voiceAccessApproved':'ಪ್ರವೇಶ ಅನುಮೋದಿಸಲಾಗಿದೆ. ಒಳಗೆ ಬಿಡಿ.','voiceAccessBlocked':'ಪ್ರವೇಶ ಅನುಮೋದಿಸಲಿಲ್ಲ. ಒಳಗೆ ಬಿಡಬೇಡಿ.','voiceWaitingApproval':'ನಿವಾಸಿಯ ಅನುಮತಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ.'
    },
    'ml': {
      'tools':'ഗാർഡ് ഉപകരണങ്ങൾ','nextAction':'അടുത്ത നടപടി','language':'ഭാഷ','operationsOverview':'പ്രവർത്തന നില','activeGate':'സജീവ ഗേറ്റ്',
      'realtime':'തത്സമയ ബന്ധം','connected':'ബന്ധിപ്പിച്ചു','disconnected':'ബന്ധം നഷ്ടപ്പെട്ടു','offlineQueue':'ഓഫ്‌ലൈൻ ക്യൂ','pendingActions':'ബാക്കി പ്രവർത്തനങ്ങൾ',
      'retrySync':'സുരക്ഷിത സിങ്ക് വീണ്ടും ശ്രമിക്കുക','unitDirectory':'യൂണിറ്റ് പട്ടിക','searchUnit':'ബിൽഡിംഗ് അല്ലെങ്കിൽ യൂണിറ്റ് തിരയുക','noUnits':'പൊരുത്തപ്പെടുന്ന യൂണിറ്റുകളില്ല',
      'ready':'തയ്യാർ','reviewRequired':'സൂപ്പർവൈസർ പരിശോധന','cachedDirectory':'ഓഫ്‌ലൈൻ ഡയറക്ടറി','cachedLookup':'കാഷ് തിരച്ചിൽ സജീവം',
      'quick':'വേഗം','parcels':'പാഴ്സലുകൾ','staff':'സ്റ്റാഫ്','fieldOperations':'ഫീൽഡ് പ്രവർത്തനങ്ങൾ','schoolTransport':'സ്കൂൾ ഗതാഗതം',
      'voiceCues':'ശബ്ദ അറിയിപ്പുകൾ','voiceCuesHelp':'ഉപകരണത്തിലെ ശബ്ദം ഉപയോഗിച്ച് ചെറിയ സുരക്ഷാ, പ്രവേശന നില അറിയിപ്പുകൾ പറയുക.',
      'gateOperations':'ഗേറ്റ് പ്രവർത്തനങ്ങൾ','signOut':'സൈൻ ഔട്ട്','securityShiftActive':'സുരക്ഷാ ഷിഫ്റ്റ് സജീവം','selectGateBegin':'തുടങ്ങാൻ ഒരു ഗേറ്റ് തിരഞ്ഞെടുക്കുക',
      'scanPass':'പാസ് സ്കാൻ ചെയ്യുക','scanHint':'വേഗത്തിലുള്ള പരിശോധനയ്ക്ക് ആദ്യം QR ഉപയോഗിക്കുക.','scanQr':'QR സ്കാൻ',
      'enterCredential':'അടയാളം കൈമാറി നൽകുക','manualCredential':'മാനുവൽ അടയാളം','verify':'പരിശോധിക്കുക','enter':'പ്രവേശനം','exit':'പുറത്ത്',
      'quickArrival':'വേഗത്തിലുള്ള വരവ്','delivery':'ഡെലിവറി','cab':'കാബ്','walkInVisitor':'നേരിട്ട് എത്തിയ സന്ദർശകൻ',
      'waitingApproval':'താമസക്കാരന്റെ അനുമതിക്കായി കാത്തിരിക്കുന്നു','checkApproval':'അനുമതി പരിശോധിക്കുക','approvedEnter':'അനുമതി — അകത്ത് വിടുക','close':'അടയ്ക്കുക',
      'onlineClear':'ഓൺലൈൻ പ്രവർത്തനം സാധാരണം','noQueuedActions':'പ്രാദേശികമായി കാത്തിരിക്കുന്ന ഗേറ്റ് പ്രവർത്തനങ്ങളില്ല.','processing':'ഗേറ്റ് പ്രവർത്തനം നടക്കുന്നു…',
      'voiceAccessApproved':'പ്രവേശനം അനുവദിച്ചു. അകത്ത് വിടാം.','voiceAccessBlocked':'പ്രവേശനം അനുവദിച്ചിട്ടില്ല. അകത്ത് വിടരുത്.','voiceWaitingApproval':'താമസക്കാരന്റെ അനുമതിക്കായി കാത്തിരിക്കുന്നു.'
    },
    'mr': {
      'tools':'गार्ड साधने','nextAction':'पुढील कृती','language':'भाषा','operationsOverview':'ऑपरेशन स्थिती','activeGate':'सक्रिय गेट',
      'realtime':'रिअल टाइम','connected':'जोडलेले','disconnected':'डिस्कनेक्ट','offlineQueue':'ऑफलाइन रांग','pendingActions':'प्रलंबित कृती',
      'retrySync':'सुरक्षित सिंक पुन्हा करा','unitDirectory':'युनिट सूची','searchUnit':'इमारत किंवा युनिट शोधा','noUnits':'जुळणारी युनिट नाहीत',
      'ready':'तयार','reviewRequired':'पर्यवेक्षक पुनरावलोकन','cachedDirectory':'ऑफलाइन निर्देशिका','cachedLookup':'कॅश शोध सक्रिय',
      'quick':'त्वरित','parcels':'पार्सल','staff':'कर्मचारी','fieldOperations':'मैदानी कामकाज','schoolTransport':'शाळा वाहतूक',
      'voiceCues':'आवाज सूचना','voiceCuesHelp':'डिव्हाइसवरील आवाजाने छोट्या सुरक्षा व प्रवेश-स्थिती सूचना सांगा.',
      'gateOperations':'गेट कामकाज','signOut':'साइन आउट','securityShiftActive':'सुरक्षा शिफ्ट सक्रिय','selectGateBegin':'सुरू करण्यासाठी गेट निवडा',
      'scanPass':'पास स्कॅन करा','scanHint':'जलद पडताळणीसाठी प्रथम QR वापरा.','scanQr':'QR स्कॅन',
      'enterCredential':'क्रेडेन्शियल हाताने टाका','manualCredential':'मॅन्युअल क्रेडेन्शियल','verify':'पडताळा','enter':'प्रवेश','exit':'बाहेर',
      'quickArrival':'त्वरित आगमन','delivery':'डिलिव्हरी','cab':'कॅब','walkInVisitor':'प्रत्यक्ष आलेला पाहुणा',
      'waitingApproval':'रहिवाशाच्या मंजुरीची प्रतीक्षा','checkApproval':'मंजुरी तपासा','approvedEnter':'मंजूर — प्रवेश द्या','close':'बंद करा',
      'onlineClear':'ऑनलाइन कामकाज सुरळीत','noQueuedActions':'स्थानिक प्रलंबित गेट कृती नाहीत.','processing':'गेट कृती सुरू आहे…',
      'voiceAccessApproved':'प्रवेश मंजूर आहे. आत जाऊ द्या.','voiceAccessBlocked':'प्रवेश मंजूर नाही. आत जाऊ देऊ नका.','voiceWaitingApproval':'रहिवाशाच्या मंजुरीची प्रतीक्षा आहे.'
    },
    'bn': {
      'tools':'গার্ড টুলস','nextAction':'পরবর্তী পদক্ষেপ','language':'ভাষা','operationsOverview':'অপারেশন অবস্থা','activeGate':'সক্রিয় গেট',
      'realtime':'রিয়েল টাইম','connected':'সংযুক্ত','disconnected':'সংযোগ বিচ্ছিন্ন','offlineQueue':'অফলাইন কিউ','pendingActions':'অপেক্ষমান কাজ',
      'retrySync':'নিরাপদ সিঙ্ক আবার চেষ্টা করুন','unitDirectory':'ইউনিট তালিকা','searchUnit':'বিল্ডিং বা ইউনিট খুঁজুন','noUnits':'কোনো মিল পাওয়া যায়নি',
      'ready':'প্রস্তুত','reviewRequired':'সুপারভাইজার পর্যালোচনা','cachedDirectory':'অফলাইন ডিরেক্টরি','cachedLookup':'ক্যাশ অনুসন্ধান সক্রিয়',
      'quick':'দ্রুত','parcels':'পার্সেল','staff':'স্টাফ','fieldOperations':'ফিল্ড অপারেশন','schoolTransport':'স্কুল পরিবহন',
      'voiceCues':'ভয়েস সংকেত','voiceCuesHelp':'ডিভাইসের ভয়েস দিয়ে ছোট নিরাপত্তা ও প্রবেশ-অবস্থা সংকেত বলুন।',
      'gateOperations':'গেট অপারেশন','signOut':'সাইন আউট','securityShiftActive':'নিরাপত্তা শিফট সক্রিয়','selectGateBegin':'শুরু করতে একটি গেট বেছে নিন',
      'scanPass':'পাস স্ক্যান করুন','scanHint':'দ্রুত যাচাইয়ের জন্য আগে QR ব্যবহার করুন।','scanQr':'QR স্ক্যান',
      'enterCredential':'ক্রেডেনশিয়াল হাতে লিখুন','manualCredential':'ম্যানুয়াল ক্রেডেনশিয়াল','verify':'যাচাই করুন','enter':'প্রবেশ','exit':'বের হওয়া',
      'quickArrival':'দ্রুত আগমন','delivery':'ডেলিভারি','cab':'ক্যাব','walkInVisitor':'সরাসরি আগত দর্শনার্থী',
      'waitingApproval':'বাসিন্দার অনুমোদনের অপেক্ষা','checkApproval':'অনুমোদন দেখুন','approvedEnter':'অনুমোদিত — প্রবেশ দিন','close':'বন্ধ করুন',
      'onlineClear':'অনলাইন অপারেশন স্বাভাবিক','noQueuedActions':'স্থানীয় কোনো অপেক্ষমান গেট কাজ নেই।','processing':'গেট অপারেশন চলছে…',
      'voiceAccessApproved':'প্রবেশ অনুমোদিত। ভিতরে যেতে দিন।','voiceAccessBlocked':'প্রবেশ অনুমোদিত নয়। ভিতরে যেতে দেবেন না।','voiceWaitingApproval':'বাসিন্দার অনুমোদনের অপেক্ষা চলছে।'
    },
  };
}
