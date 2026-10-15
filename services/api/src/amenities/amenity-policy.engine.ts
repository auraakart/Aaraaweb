import { BadRequestException, ConflictException } from '@nestjs/common';

export type AmenityPricingBand = {
  label?: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  feePaise: number;
};

export type AmenityBookingRules = {
  minAdvanceMinutes?: number;
  maxAdvanceDays?: number;
  maxFutureBookingsPerUnit?: number;
  maxBookingsPerDayPerUnit?: number;
  cooldownMinutes?: number;
  cancellationCutoffMinutes?: number;
  checkInOpenMinutesBefore?: number;
  noShowGraceMinutes?: number;
  noShowRestrictionCount?: number;
  noShowLookbackDays?: number;
  noShowBlockDays?: number;
  refundableDepositPaise?: number;
  depositPaymentWindowMinutes?: number;
  maxGuestsPerBooking?: number;
  conflictGroup?: string;
  pricingBands?: AmenityPricingBand[];
};

export type AmenityBlackoutWindow = {
  start: string;
  end: string;
  reason?: string;
  kind?: 'MAINTENANCE'|'CLOSURE'|'PRIVATE_EVENT';
};

export type AmenityWeeklyWindow = { start: string; end: string };
export type AmenityWeeklySchedule = Partial<Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', AmenityWeeklyWindow[]>>;

export class AmenityPolicyEngine {
  parseBookingRules(value: unknown): AmenityBookingRules {
    if (value === null || value === undefined) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Amenity booking rules must be an object');
    const source = value as Record<string, unknown>;
    const noShowRestrictionCount=this.optionalPolicyInteger(source.noShowRestrictionCount,'noShowRestrictionCount',1,10);
    const noShowLookbackDays=this.optionalPolicyInteger(source.noShowLookbackDays,'noShowLookbackDays',1,365);
    const noShowBlockDays=this.optionalPolicyInteger(source.noShowBlockDays,'noShowBlockDays',1,365);
    const noShowParts=[noShowRestrictionCount,noShowLookbackDays,noShowBlockDays].filter(item=>item!==undefined).length;
    if(noShowParts!==0&&noShowParts!==3){
      throw new BadRequestException('noShowRestrictionCount, noShowLookbackDays and noShowBlockDays must be configured together');
    }
    const refundableDepositPaise=this.optionalPolicyInteger(source.refundableDepositPaise,'refundableDepositPaise',0,10_000_000);
    const depositPaymentWindowMinutes=this.optionalPolicyInteger(source.depositPaymentWindowMinutes,'depositPaymentWindowMinutes',5,1440);
    const depositEnabled=(refundableDepositPaise??0)>0;
    if(depositEnabled!==Boolean(depositPaymentWindowMinutes)){
      throw new BadRequestException('refundableDepositPaise and depositPaymentWindowMinutes must be configured together');
    }
    return {
      minAdvanceMinutes: this.optionalPolicyInteger(source.minAdvanceMinutes, 'minAdvanceMinutes', 0),
      maxAdvanceDays: this.optionalPolicyInteger(source.maxAdvanceDays, 'maxAdvanceDays', 1),
      maxFutureBookingsPerUnit: this.optionalPolicyInteger(source.maxFutureBookingsPerUnit, 'maxFutureBookingsPerUnit', 1),
      maxBookingsPerDayPerUnit: this.optionalPolicyInteger(source.maxBookingsPerDayPerUnit, 'maxBookingsPerDayPerUnit', 1),
      cooldownMinutes: this.optionalPolicyInteger(source.cooldownMinutes, 'cooldownMinutes', 0),
      cancellationCutoffMinutes: this.optionalPolicyInteger(source.cancellationCutoffMinutes, 'cancellationCutoffMinutes', 0),
      checkInOpenMinutesBefore: this.optionalPolicyInteger(source.checkInOpenMinutesBefore, 'checkInOpenMinutesBefore', 0),
      noShowGraceMinutes: this.optionalPolicyInteger(source.noShowGraceMinutes, 'noShowGraceMinutes', 0),
      noShowRestrictionCount,
      noShowLookbackDays,
      noShowBlockDays,
      refundableDepositPaise:depositEnabled?refundableDepositPaise:undefined,
      depositPaymentWindowMinutes:depositEnabled?depositPaymentWindowMinutes:undefined,
      maxGuestsPerBooking: this.optionalPolicyInteger(source.maxGuestsPerBooking, 'maxGuestsPerBooking', 0, 50),
      conflictGroup: this.optionalConflictGroup(source.conflictGroup),
      pricingBands: this.parsePricingBands(source.pricingBands),
    };
  }

  scheduleObject(value:unknown):Record<string,unknown>{
    if(!value||typeof value!=='object'||Array.isArray(value)) return {};
    return value as Record<string,unknown>;
  }

  scheduleBlackouts(value:unknown):AmenityBlackoutWindow[]{
    const source=this.scheduleObject(value);
    const raw=source.blackouts;
    if(!Array.isArray(raw)) return [];
    return raw.flatMap(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item)) return [];
      const candidate=item as Record<string,unknown>;
      if(typeof candidate.start!=='string'||typeof candidate.end!=='string') return [];
      const start=new Date(candidate.start),end=new Date(candidate.end);
      if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end) return [];
      const kind=typeof candidate.kind==='string'&&['MAINTENANCE','CLOSURE','PRIVATE_EVENT'].includes(candidate.kind)
        ? candidate.kind as AmenityBlackoutWindow['kind']
        : 'MAINTENANCE';
      return [{start:start.toISOString(),end:end.toISOString(),reason:typeof candidate.reason==='string'?candidate.reason:undefined,kind}];
    });
  }

  findScheduleBlackout(schedule:unknown,startsAt:Date,endsAt:Date){
    return this.scheduleBlackouts(schedule).find(item=>{
      const start=new Date(item.start),end=new Date(item.end);
      return startsAt<end&&endsAt>start;
    })??null;
  }

  assertScheduleWindowOpen(schedule:unknown,startsAt:Date,endsAt:Date){
    const blackout=this.findScheduleBlackout(schedule,startsAt,endsAt);
    if(blackout){
      throw new ConflictException(`Amenity is unavailable during the configured ${(blackout.kind??'MAINTENANCE').toLowerCase().replaceAll('_',' ')} window`);
    }
    const weekly=this.scheduleWeekly(schedule);
    if(weekly&&!this.isWeeklyOperatingWindowOpen(schedule,startsAt,endsAt)){
      const istStart=new Date(startsAt.getTime()+330*60*1000);
      const istEnd=new Date(endsAt.getTime()+330*60*1000);
      if(istStart.getUTCFullYear()!==istEnd.getUTCFullYear()||istStart.getUTCMonth()!==istEnd.getUTCMonth()||istStart.getUTCDate()!==istEnd.getUTCDate()) throw new ConflictException('Amenity booking must fit within one India-local operating day');
      const windows=weekly[this.indiaDayKey(istStart)]??[];
      if(!windows.length) throw new ConflictException('Amenity is closed for the requested India-local day');
      throw new ConflictException('Amenity request is outside configured operating hours');
    }
  }

  scheduleWeekly(value:unknown):AmenityWeeklySchedule|null{
    const raw=this.scheduleObject(value).weekly;
    if(raw===undefined||raw===null) return null;
    if(typeof raw!=='object'||Array.isArray(raw)) return null;
    const source=raw as Record<string,unknown>;
    const result:AmenityWeeklySchedule={};
    for(const day of ['mon','tue','wed','thu','fri','sat','sun'] as const){
      const items=source[day];
      if(items===undefined){result[day]=[];continue}
      if(!Array.isArray(items)){result[day]=[];continue}
      result[day]=items.flatMap(item=>{
        if(!item||typeof item!=='object'||Array.isArray(item)) return [];
        const candidate=item as Record<string,unknown>;
        if(typeof candidate.start!=='string'||typeof candidate.end!=='string') return [];
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.end)||candidate.start>=candidate.end) return [];
        return [{start:candidate.start,end:candidate.end}];
      });
    }
    return result;
  }

  normalizeWeeklySchedule(value:Record<string,unknown>|null):AmenityWeeklySchedule|null{
    if(value===null) return null;
    const days=['mon','tue','wed','thu','fri','sat','sun'] as const;
    const allowed=new Set<string>(days);
    for(const key of Object.keys(value)) if(!allowed.has(key)) throw new BadRequestException(`Unsupported amenity weekday key: ${key}`);
    const normalized=this.scheduleWeekly({weekly:value});
    if(!normalized) throw new BadRequestException('Amenity schedule.weekly must be an object');
    for(const day of days){
      const raw=value[day];
      if(raw===undefined) throw new BadRequestException(`Operating hours must explicitly include ${day}`);
      if(!Array.isArray(raw)) throw new BadRequestException(`Amenity schedule day ${day} must be an array`);
      if((normalized[day]??[]).length!==raw.length) throw new BadRequestException(`Amenity schedule day ${day} contains an invalid HH:MM operating window`);
    }
    return normalized;
  }

  isWeeklyOperatingWindowOpen(schedule:unknown,startsAt:Date,endsAt:Date){
    const weekly=this.scheduleWeekly(schedule);
    if(!weekly) return true;
    const localStart=new Date(startsAt.getTime()+330*60*1000),localEnd=new Date(endsAt.getTime()+330*60*1000);
    if(localStart.getUTCFullYear()!==localEnd.getUTCFullYear()||localStart.getUTCMonth()!==localEnd.getUTCMonth()||localStart.getUTCDate()!==localEnd.getUTCDate()) return false;
    const windows=weekly[this.indiaDayKey(localStart)]??[];
    const startMinute=localStart.getUTCHours()*60+localStart.getUTCMinutes();
    const endMinute=localEnd.getUTCHours()*60+localEnd.getUTCMinutes();
    return windows.some(window=>startMinute>=this.hhmmToMinute(window.start)&&endMinute<=this.hhmmToMinute(window.end));
  }

  validateGuestCount(rules:AmenityBookingRules,guestCount:number){
    if(!Number.isInteger(guestCount)||guestCount<0||guestCount>50){
      throw new BadRequestException('guestCount must be an integer between 0 and 50');
    }
    const allowed=rules.maxGuestsPerBooking??0;
    if(guestCount>allowed){
      if(allowed===0) throw new BadRequestException('Guests are not enabled for this amenity');
      throw new BadRequestException(`This amenity allows at most ${allowed} guest${allowed===1?'':'s'} per booking`);
    }
  }

  resolveBookingFee(baseFeePaise:number,rules:AmenityBookingRules,startsAt:Date){
    const bands=rules.pricingBands??[];
    if(!bands.length) return baseFeePaise;
    const ist=new Date(startsAt.getTime()+330*60*1000);
    const day=ist.getUTCDay();
    const minute=ist.getUTCHours()*60+ist.getUTCMinutes();
    const band=bands.find(item=>item.daysOfWeek.includes(day)&&minute>=item.startMinute&&minute<item.endMinute);
    return band?.feePaise??baseFeePaise;
  }

  private indiaDayKey(value:Date):keyof AmenityWeeklySchedule{
    switch(value.getUTCDay()){
      case 0:return 'sun';case 1:return 'mon';case 2:return 'tue';case 3:return 'wed';
      case 4:return 'thu';case 5:return 'fri';default:return 'sat';
    }
  }

  private hhmmToMinute(value:string){
    const [hour,minute]=value.split(':').map(Number);
    return hour*60+minute;
  }

  private optionalConflictGroup(value:unknown){
    if(value===undefined||value===null||value==='') return undefined;
    if(typeof value!=='string') throw new BadRequestException('conflictGroup must be a string');
    const normalized=value.trim().toUpperCase();
    if(normalized.length<2||normalized.length>64||!/^[A-Z0-9_-]+$/.test(normalized)){
      throw new BadRequestException('conflictGroup must be 2-64 letters, numbers, underscores or hyphens');
    }
    return normalized;
  }

  private parsePricingBands(value:unknown):AmenityPricingBand[]|undefined{
    if(value===undefined||value===null) return undefined;
    if(!Array.isArray(value)||value.length>12) throw new BadRequestException('pricingBands must be an array of at most 12 time bands');
    const bands=value.map((item,index)=>{
      if(!item||typeof item!=='object'||Array.isArray(item)) throw new BadRequestException(`pricingBands[${index}] must be an object`);
      const source=item as Record<string,unknown>;
      const startMinute=this.optionalPolicyInteger(source.startMinute,`pricingBands[${index}].startMinute`,0);
      const endMinute=this.optionalPolicyInteger(source.endMinute,`pricingBands[${index}].endMinute`,1);
      const feePaise=this.optionalPolicyInteger(source.feePaise,`pricingBands[${index}].feePaise`,0);
      if(startMinute===undefined||endMinute===undefined||feePaise===undefined||startMinute>1439||endMinute>1440||endMinute<=startMinute){
        throw new BadRequestException(`pricingBands[${index}] requires 0-1439 startMinute, 1-1440 endMinute and end after start`);
      }
      const rawDays=source.daysOfWeek;
      if(rawDays!==undefined&&!Array.isArray(rawDays)) throw new BadRequestException(`pricingBands[${index}].daysOfWeek must be an array`);
      const days=(rawDays===undefined?[0,1,2,3,4,5,6]:rawDays as unknown[]).map(day=>{
        if(!Number.isInteger(day)||(day as number)<0||(day as number)>6) throw new BadRequestException(`pricingBands[${index}].daysOfWeek values must be integers 0-6`);
        return day as number;
      });
      if(new Set(days).size!==days.length) throw new BadRequestException(`pricingBands[${index}].daysOfWeek cannot contain duplicates`);
      const label=source.label===undefined?undefined:String(source.label).trim();
      if(label&&label.length>80) throw new BadRequestException(`pricingBands[${index}].label is too long`);
      return {label:label||undefined,daysOfWeek:days,startMinute,endMinute,feePaise};
    });
    for(let i=0;i<bands.length;i++){
      for(let j=i+1;j<bands.length;j++){
        const sharedDay=bands[i].daysOfWeek.some(day=>bands[j].daysOfWeek.includes(day));
        const overlaps=sharedDay&&bands[i].startMinute<bands[j].endMinute&&bands[i].endMinute>bands[j].startMinute;
        if(overlaps) throw new BadRequestException('pricingBands cannot overlap on the same day');
      }
    }
    return bands;
  }

  private optionalPolicyInteger(value: unknown, field: string, minimum: number, maximum?: number) {
    if (value === undefined || value === null) return undefined;
    if (!Number.isInteger(value) || (value as number) < minimum || (maximum !== undefined && (value as number) > maximum)) {
      const range=maximum===undefined?`greater than or equal to ${minimum}`:`between ${minimum} and ${maximum}`;
      throw new BadRequestException(`${field} must be an integer ${range}`);
    }
    return value as number;
  }
}
