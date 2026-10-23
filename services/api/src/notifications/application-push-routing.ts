export type ApplicationPushRoute = { applicationId: string; projectId: string; credentialsEnv: string };
/** Operator configuration only. Invalid/duplicate routes fail closed as a set. */
export function applicationPushRoutes(env: Record<string,string|undefined>): ApplicationPushRoute[] {
 if(!['test','development'].includes(env.NODE_ENV??'')||env.AARAGATE_ENABLE_TEST_APP_SESSIONS!=='true')return [];
 const raw=env.AARAGATE_TEST_PUSH_APPLICATIONS_JSON??'[]';
 if(raw.length>20000)throw new Error('Application push registry exceeds limit');
 const routes:unknown=JSON.parse(raw);
 if(!Array.isArray(routes)||routes.length>50)throw new Error('Invalid application push registry');
 const ids=new Set<string>();
 return routes.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='applicationId,credentialsEnv,projectId')throw new Error('Invalid application push route');
  const v=value as ApplicationPushRoute;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.applicationId)||
   !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(v.projectId)||!/^AARAGATE_TEST_FIREBASE_[A-Z0-9_]{1,80}$/.test(v.credentialsEnv)||ids.has(v.applicationId))throw new Error('Invalid or duplicate application push route');
  ids.add(v.applicationId);return {...v};
 });
}
export function applicationPushProject(routes:ApplicationPushRoute[],applicationId:string,storedProject?:string|null) {
 const matches=routes.filter(r=>r.applicationId===applicationId);
 if(matches.length!==1||storedProject&&storedProject!==matches[0].projectId)throw new Error('Application push project unavailable');
 return matches[0];
}
