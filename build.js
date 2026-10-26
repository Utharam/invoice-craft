/**
 * InvoiceCraft bundle builder
 * Concatenates the explicit ordered module list into one classic IIFE so the
 * app keeps working from file:// with no ES module/CORS requirements.
 */
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const MODULES = [
  { file: 'calc.js', label: 'Shared Calculation & Currency' },
  { file: 'numbering.js', label: 'Independent Document Numbering' },
  { file: 'catalog.js', label: 'Saved Item Library' },
  { file: 'db.js', label: 'IndexedDB Engine' },
  { file: 'icons.js', label: 'Icon Library & Monogram Generator' },
  { file: 'lifecycle.js', label: 'Conversion & Duplicate Lifecycle' },
  { file: 'reports.js', label: 'Reporting Engine' },
  { file: 'report-ui.js', label: 'Reports View' },
  { file: 'shell.js', label: 'App Shell, Home & Settings' },
  { file: 'app.js', label: 'App Controller' }
];

function fail(message) {
  console.error('BUNDLE BUILD ERROR: ' + message);
  process.exit(1);
}

function stripModuleSyntax(source, filename) {
  let out = source;

  // remove `import ... from '...'` (including multiline brace lists)
  out = out.replace(/^[ \t]*import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"];?[ \t]*$/gm, '');
  // remove re-exports and export lists
  out = out.replace(/^[ \t]*export\s*\{[\s\S]*?\}[ \t]*(?:from\s*['"][^'"]+['"])?;?[ \t]*$/gm, '');
  out = out.replace(/^[ \t]*export\s*\*\s*from\s*['"][^'"]+['"];?[ \t]*$/gm, '');
  // strip the export keyword from declarations / default exports
  out = out.replace(/^[ \t]*export\s+default\s+/gm, '');
  out = out.replace(/^([ \t]*)export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '$1');

  if (/^[ \t]*(?:import|export)\s/m.test(out)) {
    const offending = out.match(/^[ \t]*(?:import|export)\s.*$/m);
    fail(`leftover ES module syntax in js/${filename}: ${offending ? offending[0].trim() : 'import/export'}`);
  }
  return out;
}

const missing = MODULES
  .map(module => module.file)
  .filter(file => !fs.existsSync(path.join(__dirname, 'js', file)));

if (missing.length > 0) {
  fail('missing expected module(s): ' + missing.join(', ') + '. Stream A modules must exist before the bundle can be built.');
}

const sections = MODULES.map((module, index) => {
  const fullPath = path.join(__dirname, 'js', module.file);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const stripped = stripModuleSyntax(raw, module.file);
  return `  // --- ${index + 1}. ${module.label} ---\n\n${stripped.trim()}\n`;
});

const bundle = `/**
 * InvoiceCraft Standalone Bundle v${pkg.version}
 * 100% Client-Side Plug-and-Play (Runs on both http:// and file://)
 */
(function() {
  'use strict';

${sections.join('\n')}
})();
`;

try {
  new Function(bundle);
} catch (err) {
  fail('generated bundle is not valid JavaScript: ' + err.message);
}

const leftover = bundle.match(/^[ \t]*(import|export)\s/m);
if (leftover) {
  fail(`leftover ES module keyword "${leftover[1]}" survived stripping.`);
}

const expectedModules = MODULES.map(module => module.file).join(', ');
fs.writeFileSync(path.join(__dirname, 'js', 'bundle.js'), bundle, 'utf8');
console.log('Successfully generated js/bundle.js v' + pkg.version);
console.log('Modules: ' + expectedModules);
