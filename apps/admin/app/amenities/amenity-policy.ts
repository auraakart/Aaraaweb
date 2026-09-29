export type PricingBand={
  label?:string;
  daysOfWeek?:number[];
  startMinute:number;
  endMinute:number;
  feePaise:number;
};

export type AmenityRules={
  minAdvanceMinutes?:number;
  maxAdvanceDays?:number;
  maxFutureBookingsPerUnit?:number;
  maxBookingsPerDayPerUnit?:number;
  cooldownMinutes?:number;
  cancellationCutoffMinutes?:number;
  checkInOpenMinutesBefore?:number;
  noShowGraceMinutes?:number;
  noShowRestrictionCount?:number;
  noShowLookbackDays?:number;
  noShowBlockDays?:number;
  maxGuestsPerBooking?:number;
  conflictGroup?:string;
  pricingBands?:PricingBand[];
};

type NoShowPolicyDraft={
  restrictionCount:string;
  lookbackDays:string;
  blockDays:string;
};

type NoShowPolicyRules=Pick<AmenityRules,'noShowRestrictionCount'|'noShowLookbackDays'|'noShowBlockDays'>;

function optionalBoundedInteger(value:string,label:string,min:number,max:number){
  if(value.trim()==='') return undefined;
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<min||parsed>max){
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function parseNoShowPolicyDraft(draft:NoShowPolicyDraft):NoShowPolicyRules{
  const noShowRestrictionCount=optionalBoundedInteger(draft.restrictionCount,'No-show threshold',1,10);
  const noShowLookbackDays=optionalBoundedInteger(draft.lookbackDays,'No-show lookback days',1,365);
  const noShowBlockDays=optionalBoundedInteger(draft.blockDays,'No-show pause days',1,365);
  const configured=[noShowRestrictionCount,noShowLookbackDays,noShowBlockDays].filter(value=>value!==undefined).length;
  if(configured!==0&&configured!==3){
    throw new Error('No-show threshold, lookback days and pause days must be configured together');
  }
  if(configured===0) return {};
  return {noShowRestrictionCount,noShowLookbackDays,noShowBlockDays};
}
