#!/usr/bin/env node
/* Bundle the game into one self-contained HTML file (scripts and styles inlined).
 *   node tools/bundle.js [out.html] [--exclude id1,id2]   (default: GeometryDash.html in the current directory) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const exIdx = args.indexOf('--exclude');
// --exclude a,b  leaves out js/levels/a.js and js/levels/b.js (e.g. levels that are still being designed)
const exclude = exIdx >= 0 ? args.splice(exIdx, 2)[1].split(',').map((id) => `js/levels/${id}.js`) : [];
const out = path.resolve(args[0] || 'GeometryDash.html');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '').replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)" \/>/g, (m, f) => `<style>\n${fs.readFileSync(path.join(ROOT, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, f) => {
  if (exclude.includes(f)) return '';
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/<\/script/i.test(src)) throw new Error(f + ' contains </script>');
  return `<script>\n${src}\n</script>`;
});
if (/src="js\/|href="css\//.test(html)) throw new Error('unresolved local file');
fs.writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
