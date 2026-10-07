#!/usr/bin/env node
/* Bundle the game into one self-contained HTML file (scripts and styles inlined).
 *   node tools/bundle.js [out.html]     (default: GeometryDash.html in the current directory) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || 'GeometryDash.html');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '').replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)" \/>/g, (m, f) => `<style>\n${fs.readFileSync(path.join(ROOT, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, f) => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/<\/script/i.test(src)) throw new Error(f + ' contains </script>');
  return `<script>\n${src}\n</script>`;
});
if (/src="js\/|href="css\//.test(html)) throw new Error('unresolved local file');
fs.writeFileSync(out, html);
console.log(`${out} (${Math.round(html.length / 1024)} KB)`);
