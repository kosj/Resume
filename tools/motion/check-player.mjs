// Headless check of a player page (add --shots <dir> for full-page screenshots): no page errors, play advances time, chapter jump works,
// speed button cycles, notes source present (chapter count), links to article/terms, no horizontal overflow at phone width.
// Usage (from the project root): node <skill>/scripts/check-player.mjs <page.html> [--shots <dir>]
// Expects the standard player of template.html (#big, #time, #chapters buttons, #rate, nav.set). A page without it
// (an embed-only piece, a custom 3D player) fails here: check it with render.mjs stills instead.
import { createRequire } from 'node:module';
import { execSync, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  const bundled = execFileSync('python3', ['-c', 'import pathlib,playwright; print(pathlib.Path(playwright.__file__).parent / "driver/package")']).toString().trim();
  ({ chromium } = require(bundled));
}

const page = process.argv[2];
if (!page) { console.error('usage: check-player.mjs <page.html>'); process.exit(1); }
const root = process.cwd();
const MIME = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/${path.relative(root, path.resolve(page))}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--enable-unsafe-swiftshader'] });
const errors = [];
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on('pageerror', e => errors.push(String(e)));
await desk.goto(url);
await desk.waitForFunction(() => typeof window.renderAt === 'function' && window.ready);
await desk.evaluate(() => window.ready);
await desk.click('#big');
// #time reads "0:03 / 1:21"; compare only the current position. Software-WebGL pages draw slowly, so wait up to 8 s.
const cur = s => (s || '').split('/')[0].trim();
let afterPlay = '0:00';
for (let waited = 0; waited < 8000 && cur(afterPlay) === '0:00'; waited += 300) {
  await desk.waitForTimeout(300); afterPlay = await desk.textContent('#time');
}
const bigHidden = !(await desk.isVisible('#big'));
const chapters = await desk.$$('#chapters button');
await chapters[Math.min(2, chapters.length - 1)].click();
await desk.waitForTimeout(400);
const afterJump = await desk.textContent('#time');
await desk.click('#rate');
const rateAfterClick = await desk.textContent('#rate');
await desk.click('#rate'); await desk.click('#rate');
const notesChapters = await desk.$$eval('#notes article', els => els.length);
const setLinks = await desk.$$eval('nav.set a', els => els.map(a => a.getAttribute('href')).join(' '));

const phone = await browser.newPage({ viewport: { width: 400, height: 800 } });
phone.on('pageerror', e => errors.push(String(e)));
await phone.goto(url);
await phone.evaluate(() => window.ready);
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth);

// --shots <dir>: full-page screenshots (desktop + phone) to eyeball the notes section
const shotsAt = process.argv.indexOf('--shots');
if (shotsAt > 0) {
  const dir = process.argv[shotsAt + 1]; fs.mkdirSync(dir, { recursive: true });
  await desk.screenshot({ path: path.join(dir, 'page-desktop.png'), fullPage: true });
  await phone.screenshot({ path: path.join(dir, 'page-phone.png'), fullPage: true });
}
console.log({ afterPlay, bigHidden, afterJump, rateAfterClick, notesChapters, setLinks, phoneOverflow: overflow, errors });
await browser.close();
server.close();
const ok = !errors.length && bigHidden && !overflow && cur(afterPlay) !== '0:00' && cur(afterJump) !== cur(afterPlay) && rateAfterClick === '0.75×';
process.exit(ok ? 0 : 1);
