const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const dbContent = fs.readFileSync(path.join(__dirname, 'js', 'db.js'), 'utf8')
  .replace(/^\s*export\s+/gm, '');

const iconsContent = fs.readFileSync(path.join(__dirname, 'js', 'icons.js'), 'utf8')
  .replace(/^\s*export\s+/gm, '');

let appContent = fs.readFileSync(path.join(__dirname, 'js', 'app.js'), 'utf8')
  .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/db\.js['"];?/g, '')
  .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/icons\.js['"];?/g, '')
  .replace(/^\s*export\s+/gm, '');

const bundle = `/**
 * InvoiceCraft Standalone Bundle v${pkg.version}
 * 100% Client-Side Plug-and-Play (Runs on both http:// and file://)
 */
(function() {
  'use strict';

  // --- 1. IndexedDB Engine ---
  ${dbContent}

  // --- 2. Icon Library & Monogram Generator ---
  ${iconsContent}

  // --- 3. App Controller ---
  ${appContent}

})();
`;

// Validate that bundle has valid JavaScript syntax inside an IIFE function
try {
  new Function(bundle);
} catch (err) {
  console.error('BUNDLE VALIDATION ERROR:', err.message);
  process.exit(1);
}

// Fail loudly if any ES module syntax survived stripping (would break file:// bundle)
const leftover = bundle.match(/^\s*(import|export)\s/m);
if (leftover) {
  console.error('BUNDLE VALIDATION ERROR: leftover ES module keyword "' + leftover[1] + '" — check build.js stripping rules.');
  process.exit(1);
}

fs.writeFileSync(path.join(__dirname, 'js', 'bundle.js'), bundle, 'utf8');
console.log('Successfully generated js/bundle.js');
