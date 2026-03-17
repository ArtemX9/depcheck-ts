import { describe, it, expect } from 'vitest';
import { extractPackageName } from '../../src/utils/packageName';

describe('extractPackageName', () => {
  describe('regular (unscoped) packages', () => {
    it('returns the package name as-is when there is no subpath', () => {
      expect(extractPackageName('lodash')).toBe('lodash');
    });

    it('returns the package name as-is for another bare import', () => {
      expect(extractPackageName('react')).toBe('react');
    });

    it('strips a single-level subpath', () => {
      expect(extractPackageName('lodash/debounce')).toBe('lodash');
    });

    it('strips a multi-level deep subpath', () => {
      expect(extractPackageName('lodash/fp/debounce')).toBe('lodash');
    });

    it('strips a deeply nested subpath', () => {
      expect(extractPackageName('some-pkg/a/b/c/d')).toBe('some-pkg');
    });
  });

  describe('scoped packages', () => {
    it('returns the full scoped name when there is no subpath', () => {
      expect(extractPackageName('@babel/core')).toBe('@babel/core');
    });

    it('returns the full scoped name for another scoped package', () => {
      expect(extractPackageName('@types/node')).toBe('@types/node');
    });

    it('strips a single-level subpath from a scoped package', () => {
      expect(extractPackageName('@babel/core/lib/thing')).toBe('@babel/core');
    });

    it('strips a multi-level deep subpath from a scoped package', () => {
      expect(extractPackageName('@org/pkg/a/b/c')).toBe('@org/pkg');
    });
  });

  describe('edge cases', () => {
    it('returns an empty string for an empty input', () => {
      expect(extractPackageName('')).toBe('');
    });

    it('returns an empty string when the input is a bare slash', () => {
      // split('/')[0] on '/' is '', so both code paths return ''
      expect(extractPackageName('/')).toBe('');
    });

    it('handles a trailing slash on an unscoped package', () => {
      // 'react/' → split('/')[0] → 'react'
      expect(extractPackageName('react/')).toBe('react');
    });

    it('returns just the scope segment when input is only a scope (no package name)', () => {
      // '@org' has no '/' so split gives ['@org'], slice(0,2) → ['@org'], join → '@org'
      expect(extractPackageName('@org')).toBe('@org');
    });

    it('handles node: built-in prefixed strings as a plain unscoped string', () => {
      // The function does not special-case node: prefixes — it treats them as unscoped
      expect(extractPackageName('node:fs')).toBe('node:fs');
    });

    it('handles node: built-in with subpath as an unscoped package', () => {
      expect(extractPackageName('node:fs/promises')).toBe('node:fs');
    });

    it('handles a relative path starting with ./ by returning the first segment', () => {
      // Not a valid npm import, but the function must not throw
      expect(extractPackageName('./utils/helper')).toBe('.');
    });

    it('handles a relative path starting with ../', () => {
      expect(extractPackageName('../utils/helper')).toBe('..');
    });
  });
});
