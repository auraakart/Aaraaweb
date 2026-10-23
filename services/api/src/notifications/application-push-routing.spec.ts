import { describe,expect,it } from 'vitest';
import { applicationPushRoutes,applicationPushProject } from './application-push-routing';
const id='11111111-1111-4111-8111-111111111111';
const route={applicationId:id,projectId:'partner-project-a',credentialsEnv:'AARAGATE_TEST_FIREBASE_A'};
const env={NODE_ENV:'test',AARAGATE_ENABLE_TEST_APP_SESSIONS:'true',AARAGATE_TEST_PUSH_APPLICATIONS_JSON:JSON.stringify([route])};
describe('application push project boundaries',()=>{
 it('never enables routes in production or without explicit TEST activation',()=>{
  expect(applicationPushRoutes({...env,NODE_ENV:'production'})).toEqual([]);
  expect(applicationPushRoutes({...env,AARAGATE_ENABLE_TEST_APP_SESSIONS:'false'})).toEqual([]);
 });
 it('maps only one exact application/project and never falls back',()=>{
  const routes=applicationPushRoutes(env);
  expect(applicationPushProject(routes,id,route.projectId)).toEqual(route);
  expect(()=>applicationPushProject(routes,id,'foreign-project')).toThrow();
  expect(()=>applicationPushProject(routes,'22222222-2222-4222-8222-222222222222')).toThrow();
 });
 it('rejects duplicate routes, inline credentials and arbitrary environment lookups',()=>{
  for(const routes of [[route,route],[{...route,privateKey:'forbidden'}],[{...route,credentialsEnv:'DATABASE_URL'}]])
   expect(()=>applicationPushRoutes({...env,AARAGATE_TEST_PUSH_APPLICATIONS_JSON:JSON.stringify(routes)})).toThrow();
 });
});
