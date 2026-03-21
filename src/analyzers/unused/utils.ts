import {CSS_IMPORT_RE, DYNAMIC_IMPORT_RE, IMPLICITLY_USED, IMPORT_FROM_RE, REQUIRE_RE} from './constants';

export function isImplicitlyUsed(name: string): boolean {
    if (IMPLICITLY_USED.has(name)) return true;
    // @types/* and scoped tooling packages are never flagged
    if (name.startsWith('@types/')) return true;
    if (name.startsWith('@typescript-eslint/')) return true;
    if (name.startsWith('@eslint/')) return true;
    // eslint configs and plugins — configured in .eslintrc, never imported
    if (name.startsWith('eslint-config-')) return true;
    if (name.startsWith('eslint-plugin-')) return true;
    // Storybook packages — configured in .storybook/, not imported in source
    if (name.startsWith('@storybook/')) return true;
    if (name.startsWith('@chromatic-com/')) return true;
    // Babel plugins and presets — configured in babel.config.*
    if (name.startsWith('babel-plugin-')) return true;
    if (name.startsWith('babel-preset-')) return true;
    if (name.startsWith('@babel/plugin-')) return true;
    if (name.startsWith('@babel/preset-')) return true;
    // Font packages — imported via CSS or index files not scanned here
    if (name.startsWith('@fontsource/')) return true;
    // Cypress plugins — loaded via cypress config, not imported in source
    if (name.startsWith('cypress-')) return true;
    // Prettier plugins — configured in prettier.config.*, never imported directly
    if (name.startsWith('prettier-plugin-')) return true;
    // Tailwind CSS ecosystem packages — configured in tailwind.config.*, not imported
    if (name.startsWith('@tailwindcss/')) return true;
    return false;
}

export function extractImportsFromSource(source: string): string[] {
    const specifiers: string[] = [];

    for (const re of [IMPORT_FROM_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE, CSS_IMPORT_RE]) {
        const cloned = new RegExp(re.source, re.flags);
        let match: RegExpExecArray | null;
        while ((match = cloned.exec(source)) !== null) {
            specifiers.push(match[1]);
        }
    }

    return specifiers;
}