#!/usr/bin/env python3
import urllib.request
url='https://61e0c5d388c2e.streamlock.net:443/live/Fauntleroy_SW_Cloverdale_NS.stream/playlist.m3u8'
req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Origin':'https://raw.githack.com'})
with urllib.request.urlopen(req,timeout=15) as r:
    print('STATUS',r.status)
    print('FINAL',r.geturl())
    for k,v in r.headers.items():
        if k.lower() in ('content-type','access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','cache-control','location'):
            print(f'{k}: {v}')
    body=r.read(4000).decode('utf-8','replace')
    print('BODY')
    print(body[:4000])
