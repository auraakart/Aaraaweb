/**
 * Routes common society questions to the existing published, audience-checked
 * SocietyDocument knowledge search. This is intent classification only:
 * no society policy or service availability is inferred here.
 */
export function isSocietyKnowledgeQuestion(text:string):boolean {
  const question=text.toLowerCase();
  // A resident's own allocation, profile and live activity are private
  // operational queries, not general society policy lookups.
  if(/\b(?:my|our)\s+(?:parking\s+(?:slot|bay|space|allocation)|visitor\s+(?:pass|status)|complaints?|bills?|payments?|vehicles?|family|household|parcels?)\b/.test(question)) return false;
  return [
    // Existing legal/policy/document types, including common plurals.
    /\b(?:bylaws?|bye[- ]?laws?|polic(?:y|ies)|documents?|circulars?|handbooks?|society\s+rules?|community\s+rules?|meeting\s+minutes|knowledge)\b/,
    // Operational rules and contact information residents commonly ask.
    /\b(?:garbage|waste|trash|recycl(?:ing|ables?))\s*(?:collection|segregation|schedule|tim(?:e|es|ings?)|rules?)\b/,
    /\b(?:pets?|dogs?|cats?)\s*(?:allowed|rules?|policy|restrictions?|registration|areas?)\b/,
    /\b(?:parking|visitor\s+parking|vehicle\s+parking)\s*(?:rules?|policy|charges?|fees?|restrictions?|timings?|hours?|permissions?)\b/,
    /\b(?:pool|swimming\s+pool|gym|clubhouse|playground|community\s+hall|guest\s+room)\s*(?:rules?|policy|hours?|timings?|schedule|eligibility|restrictions?|charges?|fees?|guest\s+limits?)\b/,
    /\b(?:quiet\s+hours?|noise\s+rules?|renovation\s+(?:hours?|timings?|rules?|permission)|construction\s+(?:hours?|timings?|rules?))\b/,
    /\b(?:move[- ]?in|move[- ]?out|shifting|relocation)\s*(?:procedures?|rules?|polic(?:y|ies)|permissions?|charges?|fees?|timings?)\b/,
    /\b(?:society\s+(?:office|helpdesk|manager)\s*(?:hours?|timings?|contact|phone)|emergency\s+(?:contacts?|procedures?|numbers?|plan))\b/,
    /\b(?:festival|events?|celebrations?)\s*(?:rules?|polic(?:y|ies)|permissions?|guidelines?)\b/,
    /\b(?:visitor|guest|delivery)\s*(?:entry|access|hours?|timings?|rules?|polic(?:y|ies)|permissions?|restrictions?)\b/,
    // V4.90.5: reverse-word-order and short everyday visitor questions.
    // These patterns only choose a published, audience-scoped knowledge lookup;
    // they never supply a rule or override a private resident intent.
    /\b(?:rules?|restrictions?|permissions?)\s+(?:for|on|about)\s+(?:visitors?|guests?|deliveries?|pets?|dogs?|cats?|parking|vehicles?|gym|pool|clubhouse|garbage|waste|renovation)\b/,
    /\b(?:are|is|can|may)\b.{0,50}\b(?:visitors?|guests?|deliveries?|pets?|dogs?|cats?)\b.{0,30}\b(?:allowed|permitted|restricted|banned)\b/,
    /\b(?:visitors?|guests?|deliveries?)\b.{0,30}\b(?:need|require)\b.{0,25}\b(?:pass|approval|permission)\b/,
    // Conversational phrasings without exact 'rule' or 'policy' keywords.
    /\b(?:who|can|may|are)\b.{0,55}\b(?:use|access|book|enter)\b.{0,35}\b(?:gym|pool|clubhouse|community\s+hall|guest\s+room)\b/,
    /\b(?:what|when|where|how)\b.{0,55}\b(?:garbage|waste|trash|recycling|quiet\s+hours?|renovation|society\s+office)\b/,
    /\b(?:can|when|how)\b.{0,40}\bmove[- ]?(?:in|out)\b/,
    /\b(?:when|can|may|where)\b.{0,45}\b(?:delivery|guest|visitor)\b.{0,30}\b(?:enter|arrive|access|come)\b/,
    /\b(?:festival|events?|celebrations?)\b.{0,35}\b(?:decorations?|allowed|permitted|permissions?|guidelines?)\b/,
  ].some(pattern=>pattern.test(question));
}
