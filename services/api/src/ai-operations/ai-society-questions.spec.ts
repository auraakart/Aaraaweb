import { describe, expect, it } from 'vitest';
import { isSocietyKnowledgeQuestion } from './ai-society-questions';

describe('V4.90.13 grounded society visitor/parking question routing', () => {
  it.each([
    'Can guests park overnight?',
    'Can visitors stay overnight?',
    'Are visitors allowed to park in the community?',
    'Is overnight parking allowed for guests?',
    'Do visitors need overnight parking permission?',
    'What are visitor entry rules?',
  ])('sends public society rules question to authorized published knowledge: %s', question => {
    expect(isSocietyKnowledgeQuestion(question)).toBe(true);
  });

  it.each([
    'Where is my visitor pass?',
    'What is my visitor status?',
    'Is my parking slot available?',
    'Show our payments',
    'My guest is at the gate',
    'Can I see my vehicle registration?',
  ])('does not promote private or live personal state to generic knowledge: %s', question => {
    expect(isSocietyKnowledgeQuestion(question)).toBe(false);
  });

  it('does not create a policy answer from a standalone parking term', () => {
    expect(isSocietyKnowledgeQuestion('parking')).toBe(false);
  });
});
