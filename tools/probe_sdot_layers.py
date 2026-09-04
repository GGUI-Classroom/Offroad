#!/usr/bin/env python3
import json, urllib.request
BASE='https://web.seattle.gov/Travelers/api/Map/Data?zoomId=18&type={}'
for t in range(0,13):
    url=BASE.format(t)
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Offroader/0.2 layer-discovery (+https://github.com/GGUI-Classroom/Offroad)','Accept':'application/json'})
        with urllib.request.urlopen(req,timeout=20) as r:
            raw=r.read()
        j=json.loads(raw)
        if isinstance(j,dict):
            keys=list(j.keys())
            feats=j.get('Features') or j.get('features') or []
            print(f'TYPE {t}: bytes={len(raw)} keys={keys} features={len(feats) if isinstance(feats,list) else "?"}')
            if isinstance(feats,list) and feats:
                sample=feats[0]
                print('  sample='+json.dumps(sample,separators=(',',':'))[:1000])
            else:
                print('  sample='+json.dumps(j,separators=(',',':'))[:700])
        else:
            print(f'TYPE {t}: bytes={len(raw)} top={type(j).__name__} sample={str(j)[:500]}')
    except Exception as e:
        print(f'TYPE {t}: ERROR {e}')
