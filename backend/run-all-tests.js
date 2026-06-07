#!/usr/bin/env node
// run-all-tests.js — runs each test file and prints a pass/fail summary

const { execFileSync } = require('child_process');
const path = require('path');

const suites = [
  'test-auth.js',
  'test-phase2a.js',
  'test-phase2c-fifo.js',
  'test-phase2d-forex.js',
  'test-phase3-landed-cost.js',
  'test-phase4-reports.js',
  'test-phase5-notifications.js',
];

const results = [];

for (const suite of suites) {
  process.stdout.write(`Running ${suite} ... `);
  try {
    const out = execFileSync(
      process.execPath, ['--test', path.join(__dirname, 'tests', suite)],
      { cwd: __dirname, timeout: 120000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const passMatch = out.match(/# pass (\d+)/);
    const failMatch = out.match(/# fail (\d+)/);
    const pass = passMatch ? parseInt(passMatch[1]) : 0;
    const fail = failMatch ? parseInt(failMatch[1]) : 0;
    results.push({ suite, pass, fail, ok: fail === 0 });
    console.log(fail === 0 ? `✓ ${pass}/${pass + fail}` : `✗ FAIL ${fail} (pass ${pass})`);
  } catch (err) {
    // execFileSync throws if exit code != 0 — still parse output
    const out = (err.stdout || '') + (err.stderr || '');
    const passMatch = out.match(/# pass (\d+)/);
    const failMatch = out.match(/# fail (\d+)/);
    const pass = passMatch ? parseInt(passMatch[1]) : 0;
    const fail = failMatch ? parseInt(failMatch[1]) : '?';
    results.push({ suite, pass, fail, ok: false, error: err.message });
    console.log(`✗ FAIL ${fail} (pass ${pass})`);
    // Print hook errors and failing test details
    const errLines = out.split('\n').filter(l =>
      l.startsWith('not ok') || l.trim().startsWith('error:') ||
      l.trim().startsWith('failureType:') || l.trim().startsWith('location:')
    );
    errLines.forEach(l => console.log('   ', l.trim()));
  }
}

console.log('\n========== SUMMARY ==========');
let totalPass = 0, totalFail = 0;
for (const r of results) {
  const icon = r.ok ? '✓' : '✗';
  console.log(`  ${icon} ${r.suite.padEnd(38)} ${r.ok ? `${r.pass} pass` : `${r.fail} FAIL / ${r.pass} pass`}`);
  totalPass += r.pass;
  totalFail += (typeof r.fail === 'number' ? r.fail : 1);
}
console.log(`\n  Total: ${totalPass} pass, ${totalFail} fail`);
process.exit(totalFail > 0 ? 1 : 0);
