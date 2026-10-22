import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('⚡ Building PinBoardTV Backend Lambda functions with esbuild...');

try {
  await esbuild.build({
    entryPoints: {
      http: 'src/handlers/http.ts',
      websocket: 'src/handlers/websocket.ts',
      alexa: 'src/handlers/alexa.ts',
    },
    outdir: 'dist',
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    banner: {
      js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
    },
    sourcemap: true,
    minify: false,
    external: [],
  });

  // Ensure package.json with {"type": "module"} exists in dist/ for AWS Lambda ESM support
  fs.writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2)
  );

  console.log('✅ Backend build successful! Output written to backend/dist/');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
