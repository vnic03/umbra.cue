import { build } from 'esbuild';
import { cp } from 'node:fs/promises';

await build({
  entryPoints: ['src/content.ts', 'src/background.ts', 'src/popup.ts'],
  outdir: 'dist', bundle: true, format: 'iife', target: 'chrome110'
});
await cp('public', 'dist', { recursive: true });
