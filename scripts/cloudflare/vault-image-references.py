#!/usr/bin/env python3
"""Plan/apply exact image-reference replacements without regenerating prose."""
import argparse,collections,difflib,hashlib,json,os
from pathlib import Path
import staging

parser=argparse.ArgumentParser();parser.add_argument('--vault',type=Path,required=True);parser.add_argument('--apply',action='store_true');parser.add_argument('--verify',action='store_true');args=parser.parse_args()
os.umask(0o077);root=args.vault.resolve();private=staging.PRIVATE/'cutover';plan_path=private/'vault-image-reference-plan.json'
def sha(b):return hashlib.sha256(b).hexdigest()
def replace(raw,mapping):
    for old,new in mapping.items():raw=raw.replace(old.encode(),new.encode())
    return raw
if not args.apply and not args.verify:
    manifest=json.loads((staging.PRIVATE/'image-manifest.json').read_text())
    mapping={r['old_url']:'https://flowlog.jp/media/block-images/'+r['object_key'] for r in manifest}
    # Old PHOTO→Gyazo migrations can have aliases. Resolve from their recorded
    # source URL or output URL, never from a guessed filename or date.
    old_manifest=root/'09_imports/flowlog/manifests/gyazo-uploads.json'
    aliases=json.loads(old_manifest.read_text()).get('uploads_by_sha256',{}) if old_manifest.exists() else {}
    for row in aliases.values():
        if row['image_url'] not in mapping:
            assert row['source_url'] in mapping,'Historical image needs a verified R2 copy first'
            mapping[row['image_url']]=mapping[row['source_url']]
    candidates=list((root/'01_dairynote').rglob('*.md'))+list((root/'09_imports/flowlog/daily').glob('*.md'))+list((root/'09_imports/flowlog/other/daily').glob('*.md'))+[root/'09_imports/flowlog/README.md']
    plan=[];patch=[]
    for path in sorted(set(candidates)):
        if not path.exists():continue
        raw=path.read_bytes();updated=replace(raw,mapping)
        if raw==updated:continue
        rel=str(path.relative_to(root));backup=private/'vault-originals'/rel;backup.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        if backup.exists():assert backup.read_bytes()==raw,'An earlier backup differs; inspect before replacing it'
        else:backup.write_bytes(raw);backup.chmod(0o600)
        plan.append({'path':rel,'before_sha256':sha(raw),'after_sha256':sha(updated),'replacements':sum(raw.count(u.encode()) for u in mapping),'mode':path.stat().st_mode&0o777})
        patch.extend(difflib.unified_diff(raw.decode().splitlines(True),updated.decode().splitlines(True),fromfile=rel,tofile=rel))
    staging.save(plan_path,{'mapping':mapping,'files':plan,'raw_exports_modified':False})
    (private/'vault-image-references.diff').write_text(''.join(patch));(private/'vault-image-references.diff').chmod(0o600)
    print('Exact-reference plan:',{'files':len(plan),'references':sum(r['replacements'] for r in plan),'groups':dict(collections.Counter('daily-note' if r['path'].startswith('01_dairynote/') else 'derived-source' for r in plan)),'historical_gyazo_uploads_checked':len(aliases)})
else:
    plan=json.loads(plan_path.read_text());files=plan['files'];mapping=plan['mapping']
    if args.apply:
        # Check every source before changing even the first file.
        for row in files:assert sha((root/row['path']).read_bytes())==row['before_sha256'],'Concurrent edit; no replacements applied'
        for row in files:
            path=root/row['path'];original=(private/'vault-originals'/row['path']).read_bytes();updated=replace(original,mapping)
            assert sha(updated)==row['after_sha256']
            temp=path.with_name(path.name+'.flowlog-migration-tmp');temp.write_bytes(updated);temp.chmod(row['mode']);temp.replace(path)
    for row in files:
        actual=(root/row['path']).read_bytes();original=(private/'vault-originals'/row['path']).read_bytes()
        assert sha(actual)==row['after_sha256'] and actual==replace(original,mapping),'Unexpected prose or file change'
        assert not any(u.encode() in actual for u in mapping),'Matched old image URL remains'
    staging.save(private/'vault-image-reference-verification.json',{'files':len(files),'references':sum(r['replacements'] for r in files),'only_exact_urls_changed':True,'raw_exports_modified':False})
    print('Every changed byte matches the planned URL replacements:',len(files),'files')
