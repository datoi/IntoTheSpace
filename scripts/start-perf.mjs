// Start the dev server with the on-screen frame-time readout enabled.
//
// PERF_OVERLAY reads EXPO_PUBLIC_PERF_OVERLAY (see constants.ts), and setting an
// env var inline differs between shells — `VAR=1 npx expo start` is a parse
// error in PowerShell, which is what this repo is developed on. So it lives in
// a script instead of in a README nobody re-reads.
//
// Any extra arguments are passed through:
//
//   npm run start:perf
//   npm run start:perf -- --tunnel
//   npm run start:perf -- --clear
//
// --- Read the numbers with the right expectations ----------------------------
//
// This runs in a DEVELOPMENT bundle, so `react` is inflated by dev-mode React's
// bookkeeping and is NOT the number the shipped game has. What survives the
// distortion is the SHAPE: which of sim / react / rest dominates, and how each
// moves between two runs. For absolute figures you need a release build
// (`eas build --profile perf`).

import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const usingTunnel = args.includes('--tunnel');

console.log('\n  Frame-time overlay: ON  (EXPO_PUBLIC_PERF_OVERLAY=1)');
console.log('  Bundle: development — `react` reads high here; compare runs, not absolutes.\n');

if (usingTunnel) {
  console.log('  ⚠  --tunnel routes every asset fetch through a relay on the public');
  console.log('     internet. Sprites and backgrounds load over HTTP from Metro in');
  console.log('     development, so a tunnel can look exactly like a rendering');
  console.log('     stutter. Prefer LAN (same Wi-Fi, no flag) when measuring.\n');
}

const child = spawn('npx', ['expo', 'start', ...args], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_PERF_OVERLAY: '1' },
});

child.on('exit', (code) => process.exit(code ?? 0));
