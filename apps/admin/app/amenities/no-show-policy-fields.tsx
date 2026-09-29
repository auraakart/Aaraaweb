'use client'

import type { CSSProperties } from 'react'

type NoShowPolicyFieldsProps={
  restrictionCount:string;
  lookbackDays:string;
  blockDays:string;
  onRestrictionCountChange:(value:string)=>void;
  onLookbackDaysChange:(value:string)=>void;
  onBlockDaysChange:(value:string)=>void;
  inputStyle:CSSProperties;
};

export function NoShowPolicyFields({
  restrictionCount,
  lookbackDays,
  blockDays,
  onRestrictionCountChange,
  onLookbackDaysChange,
  onBlockDaysChange,
  inputStyle,
}:NoShowPolicyFieldsProps){
  return <>
    <label>No-show threshold<input type="number" min="1" max="10" value={restrictionCount} onChange={event=>onRestrictionCountChange(event.target.value)} placeholder="Disabled" style={inputStyle}/></label>
    <label>No-show lookback (days)<input type="number" min="1" max="365" value={lookbackDays} onChange={event=>onLookbackDaysChange(event.target.value)} placeholder="Disabled" style={inputStyle}/></label>
    <label>No-show booking pause (days)<input type="number" min="1" max="365" value={blockDays} onChange={event=>onBlockDaysChange(event.target.value)} placeholder="Disabled" style={inputStyle}/></label>
  </>;
}
