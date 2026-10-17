import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePartnerDomainHostname,
  assertPartnerDomainAvailable,
  resolveVerifiedPartnerDomainHost,
} from '../packages/config/src/partner-domain-contract.mjs';

const partnerA = '11111111-1111-4111-8111-111111111111';
const brandA = '22222222-2222-4222-8222-222222222222';
const record = (overrides={}) => ({
  hostname:'Society.Partner.CO.IN',partnerId:partnerA,brandId:brandA,
  status:'VERIFIED',verifiedAt:'2026-10-01T00:00:00Z',
  verifiedUntil:'2026-11-01T00:00:00Z',...overrides,
});

test('V5.4.2 normalizes ASCII and IDNA hostnames without changing ownership scope', () => {
  assert.equal(normalizePartnerDomainHostname('Society.Partner.CO.IN'),'society.partner.co.in');
  assert.equal(normalizePartnerDomainHostname('BÜCHER.IN'),'xn--bcher-kva.in');
  assert.equal(assertPartnerDomainAvailable('NEW.PARTNER.IN',[record()]),'new.partner.in');
});

test('denies URLs, ports, wildcards, IP addresses, spoofed hosts and invalid DNS labels', () => {
  for (const host of [
    'http://society.partner.in','society.partner.in:443','*.partner.in',
    '127.0.0.1','[::1]','localhost','a.local','site.internal','foo.test',
    'foo.invalid','bar.example','example.org','x.example.com',
    'society.partner.in@evil.com','society.partner.in/other',
    'society.partner.in?x=1','society.partner.in#frag',
    'society.partner.in,evil.com','society.partner.in\nX-Forwarded-Host:evil.com',
    '-bad.partner.in','bad-.partner.in','bad..partner.in','site.123',
    ' society.partner.in','society.partner.in ',
  ]) {
    assert.throws(()=>normalizePartnerDomainHostname(host),undefined,host);
  }
});

test('caller-configured canonical platform hostnames and subdomains remain reserved',()=>{
  const reservedHostnames=['aaraagate.in','portal.aaraagate.co.in'];
  assert.throws(()=>normalizePartnerDomainHostname('portal.aaraagate.co.in',{reservedHostnames}));
  assert.throws(()=>normalizePartnerDomainHostname('foo.portal.aaraagate.co.in',{reservedHostnames}));
  assert.throws(()=>normalizePartnerDomainHostname('aaraagate.in',{reservedHostnames}));
  assert.equal(normalizePartnerDomainHostname('ok.partner.in',{reservedHostnames}),'ok.partner.in');
});

test('duplicate ownership fails closed across status and case variants, including expired rows',()=>{
  for(const status of ['VERIFIED','PENDING','REVOKED','EXPIRED']){
    assert.throws(()=>assertPartnerDomainAvailable('society.partner.co.in',[record({status})]),/already registered/);
  }
  assert.throws(()=>assertPartnerDomainAvailable('ok.partner.in',[{hostname:null}]),/Invalid/);
});

test('only one exactly verified, unexpired registry row resolves to presentation candidates',()=>{
  const now='2026-10-13T00:00:00Z', registry=[record()];
  assert.deepEqual(resolveVerifiedPartnerDomainHost('SOCIETY.PARTNER.CO.IN',registry,now),
    {hostname:'society.partner.co.in',partnerId:partnerA,brandId:brandA});
  assert.equal(resolveVerifiedPartnerDomainHost('unknown.partner.in',registry,now),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in:443',registry,now),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[record({status:'PENDING'})],now),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[record({status:'REVOKED'})],now),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[record({brandId:'invalid'})],now),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[record({verifiedAt:'2026-10-14T00:00:00Z'})],now),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',registry,'2026-11-01T00:00:00Z'),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[record(),record()],now),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',registry,'2026-02-30T00:00:00Z'),null);
});

test('resolver has no headers, URLs, DNS or authority side effects and rejects malformed registry',()=>{
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[null],'2026-10-13T00:00:00Z'),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[{hostname:3}],'2026-10-13T00:00:00Z'),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[record({verifiedUntil:'not-a-date'})],'2026-10-13T00:00:00Z'),null);
  assert.equal(resolveVerifiedPartnerDomainHost('society.partner.co.in',[record()], '2026-10-13T00:00:00Z',{reservedHostnames:['partner.co.in']}),null);
});
