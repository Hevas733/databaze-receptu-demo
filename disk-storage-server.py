"""Local recipe server. GitHub Pages only needs the JSON and web assets."""
import argparse
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import unicodedata
import uuid
import folder_store
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

CATALOG = 'imported-index.json'
BUILTINS = 'builtin-recipes.json'
MENU_ALIASES = 'menu-aliases.json'
MENU_IMPORTS = 'menu-imports.json'
LOCK = threading.Lock()

def normalized(value):
    value = unicodedata.normalize('NFKD', str(value)).encode('ascii','ignore').decode().lower()
    return ' '.join(re.sub(r'[^a-z0-9]+',' ',value).split())

def recipe_files(root):
    entries = []
    builtins = json.loads((root/BUILTINS).read_text(encoding='utf-8'))
    for item in builtins:
        rid = item.get('id', '')
        if not re.fullmatch(r'[a-z0-9-]{1,150}', rid):
            raise ValueError('Neplatné ID vestavěného receptu.')
        relative = f'Recepty/{rid}/{rid}.json'
        path = root/relative
        if path.exists():
            entries.append((rid, relative))
    imported = json.loads((root/CATALOG).read_text(encoding='utf-8'))
    for item in imported.get('recipes', []):
        entries.append((item['id'], item['file']))
    return entries

def load_menu_catalog(root):
    recipes = []
    for rid, relative in recipe_files(root):
        path = (root/relative).resolve()
        if not path.is_relative_to(root) or not path.exists():
            raise ValueError('Chybí soubor receptu.')
        recipe = json.loads(path.read_text(encoding='utf-8'))
        recipes.append({
            'id': rid,
            'name': recipe.get('name', ''),
            'alternativeNames': recipe.get('alternativeNames', []),
            'mealTypes': recipe.get('mealTypes', []),
            'history': recipe.get('history', []),
            'menuHistory': recipe.get('menuHistory', [])
        })
    aliases = {}
    alias_path = root/MENU_ALIASES
    if alias_path.exists():
        data = json.loads(alias_path.read_text(encoding='utf-8'))
        if data.get('version') == 1 and isinstance(data.get('aliases'), dict):
            aliases = data['aliases']
    imports = []
    import_path = root/MENU_IMPORTS
    if import_path.exists():
        data = json.loads(import_path.read_text(encoding='utf-8'))
        if data.get('version') == 1 and isinstance(data.get('imports'), list):
            imports = data['imports']
    return recipes, aliases, imports

def migrate_legacy_menu_imports(root):
    import_path = root/MENU_IMPORTS
    registry = {'version':1,'imports':[]}
    if import_path.exists():
        registry = json.loads(import_path.read_text(encoding='utf-8'))
    known = {x.get('id') for x in registry.get('imports', [])}
    groups = {}
    files = {}
    for rid, relative in recipe_files(root):
        path = root/relative
        recipe = json.loads(path.read_text(encoding='utf-8'))
        changed = False
        for event in recipe.get('menuHistory') or []:
            if not isinstance(event, dict) or event.get('importId'):
                continue
            source = event.get('sourceFile') or 'Starší import'
            import_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'receptar-menu-import:'+source))
            event['importId'] = import_id
            group = groups.setdefault(import_id, {'id':import_id,'sourceFile':source,'dates':[],'saved':0})
            group['saved'] += 1
            if event.get('date'):
                group['dates'].append(event['date'])
            changed = True
        if changed:
            files[relative] = (json.dumps(recipe,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
    for import_id, group in groups.items():
        if import_id in known:
            continue
        dates = sorted(group.pop('dates'))
        group.update({'createdAt':'','from':dates[0] if dates else '','to':dates[-1] if dates else ''})
        registry.setdefault('imports', []).append(group)
    if files or groups:
        files[MENU_IMPORTS] = (json.dumps(registry,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
        folder_store.commit(root, files)

def validate_menu_import(data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValueError('Neplatný import jídelníčku.')
    source = data.get('sourceFile', '')
    if not isinstance(source, str) or len(source) > 250:
        raise ValueError('Neplatný název zdroje.')
    events = data.get('events')
    if not isinstance(events, list) or len(events) > 5000:
        raise ValueError('Import smí obsahovat nejvýše 5000 položek.')
    allowed_meals = {'Snídaně','Přesnídávka','Oběd','Svačina','Večeře','Polévka','Příloha'}
    clean = []
    for event in events:
        if not isinstance(event, dict):
            raise ValueError('Neplatná položka importu.')
        rid, date, meal = event.get('recipeId',''), event.get('date',''), event.get('meal','')
        original, diet = event.get('originalName',''), event.get('dietCode','')
        if not re.fullmatch(r'(?:docx-)?[a-z0-9-]{1,150}', rid) or not re.fullmatch(r'20\d{2}-\d{2}-\d{2}', date) or meal not in allowed_meals:
            raise ValueError('Neplatné přiřazení receptu, data nebo chodu.')
        if not isinstance(original,str) or not original.strip() or len(original)>300 or not isinstance(diet,str) or len(diet)>50:
            raise ValueError('Neplatný původní název nebo dieta.')
        clean.append({'recipeId':rid,'date':date,'meal':meal,'originalName':original.strip(),'dietCode':diet.strip(),'learnAlias':bool(event.get('learnAlias'))})
    return source, clean

def validate(data):
    if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('recipes'), list):
        raise ValueError('Neplatný katalog.')
    if len(data['recipes']) > 2000:
        raise ValueError('Příliš mnoho norem.')
    ids = set()
    for r in data['recipes']:
        if not isinstance(r, dict) or not re.fullmatch(r'docx-[a-z0-9-]{1,145}', r.get('id', '')):
            raise ValueError('Neplatné ID normy.')
        if r['id'] in ids or not isinstance(r.get('name'), str) or not r['name'].strip():
            raise ValueError('Duplicitní ID nebo chybějící název.')
        ids.add(r['id'])
        if not isinstance(r.get('ingredients'), list) or not r['ingredients']:
            raise ValueError('Chybějí suroviny.')
    return data

def handler_for(root):
    root = root.resolve()
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def json_response(self, status, value):
            body = json.dumps(value, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def local_host(self):
            return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}

        def send_head(self):
            target = Path(self.translate_path(self.path)).resolve()
            if not self.local_host() or not target.is_relative_to(root) or any(p.startswith('.') for p in target.relative_to(root).parts):
                self.send_error(403)
                return None
            return super().send_head()

        def do_GET(self):
            if not self.local_host():
                return self.json_response(403, {'error': 'Nepovolený host.'})
            path = urlsplit(self.path).path
            if path == '/__recipe_storage':
                return self.json_response(200, {'storage': 'recipe-disk-v1', 'file': CATALOG})
            if path == '/__menu_import':
                try:
                    with LOCK:
                        migrate_legacy_menu_imports(root)
                        recipes, aliases, imports = load_menu_catalog(root)
                    return self.json_response(200, {'storage':'menu-history-v2','recipes':recipes,'aliases':aliases,'imports':imports})
                except (ValueError, TypeError, OSError, json.JSONDecodeError) as exc:
                    return self.json_response(400, {'error':str(exc)})
            target = Path(self.translate_path(self.path)).resolve()
            if not target.is_relative_to(root) or any(p.startswith('.') for p in target.relative_to(root).parts):
                return self.send_error(403)
            super().do_GET()

        def do_POST(self):
            endpoint = urlsplit(self.path).path
            if endpoint not in {'/__recipe_storage','/__menu_import'}:
                return self.send_error(404)
            origin = self.headers.get('Origin')
            if not self.local_host() or origin != 'http://' + self.headers.get('Host', ''):
                return self.json_response(403, {'error': 'Zápis je povolen pouze z místní aplikace.'})
            if self.headers.get_content_type() != 'application/json':
                return self.json_response(415, {'error': 'Je vyžadován JSON.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 20 * 1024 * 1024:
                    raise ValueError('Katalog smí mít nejvýše 20 MB.')
                raw = json.loads(self.rfile.read(length), parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Neplatné číslo.')))
                if endpoint == '/__menu_import':
                    if raw.get('action') == 'delete':
                        import_id = raw.get('importId', '')
                        if not re.fullmatch(r'[a-f0-9-]{36}', import_id):
                            raise ValueError('Neplatné ID importu.')
                        with LOCK:
                            imports_path = root/MENU_IMPORTS
                            registry = {'version':1,'imports':[]}
                            if imports_path.exists():
                                registry = json.loads(imports_path.read_text(encoding='utf-8'))
                            target = next((x for x in registry.get('imports',[]) if x.get('id') == import_id), None)
                            if not target:
                                raise ValueError('Import už neexistuje.')
                            files = {}
                            removed = 0
                            for rid, relative in recipe_files(root):
                                recipe = json.loads((root/relative).read_text(encoding='utf-8'))
                                before = recipe.get('menuHistory') or []
                                after = [x for x in before if not (isinstance(x,dict) and x.get('importId') == import_id)]
                                if len(after) == len(before):
                                    continue
                                removed += len(before) - len(after)
                                recipe['menuHistory'] = after
                                history = sorted({x.get('date') for x in after if isinstance(x,dict) and x.get('date')})
                                recipe['history'] = history
                                recipe['lastServedAt'] = max(history) if history else None
                                files[relative] = (json.dumps(recipe,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
                            registry['imports'] = [x for x in registry.get('imports',[]) if x.get('id') != import_id]
                            files[MENU_IMPORTS] = (json.dumps(registry,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
                            folder_store.commit(root, files)
                        return self.json_response(200, {'removed':removed})
                    source, events = validate_menu_import(raw)
                    with LOCK:
                        import_id = raw.get('importId')
                        if not isinstance(import_id, str) or not re.fullmatch(r'[a-f0-9-]{36}', import_id):
                            import_id = str(uuid.uuid4())
                        mapping = dict(recipe_files(root))
                        unknown = {e['recipeId'] for e in events} - set(mapping)
                        if unknown:
                            raise ValueError('Některý přiřazený recept už neexistuje.')
                        grouped = {}
                        for event in events:
                            grouped.setdefault(event['recipeId'], []).append(event)
                        files = {}
                        aliases_path = root/MENU_ALIASES
                        aliases = {'version':1,'aliases':{}}
                        if aliases_path.exists():
                            aliases = json.loads(aliases_path.read_text(encoding='utf-8'))
                            if aliases.get('version') != 1 or not isinstance(aliases.get('aliases'),dict):
                                raise ValueError('Poškozený slovník synonym.')
                        added = duplicates = 0
                        for rid, additions in grouped.items():
                            relative = mapping[rid]
                            recipe = json.loads((root/relative).read_text(encoding='utf-8'))
                            history = set(recipe.get('history') or [])
                            menu_history = recipe.get('menuHistory') or []
                            keys = {(x.get('date'),x.get('meal')) for x in menu_history if isinstance(x,dict)}
                            alternative = list(recipe.get('alternativeNames') or [])
                            normalized_alternatives = {normalized(x) for x in alternative}
                            for event in additions:
                                key = (event['date'],event['meal'])
                                if key in keys:
                                    duplicates += 1
                                    continue
                                menu_history.append({'date':event['date'],'meal':event['meal'],'originalName':event['originalName'],'dietCode':event['dietCode'],'sourceFile':source,'importId':import_id})
                                keys.add(key); history.add(event['date']); added += 1
                                if event['learnAlias']:
                                    alias_key = normalized(event['originalName'])
                                    aliases['aliases'][alias_key] = rid
                                    if alias_key and alias_key not in normalized_alternatives:
                                        alternative.append(event['originalName']); normalized_alternatives.add(alias_key)
                            recipe['history'] = sorted(history)
                            recipe['lastServedAt'] = max(history) if history else None
                            recipe['menuHistory'] = sorted(menu_history,key=lambda x:(x.get('date',''),x.get('meal',''),x.get('originalName','')))
                            recipe['alternativeNames'] = alternative
                            files[relative] = (json.dumps(recipe,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
                        files[MENU_ALIASES] = (json.dumps(aliases,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
                        imports_path = root/MENU_IMPORTS
                        registry = {'version':1,'imports':[]}
                        if imports_path.exists():
                            registry = json.loads(imports_path.read_text(encoding='utf-8'))
                        imports = registry.get('imports', [])
                        entry = next((x for x in imports if x.get('id') == import_id), None)
                        dates = sorted({e['date'] for e in events})
                        if entry:
                            entry['saved'] = int(entry.get('saved',0)) + added
                            entry['from'] = min([entry.get('from','9999-99-99'), *dates])
                            entry['to'] = max([entry.get('to',''), *dates])
                        else:
                            imports.append({'id':import_id,'sourceFile':source or 'bez názvu','createdAt':__import__('datetime').datetime.now().astimezone().isoformat(timespec='seconds'),'from':dates[0] if dates else '', 'to':dates[-1] if dates else '', 'saved':added})
                        registry['imports'] = imports
                        files[MENU_IMPORTS] = (json.dumps(registry,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
                        folder_store.commit(root, files)
                    return self.json_response(200, {'saved':added,'duplicates':duplicates,'recipes':len(grouped),'importId':import_id})
                data = validate(raw)
                with LOCK:
                    current = folder_store.load(root)
                    if data.get('baseRevision') != current['revision']:
                        return self.json_response(409, {'error': 'Normy mezitím změnilo jiné okno. Obnovte stránku.'})
                    if not {r['id'] for r in current['recipes']}.issubset({r['id'] for r in data['recipes']}):
                        raise ValueError('Zápis by odstranil existující normy; odmítnuto.')
                    template = (root/'imported-recipe.html').read_text(encoding='utf-8')
                    files, index = folder_store.plan(root, data, template, current['index'])
                    folder_store.commit(root, files)
                    output = {'version':1,'revision':index['revision'],'recipes':data['recipes'],'index':index}
                self.json_response(200, output)
            except (ValueError, TypeError, OSError) as exc:
                self.json_response(400, {'error': str(exc)})
    return Handler

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default=str(Path(__file__).parent))
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(Path(args.directory)))
    print(f'Recepty: http://127.0.0.1:{args.port}/index.html', flush=True)
    server.serve_forever()
