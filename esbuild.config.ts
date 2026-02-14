import * as path from 'node:path';
import { build } from 'esbuild';

const src = path.resolve('src');

build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: 'dist/index.js',
  sourcemap: true,
  alias: {
    '@application': path.join(src, 'application'),
    '@config': path.join(src, 'config'),
    '@domain': path.join(src, 'domain'),
    '@i18n': path.join(src, 'i18n', 'index.ts'),
    '@infrastructure': path.join(src, 'infrastructure'),
    '@presentation': path.join(src, 'presentation'),
  },
});
