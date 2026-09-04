#!/usr/bin/env python3
import urllib.request
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36'
url='https://web.seattle.gov/Travelers/api/Map/WowsaUrl'
req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json,text/plain,*/*'})
with urllib.request.urlopen(req,timeout=20) as r:
    body=r.read().decode('utf-8','replace')
    print('STATUS',r.status)
    print('CONTENT-TYPE',r.headers.get('Content-Type'))
    print('BODY',repr(body))
