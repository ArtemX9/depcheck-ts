// E2E fixture source file.
// This file documents which packages are "used" in the fixture project.
// express and lodash are imported; chalk is intentionally NOT imported
// so it will appear as an unused dependency in integration tests.
//
// Note: these packages are not installed in this fixture — the unused
// analyzer is always mocked in the integration tests, so this file
// exists only to document the intended fixture scenario.

export const FIXTURE_NAME = 'e2e-fixture';
