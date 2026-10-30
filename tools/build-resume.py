"""Build the standalone resume and two-page PDF from index.html's print content."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'index.html').read_text()
content=re.search(r'(<div class="print-resume".*)\n  </main>',source,re.S).group(1)
(ROOT/'resume.html').write_text('''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>고성종 · 제출용 이력서</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="print.css"><style>body{background:#e8eee6}.print-resume{display:block}.resume-sheet{background:#fff;padding:14mm 15mm;margin:20px auto;max-width:210mm}.pdf-toolbar{max-width:210mm;margin:25px auto;padding:0 20px;font-size:13px;display:flex;gap:20px}.pdf-toolbar button{border:0;background:transparent;color:#285e45;text-decoration:underline} @media print{body{background:white}.resume-sheet{padding:0;margin:0;max-width:none}}</style></head><body><nav class="pdf-toolbar"><a href="./">← 웹 포트폴리오</a><a href="assets/ko-seongjong-resume.pdf" download>PDF 다운로드 ↓</a><button onclick="window.print()">인쇄</button></nav>'''+content+'</body></html>')
# Serve through HTTP: Chromium's managed policy may disallow file:// navigation.
import http.server,threading,functools
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium')
  page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/resume.html');page.evaluate('document.fonts.ready')
  page.pdf(path=str(ROOT/'assets/ko-seongjong-resume.pdf'),format='A4',print_background=True,prefer_css_page_size=True)
  browser.close()
finally:server.shutdown()
print('Built resume.html and assets/ko-seongjong-resume.pdf')
