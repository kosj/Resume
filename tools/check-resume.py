"""Browser checks for responsive resume, detail links, video playback and print output."""
from playwright.sync_api import sync_playwright
import json
from pathlib import Path
import threading, functools, http.server
from serve import RangeHandler
root=Path(__file__).resolve().parents[1]
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(RangeHandler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=f'http://127.0.0.1:{server.server_port}/' 
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium');page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/analytics/tracker.mjs',lambda r:r.fulfill(content_type='text/javascript',body=''))
 page.goto(BASE);page.evaluate('document.fonts.ready');assert page.locator('video').count()==6
 assert page.locator('.project').count()==6
 for w in [1440,1024,768,700,390,320]:
  page.set_viewport_size({'width':w,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),w
 page.set_viewport_size({'width':1440,'height':1000});page.screenshot(path='/tmp/redesign-desktop.png',full_page=True)
 print('first representative case y:',page.locator('#selected-work').evaluate('(e)=>Math.round(e.getBoundingClientRect().top+scrollY)'))
 page.locator('a[href="#miniverse"]').first.click();assert page.locator('#miniverse').evaluate('(e)=>e.closest("article").querySelector("details").open')
 page.goto(BASE+'#zenonia-video');assert page.locator('#zenonia-player').is_visible()
 page.locator('[data-video-for="zenonia-player"][data-video-time="24"]').click();page.wait_for_function('(()=>{const v=document.getElementById("zenonia-player");return v.currentTime>=24&&!v.paused})()');page.mouse.move(0,0);assert page.locator('#zenonia-player').evaluate('(v)=>!v.paused')
 page.goto(BASE);page.mouse.move(0,0);v=page.locator('#the-last-player');v.hover();page.wait_for_function('!document.querySelector("#the-last-player").paused&&document.querySelector("#the-last-player").muted');page.mouse.move(0,0);page.wait_for_timeout(200);assert v.evaluate('(v)=>!v.paused')
 page.locator('a[href="#panthera"]').first.click();page.locator('[data-video-for="career-player"][data-video-time="22"]').first.click();page.wait_for_function('document.querySelector("#career-player").currentTime>=22&&!document.querySelector("#career-player").paused');assert v.evaluate('(v)=>v.paused&&!v.muted')
 assert page.evaluate('[...document.querySelectorAll("video")].filter(v=>!v.paused).length')==1
 page.locator('#career-player').evaluate('(v)=>v.pause()')
 page.set_viewport_size({'width':390,'height':844});page.goto(BASE);page.screenshot(path='/tmp/redesign-mobile.png',full_page=True)
 page.emulate_media(media='print');assert page.locator('.print-resume').is_visible();assert not page.locator('#selected-work').is_visible();page.pdf(path='/tmp/redesign-main-print.pdf',format='A4',prefer_css_page_size=True)
 print(json.dumps({'layout':'1440/1024/768/700/390/320 passed','anchors':'project and video disclosures open on navigation','playback':'chapter seek; hover continues; one video at a time; mute restored','print':'dedicated resume only','errors':errors}));assert not errors
 b.close()
server.shutdown()
