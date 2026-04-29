import { execSync } from 'child_process';
import { join } from 'path';

const backendRoot = join(__dirname, '..');

const files = [
  'supportAgent.ts',
  'researchAgent.ts',
  'plannerAgent.ts',
  'opsAgent.ts',
  'marketAgent.ts',
  'coordinatorAgent.ts',
];

for (const file of files) {
  console.log(`\n=== Running ${file} ===`);
  execSync(`npx tsx examples/${file}`, {
    stdio: 'inherit',
    cwd: backendRoot,
    env: process.env,
  });
}
