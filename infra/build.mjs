// Bundles mcp/lambda.ts into infra/build/lambda.mjs for SAM. The AWS SDK is left out: the
// nodejs22.x runtime ships it.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync(new URL('./build', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: ['mcp/lambda.ts'],
  outfile: 'infra/build/lambda.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@aws-sdk/*'],
  // Some bundled CommonJS dependencies call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});
