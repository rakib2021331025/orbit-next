import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/** Next's own rule sets: React, hooks, a11y basics, Core Web Vitals, TypeScript. */
export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts', 'tools/loadtest/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
