import { createHash } from 'node:crypto';

export const operationalPerformance = Object.freeze({
  userId:'11111111-1111-4111-8111-111111119902',
  membershipId:'88888888-8888-4888-8888-888888889902',
  sessionId:'22222222-2222-4222-8222-222222229902',
  accessToken:'aaraagate-perf-operations-access-token-local-ci',
  refreshToken:'aaraagate-perf-operations-refresh-token-local-ci',
  requestPrefix:'aaraagate-perf-occupancy-',
  documentPrefix:'aaraagate-perf-document-',
  requestCount:5000,
  documentCount:2000,
  requestId:createHash('md5').update('aaraagate-perf-occupancy-1').digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'),
});
