// Build the two reading pages of each topic from the notes already inside its video page.
// Each topic is a set of three: <slug>/index.html (영상) · article.html (설명) · terms.html (용어집).
// Source of truth: the <section class="notes"> and HEAD in <slug>/index.html, and VIDEOS in the root index.html.
// Usage (run from the project root after editing any notes):
//   node <skill>/scripts/build-articles.mjs [--site https://you.github.io/your-repo/]
// --site (or the SITE env var) is the published gallery URL used for the "전체 영상 목록" footer link;
// without it the link points to the project's own gallery, ../index.html.
import fs from 'node:fs';

const argv = process.argv.slice(2), siteAt = argv.indexOf('--site');
const SITE = (siteAt >= 0 ? argv[siteAt + 1] : process.env.SITE) || '../index.html';
if (!fs.existsSync('index.html')) { console.error('no index.html here: run from the project root (the folder holding the gallery index.html with const VIDEOS = [ … ];)'); process.exit(1); }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const between = (s, a, b, from = 0) => { const i = s.indexOf(a, from); if (i < 0) return null; const j = s.indexOf(b, i + a.length); return j < 0 ? null : s.slice(i + a.length, j); };

// Resume integration: topic metadata, without replacing the resume by a gallery.
const VIDEOS = ['demo', 'fps-demo', 'zenonia-demo', 'dedicated-demo'].map(dir => JSON.parse(fs.readFileSync(`${dir}/film.json`, 'utf8')));

const FONTS = `@font-face { font-family: Pretendard; src: url(../assets/fonts/Pretendard-Variable.woff2) format("woff2"), url(assets/fonts/Pretendard-Variable.woff2) format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "JetBrains Mono"; src: url(../assets/fonts/JetBrainsMono.woff2) format("woff2"), url(assets/fonts/JetBrainsMono.woff2) format("woff2"); font-weight: 100 800; }`;
const CSS = `
  /* Reading page: one 720px column, light and dark. */
  ${FONTS}
  :root {
    --bg: #fbfbfd; --surface: #f1f2f7; --line: #dde0ea; --fg: #141826; --text2: #39405a; --dim: #6b7290; --accent: #6d4fd8;
    --sans: Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
    --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --bg: #070a13; --surface: #0e1424; --line: #24304a; --fg: #e8ecf4; --text2: #c3cad8; --dim: #8b95a7; --accent: #a78bfa; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #070a13; --surface: #0e1424; --line: #24304a; --fg: #e8ecf4; --text2: #c3cad8; --dim: #8b95a7; --accent: #a78bfa; color-scheme: dark; }
  body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); font-size: 17px; line-height: 1.8;
    word-break: keep-all; overflow-wrap: anywhere;
    padding-block: 48px 72px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  main { max-width: 720px; margin: 0 auto; }
  a { color: var(--accent); }
  .eyebrow { font: 600 12px/1 var(--mono); letter-spacing: .18em; color: var(--dim); text-transform: uppercase; }
  h1 { font-size: clamp(30px, 6vw, 42px); line-height: 1.25; letter-spacing: -.02em; margin: 12px 0 16px; text-wrap: balance; }
  h2 { font-size: 24px; line-height: 1.4; margin: 56px 0 4px; text-wrap: balance; display: flex; gap: 12px; align-items: baseline; }
  h2 .n { font: 600 15px/1 var(--mono); color: var(--accent); flex: none; }
  .sub { color: var(--dim); margin: 0 0 16px; font-size: 16px; }
  p, li { color: var(--text2); }
  .lede { font-size: 19px; color: var(--fg); }
  nav.tabs { display: flex; gap: 6px; margin: 0 0 28px; border-bottom: 1px solid var(--line); }
  nav.tabs a { font: 700 15px/1 var(--sans); color: var(--dim); text-decoration: none; padding: 12px 14px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  nav.tabs a:hover { color: var(--fg); }
  nav.tabs a[aria-current="page"] { color: var(--fg); border-bottom-color: var(--accent); }
  .next { margin-top: 48px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0 8px; }
  .actions a { font: 600 14px/1 var(--sans); text-decoration: none; color: var(--fg); border: 1px solid var(--line); border-radius: 999px; padding: 10px 14px; background: var(--surface); }
  .actions a:hover { border-color: var(--accent); }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; font: 500 12px/1 var(--mono); color: var(--dim); }
  .tags span { border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; }
  nav.toc { border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin: 32px 0 0; background: var(--surface); }
  nav.toc ol { margin: 0; padding-left: 1.4em; } nav.toc li { color: var(--fg); }
  nav.toc a { color: inherit; text-decoration: none; } nav.toc a:hover { color: var(--accent); }
  .scene { font: 600 13px/1 var(--sans); }
  code { font: 500 .88em var(--mono); background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 1px 5px; }
  dl.terms { display: grid; grid-template-columns: minmax(120px, max-content) minmax(0, 1fr); gap: 14px 28px; margin: 16px 0 0; }
  dt { font-weight: 700; color: var(--fg); } dd { margin: 0; color: var(--text2); }
  dd .src { display: block; font-size: 13px; color: var(--dim); }
  @media (max-width: 600px) { dl.terms { grid-template-columns: minmax(0, 1fr); gap: 2px; } dd { margin-bottom: 16px; } }
  input[type=search] { width: 100%; box-sizing: border-box; font: 500 16px var(--sans); color: var(--fg); background: var(--surface);
    border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 16px 0 8px; }
  footer { margin-top: 64px; font-size: 14px; color: var(--dim); }`;
const page = (title, body, desc) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<style>${CSS}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

// tabs shared by the three pages of one topic: 영상 · 설명 · 용어집
const tabs = cur => `<nav class="tabs" aria-label="같은 주제">${[['index.html', '영상'], ['article.html', '설명'], ['terms.html', '용어집']]
  .map(([href, label]) => `<a href="${href}"${href === cur ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;

for (const v of VIDEOS) {
  const slug = v.path.replace(/\/$/, ''), src = `${slug}/index.html`;
  if (v.vertical || !fs.existsSync(src)) continue;   // shorts share the full video's 설명 · 용어집
  const html = fs.readFileSync(src, 'utf8');
  const HEAD = Function(`return [${between(html, 'const HEAD = [', '\n];')}]`)();
  const notes = between(html, '<section class="notes" id="notes" hidden>', '</section>');
  if (!notes || !notes.includes('<article')) { console.warn(`skip ${slug}: no notes`); continue; }
  const lede = between(notes, '<p class="lede">', '</p>') || '';
  const arts = [...notes.matchAll(/<article data-ch="(\d\d)">([\s\S]*?)<\/article>/g)];
  const terms = [...(between(notes, '<dl class="terms">', '</dl>') || '').matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]
    .map(([, dt, dd]) => [dt.trim(), dd.trim()])
    .sort((a, b) => a[0].replace(/<[^>]+>/g, '').localeCompare(b[0].replace(/<[^>]+>/g, ''), 'ko'));
  const top = cur => `${tabs(cur)}
<span class="eyebrow">${esc(v.length)} · ${v.tags.map(esc).join(' · ')}</span>
<h1>${esc(v.title)}</h1>`;
  const foot = `<footer><a href="${esc(SITE)}">이력서로 돌아가기</a></footer>`;

  const chapters = arts.map(([, n, body]) => {
    const h = HEAD.find(r => r[2] === n) || [0, 0, n, '', ''];
    return `<section id="ch${n}">
<h2><span class="n">${n}</span>${esc(h[3])}</h2>
<p class="sub">${esc(h[4])} · <a class="scene" href="index.html#ch${n}">▶ 이 장면 보기</a></p>
${body.trim()}
</section>`;
  });
  fs.writeFileSync(`${slug}/article.html`, page(`${v.title} — 설명`, `${top('article.html')}
<p class="lede">${lede}</p>
<nav class="toc" aria-label="목차"><ol>${arts.map(([, n]) => { const h = HEAD.find(r => r[2] === n); return `<li><a href="#ch${n}">${esc(h ? h[3] : n)}</a></li>`; }).join('')}</ol></nav>
${chapters.join('\n')}
<p class="next">이 영상에 나온 용어는 <a href="terms.html">용어집</a>에 정리했다.</p>
${foot}`, v.desc));

  fs.writeFileSync(`${slug}/terms.html`, page(`${v.title} — 용어집`, `${top('terms.html')}
<p class="lede">이 영상에 나오는 용어 ${terms.length}개.</p>
<input type="search" id="q" placeholder="용어 찾기" aria-label="용어 찾기">
<dl class="terms" id="list">
${terms.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('\n')}
</dl>
${foot}
<script>
  const q = document.getElementById('q'), dts = [...document.querySelectorAll('#list dt')];
  q.addEventListener('input', () => { const s = q.value.trim().toLowerCase();
    dts.forEach(dt => { const show = !s || (dt.textContent + dt.nextElementSibling.textContent).toLowerCase().includes(s); dt.hidden = dt.nextElementSibling.hidden = !show; }); });
</script>`, `${v.title} 용어집`));
  console.log(`${slug}: article.html ${arts.length} chapters · terms.html ${terms.length} terms`);
}
