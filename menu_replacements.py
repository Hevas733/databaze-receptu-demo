"""Menu-specific overrides: keep imported recipe histories and aliases intact."""
import hashlib
import json
import uuid
from datetime import date, datetime
import folder_store

FILE = 'menu-replacements.json'
FIELDS = ('importId', 'sourceFile', 'date', 'meal', 'originalName', 'dietCode')

class Conflict(ValueError):
    pass

def load(root):
    path = root / FILE
    if not path.exists():
        return {'version': 1, 'revision': '', 'items': {}}
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('version') != 1 or not isinstance(data.get('items'), dict):
        raise ValueError('Poškozené uložené změny jídelníčku.')
    return data

def save(root, raw, recipe_paths):
    if not isinstance(raw, dict) or not isinstance(raw.get('target'), dict):
        raise ValueError('Neplatný výběr položky.')
    target = raw['target']
    clean = {}
    for field in FIELDS:
        value = target.get(field, '')
        if not isinstance(value, str) or len(value) > 500:
            raise ValueError('Neplatný údaj položky.')
        clean[field] = value
    if not all(clean[f] for f in ('importId', 'sourceFile', 'date', 'meal', 'originalName')):
        raise ValueError('Chybí identifikace položky.')
    date.fromisoformat(clean['date'])
    if clean['meal'] not in {'Snídaně','Přesnídávka','Oběd','Polévka','Svačina','Večeře','Příloha'}:
        raise ValueError('Neplatný chod.')
    rid = raw.get('recipeId')
    if not isinstance(rid, str) or rid not in recipe_paths:
        raise ValueError('Vybraný recept není v databázi.')
    recipe = json.loads(folder_store.safe(root, recipe_paths[rid]).read_text(encoding='utf-8'))
    current = load(root)
    if raw.get('baseRevision') != current['revision']:
        raise Conflict('Jídelníček změnilo jiné okno. Zavřete výběr, obnovte stránku a zkuste to znovu.')
    key = hashlib.sha256(json.dumps(clean, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
    previous = current['items'].get(key)
    if previous and previous['recipeId'] == rid:
        return current
    stamp = datetime.now().astimezone().isoformat(timespec='seconds')
    history = list(previous.get('changes', [])) if previous else []
    if previous:
        history.append({'recipeId': previous['recipeId'], 'recipeName': previous['recipeName'], 'changedAt': previous['changedAt']})
    current['items'][key] = {'target': clean, 'recipeId': rid, 'recipeName': recipe['name'], 'changedAt': stamp, 'changes': history}
    current['revision'] = uuid.uuid4().hex
    folder_store.commit(root, {FILE: folder_store.encode(current)})
    return current
