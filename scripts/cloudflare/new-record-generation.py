#!/usr/bin/env python3
"""Enable the staging-only new-record policy without admitting any old data."""
import hashlib
import json
import sys
import staging

FIXTURE_DATE = '1990-03-02'
c, _ = staging.credentials()
staging.resource(c)
owner = json.loads(staging.CONFIG.read_text())['vars']['OWNER_ID']
path = staging.PRIVATE / 'new-record-generation-activation.json'
action = sys.argv[1] if len(sys.argv) > 1 else ''

if action == 'enable':
    before = staging.query(c, 'SELECT * FROM diary_generation_control WHERE singleton=1')[0]['results'][0]
    if before['new_records_started_at']:
        if not path.exists() or json.loads(path.read_text())['started_at'] != before['new_records_started_at']:
            raise RuntimeError('Existing activation has no matching private record; left unchanged')
        if not before['new_records_only'] or json.loads(before['allowed_dates']):
            raise RuntimeError('Different generation policy is configured; left unchanged')
        staging.query(c, 'UPDATE diary_generation_control SET enabled=1 WHERE singleton=1')
    else:
        if before['enabled'] or before['new_records_only'] or json.loads(before['allowed_dates']):
            raise RuntimeError('Only the stopped initial policy can be activated')
        baseline = {}
        for table in ['entries', 'blocks']:
            rows = []
            cursor = ''
            while True:
                page = staging.query(c, 'SELECT * FROM ' + table + ' WHERE user_id=? AND id>? ORDER BY id LIMIT 100', [owner, cursor])[0]['results']
                rows.extend(page)
                if len(page) < 100:
                    break
                cursor = page[-1]['id']
            baseline[table] = {r['id']: hashlib.sha256(json.dumps(r, sort_keys=True, ensure_ascii=False).encode()).hexdigest() for r in rows}
        staging.save(staging.PRIVATE / 'before-new-record-generation.json', {'control': before, 'row_hashes': baseline})
        # The SQLite trigger freezes existing entries and event life dates in
        # this same transaction. No existing blocks are registered as new.
        staging.query(c, "UPDATE diary_generation_control SET enabled=1,new_records_only=1 WHERE singleton=1 AND enabled=0 AND new_records_only=0 AND new_records_started_at IS NULL AND allowed_dates='[]'")
    after = staging.query(c, 'SELECT enabled,new_records_only,new_records_started_at FROM diary_generation_control WHERE singleton=1')[0]['results'][0]
    assert after['enabled'] and after['new_records_only'] and after['new_records_started_at']
    protected = staging.query(c, 'SELECT count(*) n FROM diary_generation_protected_dates WHERE user_id=?', [owner])[0]['results'][0]['n']
    if not path.exists():
        staging.save(path, {'started_at': after['new_records_started_at'], 'protected_dates': protected})
    print('New-record generation enabled in staging. Started:', after['new_records_started_at'], '; protected life dates:', protected)
elif action == 'disable':
    saved = json.loads(path.read_text())
    staging.query(c, 'UPDATE diary_generation_control SET enabled=0 WHERE singleton=1 AND new_records_only=1 AND new_records_started_at=?', [saved['started_at']])
    assert not staging.query(c, 'SELECT enabled FROM diary_generation_control WHERE singleton=1')[0]['results'][0]['enabled']
    print('Staging generation stopped; protection and original activation boundary retained.')
elif action == 'cleanup-fixture':
    if not path.exists():
        raise RuntimeError('New-record policy has not been activated')
    assert not staging.query(c, 'SELECT date FROM diary_generation_protected_dates WHERE user_id=? AND date=?', [owner, FIXTURE_DATE])[0]['results'], 'Refusing to touch a protected date'
    # Remove admission before deleting the fictional block/entry, so neither a
    # queued delivery nor cleanup can initiate another model call.
    staging.query(c, 'DELETE FROM diary_generation_new_dates WHERE user_id=? AND date=?', [owner, FIXTURE_DATE])
    for table in ['diary_generation_outbox', 'diary_generation_jobs', 'diary_generation_attempts', 'diary_entry_versions', 'diary_generation_history']:
        staging.query(c, 'DELETE FROM ' + table + ' WHERE user_id=? AND date=?', [owner, FIXTURE_DATE])
    print('Only the unused fictional test date was removed from generation scope.')
else:
    raise RuntimeError('Choose enable, disable or cleanup-fixture')
