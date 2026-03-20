import { describe, it, expect } from 'vitest';
import { categorize, isPermissive, isCopyleft, isRawPackageJson } from '../../../src/analyzers/licenses/utils';
import { LicenseCategory } from '../../../src/types';

// ---------------------------------------------------------------------------
// categorize
// ---------------------------------------------------------------------------

describe('categorize', () => {
  describe('permissive licenses', () => {
    it.each([
      'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause',
      'Apache-2.0', 'CC0-1.0', 'Unlicense', '0BSD',
    ])('%s → Permissive', (license) => {
      expect(categorize(license)).toBe(LicenseCategory.Permissive);
    });
  });

  describe('copyleft licenses', () => {
    it.each([
      'GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-3.0-or-later',
      'LGPL-2.1', 'LGPL-3.0', 'LGPL-2.1-only',
      'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
    ])('%s → Copyleft', (license) => {
      expect(categorize(license)).toBe(LicenseCategory.Copyleft);
    });
  });

  describe('unknown licenses', () => {
    it.each([
      'UNKNOWN', 'PROPRIETARY', 'SEE LICENSE IN LICENSE.md',
      'CUSTOM', '', 'CC-BY-4.0',
    ])('%s → Unknown', (license) => {
      expect(categorize(license)).toBe(LicenseCategory.Unknown);
    });
  });

  it('is case-sensitive — lowercase mit is Unknown', () => {
    expect(categorize('mit')).toBe(LicenseCategory.Unknown);
  });
});

// ---------------------------------------------------------------------------
// isPermissive
// ---------------------------------------------------------------------------

describe('isPermissive', () => {
  it('returns true for MIT', () => { expect(isPermissive('MIT')).toBe(true); });
  it('returns true for Apache-2.0', () => { expect(isPermissive('Apache-2.0')).toBe(true); });
  it('returns false for GPL-3.0', () => { expect(isPermissive('GPL-3.0')).toBe(false); });
  it('returns false for unknown license', () => { expect(isPermissive('UNKNOWN')).toBe(false); });
});

// ---------------------------------------------------------------------------
// isCopyleft
// ---------------------------------------------------------------------------

describe('isCopyleft', () => {
  it('returns true for GPL-2.0', () => { expect(isCopyleft('GPL-2.0')).toBe(true); });
  it('returns true for AGPL-3.0', () => { expect(isCopyleft('AGPL-3.0')).toBe(true); });
  it('returns true for LGPL-3.0', () => { expect(isCopyleft('LGPL-3.0')).toBe(true); });
  it('returns false for MIT', () => { expect(isCopyleft('MIT')).toBe(false); });
  it('returns false for unknown license', () => { expect(isCopyleft('PROPRIETARY')).toBe(false); });
});

// ---------------------------------------------------------------------------
// isRawPackageJson
// ---------------------------------------------------------------------------

describe('isRawPackageJson', () => {
  it('returns true for a plain object', () => {
    expect(isRawPackageJson({ version: '1.0.0', license: 'MIT' })).toBe(true);
  });

  it('returns true for an empty object', () => {
    expect(isRawPackageJson({})).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRawPackageJson(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRawPackageJson('MIT')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRawPackageJson(42)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRawPackageJson(undefined)).toBe(false);
  });

  it('returns false for a boolean', () => {
    expect(isRawPackageJson(true)).toBe(false);
  });
});
