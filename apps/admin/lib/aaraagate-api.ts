import { createAaraagateApiClient } from '@aaraagate/api-client';
import { AARAAGATE_ADMIN_SESSION_KEY } from '@aaraagate/config';
import type { AdminSession } from '@aaraagate/types';

export type { AdminSession };

const request=createAaraagateApiClient(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000');

export function getAdminSession():AdminSession|null{
  if(typeof window==='undefined')return null;
  try{
    const raw=sessionStorage.getItem(AARAAGATE_ADMIN_SESSION_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as Partial<AdminSession>;
    if(!parsed.accessToken||!parsed.role)return null;
    return {accessToken:parsed.accessToken,role:parsed.role,societyName:parsed.societyName};
  }catch{return null}
}

export function adminApi<T>(session:Pick<AdminSession,'accessToken'>,path:string,init:RequestInit={}):Promise<T>{
  return request<T>(path,{...init,accessToken:session.accessToken});
}
