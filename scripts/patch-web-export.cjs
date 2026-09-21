/** Expo's static index.html loads the bundle as a classic script. Zustand
 * (and similar) still emit import.meta, which browsers refuse outside a module
 * and the app never mounts. Mark the entry as type=module. */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('patch-web-export: missing dist/index.html');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const next = html.replace(
  /<script src="(\/_expo\/static\/js\/[^"]+\.js)" defer><\/script>/g,
  '<script type="module" src="$1"></script>',
);

if (next === html) {
  console.error('patch-web-export: no classic Expo entry script found');
  process.exit(1);
}

fs.writeFileSync(htmlPath, next);
console.log('patch-web-export: marked Expo entry as type=module');
