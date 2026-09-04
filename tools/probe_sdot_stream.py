#!/usr/bin/env python3
import re, urllib.request
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'

def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/javascript,text/plain,*/*'})
    with urllib.request.urlopen(req,timeout=20) as r:
        return r.read().decode('utf-8','replace')

for url in [
    'https://web.seattle.gov/Travelers/js/utils.js',
    'https://web.seattle.gov/Travelers/js/config.js',
    'https://web.seattle.gov/Travelers/js/camera.video.js',
]:
    text=get(url)
    print('\nURL',url,'bytes',len(text.encode()))
    low=text.lower()
    for term in ['getwowsaurl','wowsa','streamlock','m3u8','playlist']:
        start=0; shown=0
        while shown<12:
            i=low.find(term.lower(),start)
            if i<0: break
            a=max(0,i-500); b=min(len(text),i+900)
            print('MATCH',term,repr(text[a:b].replace('\n',' ')))
            start=i+len(term); shown+=1
