#!/usr/bin/env python3
"""Archive all original public image objects privately, including other owners."""
import concurrent.futures,hashlib,json,os,subprocess,urllib.request,urllib.parse
import staging
os.umask(0o077)
root=staging.PRIVATE/'cutover/backups/source-storage';root.mkdir(parents=True,mode=0o700,exist_ok=True)
sql="SELECT COALESCE(json_agg(t),'[]') FROM (SELECT name,metadata FROM storage.objects WHERE bucket_id='block-images' ORDER BY name) t"
rows=json.loads(subprocess.check_output(['docker','exec','flowlog-restore-20261029','psql','-U','postgres','-d','final','-Atc',sql],text=True))
manifest=json.loads((staging.PRIVATE/'image-manifest.json').read_text())
host=next(urllib.parse.urlsplit(r['old_url']).netloc for r in manifest if '.supabase.co/' in r['old_url'])
cache={urllib.parse.unquote(urllib.parse.urlsplit(r['old_url']).path):staging.PRIVATE/'images'/r['file'] for r in manifest if urllib.parse.urlsplit(r['old_url']).netloc==host}
def fetch(row):
    path='/storage/v1/object/public/block-images/'+row['name'];url='https://'+host+urllib.parse.quote(path,safe='/')
    target=root/hashlib.sha256(path.encode()).hexdigest()
    if not target.exists():
        if path in cache:target.write_bytes(cache[path].read_bytes())
        else:
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'FlowLog-migration-backup/1.0'}),timeout=120) as response:
                        assert urllib.parse.urlsplit(response.url).netloc==host
                        assert response.headers.get_content_type().startswith('image/')
                        chunks=[]
                        while True:
                            chunk=response.read(1024*1024)
                            if not chunk:break
                            chunks.append(chunk)
                        raw=b''.join(chunks);assert len(raw)==int(row['metadata']['size'])
                        target.write_bytes(raw)
                    break
                except (OSError,TimeoutError):
                    if attempt==2:raise
        target.chmod(0o600)
    raw=target.read_bytes();assert len(raw)==int(row['metadata']['size'])
    return {'name':row['name'],'file':target.name,'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'original_metadata':row['metadata']}
proof=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for future in concurrent.futures.as_completed([pool.submit(fetch,r) for r in rows]):
        proof.append(future.result())
        if len(proof)%25==0:print('Archived original storage objects:',len(proof),flush=True)
staging.save(root/'manifest.json',{'objects':proof,'count':len(proof),'bytes':sum(r['size'] for r in proof)})
print('All original storage images privately backed up:',len(proof),'bytes:',sum(r['size'] for r in proof))
