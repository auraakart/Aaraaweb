import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';

export type AiAssistantIntent =
  | 'SOCIETY_FINANCE'
  | 'RESIDENT_STATUS'
  | 'RESIDENT_HOUSEHOLD'
  | 'RESIDENT_VEHICLES'
  | 'RESIDENT_PARCELS'
  | 'RESIDENT_DAILY_BRIEF'
  | 'RESIDENT_WORKFORCE'
  | 'RESIDENT_UTILITIES'
  | 'RESIDENT_REQUESTS'
  | 'HELPDESK_OPERATIONS'
  | 'SECURITY_EVENTS'
  | 'FACILITIES'
  | 'VENDORS'
  | 'DISCOVERY'
  | 'RESIDENT_NOTICES'
  | 'RESIDENT_GATE'
  | 'GOVERNANCE'
  | 'SOCIETY_KNOWLEDGE'
  | 'MULTI_DOMAIN'
  | 'UNSUPPORTED';

export type AiAssistantToolId = Exclude<AiAssistantIntent, 'UNSUPPORTED'>;

export type AiAssistantToolDefinition = {
  id: AiAssistantToolId;
  label: string;
  context: 'SOCIETY' | 'PROPERTY';
  permissions: readonly AppPermission[];
  permissionMode: 'ANY' | 'ALL';
};

export const AI_ASSISTANT_TOOLS: readonly AiAssistantToolDefinition[] = [
  {id:'SOCIETY_FINANCE',label:'Society finance',context:'SOCIETY',permissions:[AppPermission.FINANCE_READ],permissionMode:'ALL'},
  {id:'RESIDENT_STATUS',label:'Resident property status',context:'PROPERTY',permissions:[AppPermission.HELPDESK_READ_OWN,AppPermission.PROPERTY_FINANCE_READ,AppPermission.PAYMENT_CREATE_OWN,AppPermission.AMENITY_READ,AppPermission.SERVICES_MARKETPLACE_USE],permissionMode:'ANY'},
  {id:'RESIDENT_HOUSEHOLD',label:'My approved family members',context:'PROPERTY',permissions:[AppPermission.HOUSEHOLD_READ_OWN],permissionMode:'ALL'},
  {id:'RESIDENT_VEHICLES',label:'My household vehicles',context:'PROPERTY',permissions:[AppPermission.HOUSEHOLD_READ_OWN],permissionMode:'ALL'},
  {id:'RESIDENT_PARCELS',label:'My personal parcel status',context:'PROPERTY',permissions:[AppPermission.PARCEL_READ_OWN],permissionMode:'ALL'},
  {id:'RESIDENT_DAILY_BRIEF',label:'My current home briefing',context:'PROPERTY',permissions:[AppPermission.NOTICE_READ,AppPermission.HELPDESK_READ_OWN,AppPermission.VISITOR_READ_OWN],permissionMode:'ANY'},
  {id:'RESIDENT_WORKFORCE',label:'Household staff status',context:'PROPERTY',permissions:[AppPermission.WORKFORCE_READ_OWN],permissionMode:'ALL'},
  {id:'RESIDENT_UTILITIES',label:'Property utility usage',context:'PROPERTY',permissions:[AppPermission.PAYMENT_CREATE_OWN],permissionMode:'ALL'},
  {id:'RESIDENT_REQUESTS',label:'Resident requests and certificates',context:'PROPERTY',permissions:[AppPermission.HELPDESK_READ_OWN],permissionMode:'ALL'},
  {id:'HELPDESK_OPERATIONS',label:'Helpdesk operations',context:'SOCIETY',permissions:[AppPermission.HELPDESK_REVIEW],permissionMode:'ALL'},
  {id:'SECURITY_EVENTS',label:'Security events',context:'SOCIETY',permissions:[AppPermission.AUDIT_READ],permissionMode:'ALL'},
  {id:'FACILITIES',label:'Facilities',context:'SOCIETY',permissions:[AppPermission.FACILITIES_READ],permissionMode:'ALL'},
  {id:'VENDORS',label:'Vendors and procurement',context:'SOCIETY',permissions:[AppPermission.SOCIETY_VENDORS_READ],permissionMode:'ALL'},
  {id:'DISCOVERY',label:'Amenities and services',context:'SOCIETY',permissions:[AppPermission.AMENITY_READ,AppPermission.SERVICES_MARKETPLACE_USE],permissionMode:'ANY'},
  {id:'RESIDENT_NOTICES',label:'Resident notices',context:'PROPERTY',permissions:[AppPermission.NOTICE_READ],permissionMode:'ALL'},
  {id:'RESIDENT_GATE',label:'Resident gate status',context:'PROPERTY',permissions:[AppPermission.VISITOR_READ_OWN,AppPermission.ACCESS_READ_OWN],permissionMode:'ANY'},
  {id:'GOVERNANCE',label:'Governance',context:'SOCIETY',permissions:[AppPermission.GOVERNANCE_READ],permissionMode:'ALL'},
  {id:'SOCIETY_KNOWLEDGE',label:'Society knowledge',context:'SOCIETY',permissions:[AppPermission.DOCUMENTS_READ,AppPermission.NOTICE_READ],permissionMode:'ANY'},
] as const;

export function residentIntentRoutingText(text: string) {
  const hints: string[] = [];
  const groups: Array<[RegExp, string]> = [
    [/परिवार|सदस्य|குடும்ப|உறுப்பினர்|కుటుంబ|సభ్యులు|ಕುಟುಂಬ|ಸದಸ್ಯರು|കുടുംബ|അംഗങ്ങൾ|পরিবার|সদস্য/u,' family members household '],
    [/नियम|विधि|விதிகள்|నియమాలు|ನಿಯಮಗಳು|നിയമങ്ങൾ|নিয়ম/u,' society rule policy '],
    [/शिकायत|புகார்|ఫిర్యాదు|ದೂರು|പരാതി|तक्रार|অভিযোগ/u,' complaint helpdesk ticket '],
    [/भुगतान|बकाया|கட்டணம்|நிலுவை|చెల్లింపు|బకాయి|ಪಾವತಿ|ಬಾಕಿ|പണമടവ്|കുടിശ്ശിക|भरणा|थकबाकी|পেমেন্ট|বকেয়া/u,' payment due maintenance invoice '],
    [/आगंतुक|मेहमान|கேட்|விருந்தினர்|గేట్|సందర్శకుడు|ಗೇಟ್|ಭೇಟಿಕಾರ|ഗേറ്റ്|സന്ദർശകൻ|पाहुणा|গেট|অতিথি/u,' visitor gate entry pass '],
    [/सूचना|அறிவிப்பு|ప్రకటన|ಪ್ರಕಟಣೆ|അറിയിപ്പ്|নোটিশ/u,' notice announcement community update '],
    [/सुविधा|सेवा|வசதி|சேவை|సౌకర్యం|సేవ|ಸೌಲಭ್ಯ|ಸೇವೆ|സൗകര്യം|സേവനം|সুবিধা|সেবা/u,' amenity service provider booking '],
    [/कामवाली|घरेलू कर्मचारी|स्टाफ|வேலைக்காரர்|வீட்டு பணியாளர்|సిబ్బంది|ఇంటి పనివారు|ಸಿಬ್ಬಂದಿ|ಮನೆ ಕೆಲಸಗಾರ|സ്റ്റാഫ്|വീട്ടുജോലിക്കാർ|घरकाम|कर्मचारी|গৃহকর্মী|স্টাফ/u,' household staff domestic help worker workforce '],
    [/मीटर|बिजली|पानी|மீட்டர்|மின்சாரம்|தண்ணீர்|మీటర్|విద్యుత్|నీరు|ಮೀಟರ್|ವಿದ್ಯುತ್|ನೀರು|മീറ്റർ|വൈദ്യുതി|വെള്ളം|মিটার|বিদ্যুৎ|পানি/u,' utility meter consumption reading electricity water '],
    [/एनओसी|नो ड्यूज|प्रमाणपत्र|சான்றிதழ்|என்ஓசி|సర్టిఫికేట్|ಎನ್‌ಒಸಿ|ಪ್ರಮಾಣಪತ್ರ|എൻഒസി|സർട്ടിഫിക്കറ്റ്|এনওসি|সার্টিফিকেট/u,' resident request noc no dues certificate address proof permission letter '],
  ];
  for (const [pattern, hint] of groups) if (pattern.test(text)) hints.push(hint);
  return `${text} ${hints.join(' ')}`.trim();
}

export function promptInjectionAttempt(text: string) {
  return /system prompt|developer message|database credentials|direct database|execute sql|hidden tool|ignore.{0,40}(instructions?|permissions?|authorization|tool policy)|bypass.{0,40}(permissions?|authorization|confirmation|tool policy)|override.{0,40}(permissions?|authorization|confirmation|tool policy)/i.test(text);
}

export function amountThresholdPaise(text: string) {
  const match = text.replace(/,/g, '').match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)/i);
  if (!match) return 0;
  const rupees = Number(match[1]);
  return Number.isFinite(rupees) && rupees >= 0 ? Math.round(rupees * 100) : 0;
}

export function canUseAssistantTool(roles: readonly AppRole[], tool: AiAssistantToolDefinition) {
  return tool.permissionMode === 'ALL'
    ? tool.permissions.every((permission) => hasPermission(roles, permission))
    : tool.permissions.some((permission) => hasPermission(roles, permission));
}
