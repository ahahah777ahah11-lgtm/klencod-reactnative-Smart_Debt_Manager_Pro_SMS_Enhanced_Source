const path = require('path');
const fs = require('fs');

// Mock browser globals for Node test environment
global.window = global;
global.localStorage = (function() {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
})();

// Load modules in order
const modules = [
  'js/storage.js',
  'js/validation.js',
  'js/database.js',
  'js/customers.js',
  'js/transactions.js',
  'js/remittances.js',
  'js/sms.js',
  'js/notification-scheduler.js',
  'js/reports.js',
  'js/backup.js',
  'js/import-csv.js',
  'js/universal-importer.js',
  'js/assistant.js',
  'js/settings.js',
  'js/tests.js'
];

for (const m of modules) {
  const code = fs.readFileSync(path.join(__dirname, 'app/src/main/assets/smart-debt', m), 'utf8');
  eval(code);
}

// Run test suite
console.log('Running Accounting & Storage Automated Test Suite...');
const results = AccountingTestSuite.runAllTests();

let passed = 0;
let failed = 0;

results.forEach(r => {
  const status = r.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - [${r.id}] ${r.name}`);
  if (!r.passed) {
    console.log(`   Steps: ${r.steps}`);
    console.log(`   Expected: ${r.expected}`);
    console.log(`   Actual: ${r.actual}`);
    failed++;
  } else {
    passed++;
  }
});

console.log('--------------------------------------------------');
console.log(`Total tests: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED WITH 100% ACCOUNTING ACCURACY! 🎉');
}
