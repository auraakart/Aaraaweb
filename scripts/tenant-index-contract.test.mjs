import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasSocietyLeadingKey } from './lib/tenant-index-contract.mjs';

test('recognizes actual society-leading primary, unique and ordinary index keys', () => {
  for (const body of [
    'societyId String @id @db.Uuid', 'societyId String? @unique @db.Uuid',
    'societyId String\n @@id([societyId, userId])',
    'societyId String\n @@unique([societyId, userId])',
    'societyId String\n @@index([societyId, status])',
  ]) assert.equal(hasSocietyLeadingKey(body), true, body);
});
test('rejects unindexed, non-leading, other-field and commented keys', () => {
  for (const body of [
    'societyId String', 'societyId String\n id String @id',
    'societyId String\n @@index([userId, societyId])',
    'societyId String\n @@id([userId, societyId])',
    'societyId String // @id', 'societyId String\n // @@index([societyId])',
    'societyId String\n /* @@unique([societyId]) */',
  ]) assert.equal(hasSocietyLeadingKey(body), false, body);
});
