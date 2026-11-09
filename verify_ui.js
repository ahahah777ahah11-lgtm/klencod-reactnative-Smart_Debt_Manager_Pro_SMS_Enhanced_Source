const fs = require('fs');
const path = require('path');
const root = __dirname;
const webRoot = path.join(root, 'smart-debt-manager-pro-sms');
const assetsRoot = path.join(root, 'app/src/main/assets/smart-debt');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const jsFiles = fs.readdirSync(path.join(webRoot, 'js')).filter(x => x.endsWith('.js'));
const js = jsFiles.map(x => fs.readFileSync(path.join(webRoot, 'js', x), 'utf8')).join('\n');
const methods = [...new Set([...html.matchAll(/onclick="App\.([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]))];
const missing = methods.filter(name => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !new RegExp(`\\b${escaped}\\s*[:=]\\s*(?:function|\\([^)]*\\)\\s*=>|async\\s*\\()`).test(js)
    && !new RegExp(`\\b${escaped}\\s*\\([^)]*\\)\\s*\\{`).test(js);
});
const unsynced = [];
for (const file of ['index.html', ...jsFiles.map(x => path.join('js', x))]) {
  const a = path.join(webRoot, file);
  const b = path.join(assetsRoot, file);
  if (!fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b))) unsynced.push(file);
}
console.log(`Interactive App handlers found: ${methods.length}`);
if (missing.length) { console.error('Missing handlers:', missing.join(', ')); process.exitCode = 1; }
else console.log('All inline App handlers have matching implementations.');
if (unsynced.length) { console.error('Web source / Android assets out of sync:', unsynced.join(', ')); process.exitCode = 1; }
else console.log('Web source and Android packaged assets are synchronized.');
