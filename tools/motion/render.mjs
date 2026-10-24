// Render a canvas animation page to MP4.
// Usage (from the project root; files are served from the current directory, so ../assets/ must be under it):
//   node <skill>/scripts/render.mjs <page.html> <out.mp4> [--fps 30] [--crf 18] [--from s --to s] [--stills 3,10,20]
//   --stills: <out> is a folder of PNGs named t003.0.png …
//   --query k=v&k2=v2 adds URL params; --size 1080x1350 sets the viewport.
//   --from/--to render one segment (frames [from*fps, to*fps)); join segments with <skill>/scripts/render-chunked.sh.
//   The page must expose window.ready (Promise), window.renderAt(t) and window.DURATION.
import { createRequire } from 'node:module';
import { spawn, execSync, execFileSync } from 'node:child_process';
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

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : def; };
const fps = Number(flag('--fps', 30));
const stills = flag('--stills', null);
const crf = flag('--crf', '18');
const from = Number(flag('--from', 0)), to = flag('--to', null);
const query = flag('--query', '');  // extra URL params, e.g. --query layout=tall
const size = flag('--size', '1920x1080').split('x').map(Number);
const [page, out] = args;
if (!page || !out) { console.error('usage: render.mjs <page.html> <out.mp4> [--fps 30] [--stills t1,t2]'); process.exit(1); }

const root = process.cwd();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/${path.relative(root, path.resolve(page))}?render${query ? '&' + query : ''}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--enable-unsafe-swiftshader'] });
const tab = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
tab.on('console', m => m.type() !== 'log' && console.log('[page]', m.text()));
tab.on('pageerror', e => { console.error('[page error]', e); process.exitCode = 1; });
await tab.goto(url);
await tab.evaluate(() => window.ready);
const duration = await tab.evaluate(() => window.DURATION);
const grab = t => tab.evaluate(t => { window.renderAt(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t);

if (stills) {
  fs.mkdirSync(out, { recursive: true });
  for (const t of stills.split(',').map(Number)) {
    fs.writeFileSync(path.join(out, `t${t.toFixed(1).padStart(5, '0')}.png`), Buffer.from(await grab(t), 'base64'));
  }
} else {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round((to === null ? duration : Math.min(Number(to), duration)) * fps);
  for (let f = Math.round(from * fps); f < total; f++) {
    const buf = Buffer.from(await grab(f / fps), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % fps === 0) process.stdout.write(`\r${f}/${total}`);
  }
  ff.stdin.end();
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) throw new Error('FFmpeg failed with exit code ' + code);
  console.log(`\nwrote ${out}`);
}
await browser.close();
server.close();
