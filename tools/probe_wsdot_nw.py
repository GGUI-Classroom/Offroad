#!/usr/bin/env python3
import urllib.request, xml.etree.ElementTree as ET

URLS = [
  'https://data.wsdot.wa.gov/traffic/nw/FlowData/1minute/MinuteDataDefnNW.xml',
  'https://data.wsdot.wa.gov/traffic/nw/FlowData/1minute/MinuteDataNW.xml',
]

def local(t): return t.split('}',1)[-1]
def fetch(u):
    req=urllib.request.Request(u,headers={'User-Agent':'Offroader/0.2 NW schema probe (+https://github.com/GGUI-Classroom/Offroad)','Accept':'application/xml,text/xml,*/*'})
    with urllib.request.urlopen(req,timeout=60) as r: return r.read()

for u in URLS:
    raw=fetch(u)
    root=ET.fromstring(raw)
    print('\nURL',u,'bytes',len(raw),'root',local(root.tag),root.attrib)
    # Show shallow structure and first handful of elements with attributes/text.
    count=0
    for el in root.iter():
        if el is root: continue
        print('TAG',local(el.tag),'ATTR',dict(el.attrib),'TEXT',repr((el.text or '').strip()[:180]))
        count += 1
        if count >= 35: break
