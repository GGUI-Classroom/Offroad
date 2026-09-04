#!/usr/bin/env python3
import re, urllib.parse, urllib.request

PAGE='https://web.seattle.gov/Travelers/'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/javascript,*/*'})
    with urllib.request.urlopen(req,timeout=20) as r:
        return r.read().decode('utf-8','replace')

html=get(PAGE)
print('HTML bytes',len(html.encode()))
for pat in ('streamlock','m3u8','wowza','video','camera'):
    if pat.lower() in html.lower():
        print('HTML contains',pat)

srcs=re.findall(r'<script[^>]+src=["\']([^"\']+)',html,re.I)
print('scripts',len(srcs))
for src in srcs:
    url=urllib.parse.urljoin(PAGE,src)
    print('SCRIPT',url)
    if not (url.startswith('https://web.seattle.gov/') or url.startswith('https://web6.seattle.gov/') or url.startswith('https://www.seattle.gov/')):
        continue
    try:
        js=get(url)
    except Exception as e:
        print('  ERROR',e)
        continue
    low=js.lower()
    hits=[]
    for term in ('streamlock','m3u8','wowza','playlist','camera','video'):
        if term in low: hits.append(term)
    if not hits:
        continue
    print('  HITS',','.join(hits),'bytes',len(js.encode()))
    # print compact context around stream/video-related strings
    for term in ('streamlock','m3u8','wowza','playlist.m3u8','stream/playlist','videoUrl','video'):
        start=0
        shown=0
        while shown<8:
            i=low.find(term.lower(),start)
            if i<0: break
            a=max(0,i-220); b=min(len(js),i+420)
            print('  MATCH',term,repr(js[a:b].replace('\n',' ')))
            shown+=1; start=i+len(term)
