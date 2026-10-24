import { cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
await cp('dist', 'public', { recursive: true });
