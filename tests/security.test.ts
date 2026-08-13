import { describe, expect, it } from 'vitest';
import { hashContent, hashSubject, timingSafeEqualString } from '@/server/security/hashing';
import { newOpaqueToken, newPublicId } from '@/server/security/tokens';

describe('hashContent', () => {
  it('is stable across key order', () => {
    expect(hashContent({ a: 1, b: [2, 3] })).toBe(hashContent({ b: [2, 3], a: 1 }));
  });

  it('changes when values change', () => {
    expect(hashContent({ a: 1 })).not.toBe(hashContent({ a: 2 }));
  });
});

describe('hashSubject', () => {
  it('separates parts unambiguously', () => {
    expect(hashSubject('ab', 'c')).not.toBe(hashSubject('a', 'bc'));
  });
});

describe('timingSafeEqualString', () => {
  it('compares equal and unequal strings', () => {
    expect(timingSafeEqualString('secret-value', 'secret-value')).toBe(true);
    expect(timingSafeEqualString('secret-value', 'other-value')).toBe(false);
    expect(timingSafeEqualString('', 'x')).toBe(false);
  });
});

describe('tokens', () => {
  it('public ids use the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = newPublicId();
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);
    }
  });

  it('opaque tokens are unique and url-safe', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const token = newOpaqueToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
  });
});
