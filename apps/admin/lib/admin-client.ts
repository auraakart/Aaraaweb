export type Session={
  sessionId:string;
  accessToken:string;
  refreshToken:string;
  societyId:string;
  role:string;
  societyName:string;
};

export type Membership={
  societyId:string;
  role:string;
  society?:{name?:string;code?:string};
};

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'');

export async function api<T>(path:string,init:RequestInit={},session?:Session):Promise<T>{
  const response=await fetch(`${base}/api/v1${path}`,{
    ...init,
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      ...(session?{Authorization:`Bearer ${session.accessToken}`}:{}),
      ...init.headers,
    },
  });
  const text=await response.text();
  const body=text?JSON.parse(text) as unknown:null;
  if(!response.ok){
    const message=body&&typeof body==='object'&&'message'in body
      ?String((body as {message:unknown}).message)
      :`Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function sessionFrom(value:Record<string,unknown>,membership:Membership):Session{
  const session=value.session as Record<string,unknown>|undefined;
  if(!session?.sessionId||!session.accessToken||!session.refreshToken){
    throw new Error('Authentication returned an incomplete session');
  }
  return {
    sessionId:String(session.sessionId),
    accessToken:String(session.accessToken),
    refreshToken:String(session.refreshToken),
    societyId:membership.societyId,
    role:membership.role,
    societyName:membership.society?.name??membership.society?.code??'Society',
  };
}
