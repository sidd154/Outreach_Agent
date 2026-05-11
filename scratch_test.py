import urllib.request as r
import json
import urllib.error

req=r.Request('http://127.0.0.1:8000/api/generate/batch', data=b'{"lead_ids":[],"variations":1}', headers={'X-API-Key': 'dev_api_key_123', 'Content-Type': 'application/json'})
try:
    print(r.urlopen(req).read())
except urllib.error.HTTPError as e:
    print(e.read())
