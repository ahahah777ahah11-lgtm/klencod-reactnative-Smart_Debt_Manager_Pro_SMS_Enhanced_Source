const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'app/src/main/assets/smart-debt');

// 1. Read template.html
let html = fs.readFileSync(path.join(baseDir, 'template.html'), 'utf8');

// 2. Read and bundle CSS files
const cssFiles = [
  'css/styles.css',
  'css/themes.css',
  'css/responsive.css'
];

let bundledCss = '';
for (const file of cssFiles) {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    bundledCss += `\n/* =================== FILE: ${file} =================== */\n`;
    bundledCss += fs.readFileSync(filePath, 'utf8') + '\n';
  } else {
    console.warn(`CSS file missing: ${filePath}`);
  }
}

// Replace CSS <link> tags with inline <style>
const cssLinkRegex = /<link\s+rel="stylesheet"\s+href="[^"]+">(\r?\n)?/g;
html = html.replace(cssLinkRegex, '');
html = html.replace('</head>', `  <style>\n${bundledCss}  </style>\n</head>`);

// 3. Read and bundle JS files
const jsFiles = [
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
  'js/tests.js',
  'js/app.js'
];

let bundledJs = '';
for (const file of jsFiles) {
  const filePath = path.join(baseDir, file);
  if (fs.existsSync(filePath)) {
    bundledJs += `\n/* =================== MODULE: ${file} =================== */\n`;
    bundledJs += fs.readFileSync(filePath, 'utf8') + '\n';
  } else {
    console.warn(`JS file missing: ${filePath}`);
  }
}

// Replace JS <script src="..."> tags with single inline <script>
const jsScriptRegex = /<script\s+src="[^"]+"><\/script>(\r?\n)?/g;
html = html.replace(jsScriptRegex, '');
html = html.replace('</body>', `  <!-- Embedded All-In-One Scripts (Zero-Dependency Offline Bundle) -->\n  <script>\n${bundledJs}  </script>\n</body>`);

// 4. Output bundled index.html to all target locations
const targets = [
  path.join(__dirname, 'app/src/main/assets/smart-debt/index.html'),
  path.join(__dirname, 'smart-debt-manager-pro-sms/index.html'),
  path.join(__dirname, 'index.html')
];

for (const target of targets) {
  fs.writeFileSync(target, html, 'utf8');
  console.log(`Saved bundled HTML: ${target} (${(html.length / 1024).toFixed(1)} KB)`);
}

console.log('Bundling completed successfully!');
