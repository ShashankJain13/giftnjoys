// Bundles Lambda handlers into dist/<name>/index.mjs (zipped by Terraform).
import { build } from 'esbuild';

await build({
  entryPoints: { 'admin-api/index': 'src/lambda.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  sourcemap: 'linked',
  outExtension: { '.js': '.mjs' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
