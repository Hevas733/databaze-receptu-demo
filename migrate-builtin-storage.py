"""Explicit, repeatable migration from a browser snapshot. Run with the server stopped.

First generate/review --report. --apply requires that exact report's planHash.
No browser keys are deleted. Unknown snapshot keys (e.g. menu drafts) stay untouched.
"""
import argparse
import copy
import json
from pathlib import Path
import builtin_store as store
import folder_store


def plan(root, snapshot_path, policy):
    raw = snapshot_path.read_bytes()
    snapshot = json.loads(raw)
    if snapshot.get('version') != 1 or not isinstance(snapshot.get('items'), dict):
        raise ValueError('Neplatný bezpečnostní snímek.')
    catalog = json.loads((root/'builtin-recipes.json').read_text(encoding='utf-8'))
    known = {'receptar:'+item['id'] for item in catalog}
    state = store.state(root)
    files, entries = {}, []
    for key, value in sorted(snapshot['items'].items()):
        if key not in known:
            continue
        if not isinstance(value, str):
            raise ValueError('Neplatný překryv.')
        fingerprint = store.digest(value.encode('utf-8'))
        rid = key[len('receptar:'):]
        current = store.load(root, rid)
        if state['overlays'].get(key) == fingerprint:
            entries.append({'id': rid, 'status': 'already-migrated'})
            continue
        overlay = json.loads(value)
        if not isinstance(overlay, dict) or set(overlay) - store.EDITABLE - {'history', 'rotationDays'}:
            raise ValueError('Překryv obsahuje nepodporovaná pole; vyžaduje ruční kontrolu: '+rid)
        before = current['recipe']
        patch = {k: v for k, v in overlay.items() if k in store.EDITABLE}
        if policy == 'keep-text':
            for field in ('description', 'planningNote'):
                if patch.get(field) == '' and before.get(field):
                    patch.pop(field)
        after = store.merge(before, patch) if patch and policy != 'disk' else copy.deepcopy(before)
        # Legacy manual history is additive; never drop newer disk/menu history.
        if policy != 'disk' and 'history' in overlay:
            dates = overlay['history']
            if not isinstance(dates, list):
                raise ValueError('Neplatná historie překryvu.')
            for value_date in dates:
                store.date(value_date)
            after['history'] = sorted(set(before.get('history', [])) | set(dates))
            if after['history']:
                after['lastServedAt'] = max([after.get('lastServedAt') or '', *after['history']])
        differences = []
        def compare(prefix, browser, disk, result):
            for field, visible in browser.items():
                name = prefix+field
                if isinstance(visible, dict) and isinstance(disk.get(field), dict):
                    compare(name+'.', visible, disk[field], result.get(field, {}))
                elif visible != disk.get(field) or disk.get(field) != result.get(field):
                    differences.append({'field': name, 'browser': visible, 'diskBefore': disk.get(field), 'diskAfter': result.get(field)})
        compare('', overlay, before, after)
        entries.append({'id': rid, 'status': 'migrate', 'baseRevision': current['revision'], 'overlayHash': fingerprint, 'differences': differences})
        if after != before:
            files[store.relative_path(root, rid)] = folder_store.encode(after)
        state['overlays'][key] = fingerprint
    if any(item['status'] == 'migrate' for item in entries):
        files[store.STATE] = folder_store.encode(state)
    report = {'version': 1, 'policy': policy, 'snapshotHash': store.digest(raw), 'recipes': entries,
              'untouchedKeys': sorted(set(snapshot['items'])-known),
              'outputHashes': {name: store.digest(content) for name, content in sorted(files.items())}}
    report['planHash'] = store.digest(folder_store.encode(report))
    return report, files


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).parent)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--policy', choices=['keep-text', 'exact', 'disk'], required=True)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-plan')
    args = parser.parse_args()
    root = args.directory.resolve()
    report, files = plan(root, args.snapshot, args.policy)
    if args.apply:
        if args.expected_plan != report['planHash']:
            parser.error('Plán nebo vstupy se změnily. Nejdříve zkontrolujte nový report a jeho planHash.')
        folder_store.commit(root, files)
        for name, content in files.items():
            if folder_store.safe(root, name).read_bytes() != content:
                raise OSError('Kontrola po migraci selhala: '+name)
    if args.report:
        args.report.write_bytes(folder_store.encode(report))
    print(json.dumps({'planHash': report['planHash'], 'recipes': len(report['recipes']), 'files': len(files), 'applied': args.apply}, ensure_ascii=False))
