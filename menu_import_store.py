"""Atomic menu saves and explicit verification of an existing assignment."""
import datetime
import json
import re
import unicodedata
import uuid
import folder_store


def normalized(value):
    value = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().lower()
    value = re.sub(r'\bl00\b', '100', value)
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', value).split())


def quantity_warning(recipe):
    ingredients = recipe.get('ingredients') or []
    if len(ingredients) != 1 or not recipe.get('servings'):
        return ''
    match = re.search(r'\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b', recipe.get('name', ''), re.I)
    ingredient = ingredients[0]
    if not match or ingredient.get('unit') not in {'kg', 'g', 'l', 'ml'} or not ingredient.get('amount'):
        return ''
    expected = float(match[1].replace(',', '.')) * (1000 if match[2].lower() in {'kg', 'l'} else 1)
    actual = ingredient['amount'] * (1000 if ingredient['unit'] in {'kg', 'l'} else 1) / recipe['servings']
    expected_unit = 'g' if match[2].lower() in {'kg', 'g'} else 'ml'
    actual_unit = 'g' if ingredient['unit'] in {'kg', 'g'} else 'ml'
    if expected_unit == actual_unit and abs(expected - actual) > .01:
        return f'Norma {recipe["name"]} má rozpor mezi názvem a množstvím na porci. Nejprve ověřte normu.'
    return ''


def assignment_conflict(source, target):
    def quantities(value):
        return sorted((float(match[1].replace(',', '.')) * (1000 if match[2].lower() in {'kg', 'l'} else 1),
                       'g' if match[2].lower() in {'kg', 'g'} else 'ml' if match[2].lower() in {'ml', 'l'} else 'ks')
                      for match in re.finditer(r'\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|ks)\b', value, re.I))
    a, b = quantities(source), quantities(target)
    if a and b and a != b:
        return 'Množství v jídelníčku a přiřazené normě se liší.'
    sa, sb = re.search(r'\b(mala|velka)\b', normalized(source)), re.search(r'\b(mala|velka)\b', normalized(target))
    if sa and sb and sa[1] != sb[1]:
        return 'Malá a velká porce nejsou stejná norma.'
    families = [
        [r'\bveprov', r'\bkurec|\bkure\b', r'\bhovez', r'\bkruti', r'\bdrubez'],
        [r'\bhermelin\b', r'\bcihla\b', r'\btaven', r'\blucina\b', r'\bgervais\b'],
        [r'\btatarsk', r'\bkoprov', r'\brajsk'],
        [r'\bokurkov', r'\bmrkvov', r'\bledov', r'\bcoleslaw\b'],
        [r'\bpomazankov', r'\brostlinn', r'\bcerstve\b'],
        [r'\bkrupicov', r'\bkminov'],
        [r'\bmakovka\b', r'\bzavin\b', r'\bcroissant\b'],
        [r'\btlacenka\b', r'\bpastika\b'],
        [r'\brizoto\b', r'\bsendvic\b'],
        [r'\bsunkovy knedlik\b', r'\balpsky knedlik\b']]
    for family in families:
        aa = {i for i, pattern in enumerate(family) if re.search(pattern, normalized(source))}
        bb = {i for i, pattern in enumerate(family) if re.search(pattern, normalized(target))}
        if aa and bb and not aa & bb:
            return 'Přiřazená norma má jiný druh jídla nebo suroviny.'
    return ''


def automatic_warning(event, recipe, recipes, aliases):
    """Recheck explicit, unambiguous identity against files under the save lock."""
    if event.get('review') or event.get('learnAlias'):
        return 'Sporné přiřazení ani nový alternativní název nelze potvrdit automaticky.'
    if recipe.get('status') and recipe['status'] != 'active':
        return 'Neaktivní normu nelze přiřadit automaticky. Ověřte její použití ručně.'
    source = event['originalName']
    source_key = normalized(source)
    candidates = {rid for rid, item in recipes.items()
                  if source_key in {normalized(label) for label in [item.get('name', ''), *(item.get('alternativeNames') or [])]}
                  or aliases.get(source_key) == rid}
    if candidates != {event['recipeId']}:
        return 'Shoda už není jednoznačná. Obnovte import a přiřazení ověřte ručně.'
    target = recipe.get('name', '')
    def portions(value):
        value = re.sub(r'\bl00\b', '100', value, flags=re.I)
        return sorted((float(m[1].replace(',', '.')) * (1000 if m[2].lower() in {'kg', 'l'} else 1),
                       'g' if m[2].lower() in {'kg', 'g'} else 'ml' if m[2].lower() in {'l', 'ml'} else 'ks')
                      for m in re.finditer(r'\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|ks)\b', value, re.I))
    def bare(value):
        return normalized(re.sub(r'\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ks)\b', '', value, flags=re.I))
    a, b = bare(source), bare(target)
    if portions(source) != portions(target) or re.findall(r'\b(?:mala|velka)\b', a) != re.findall(r'\b(?:mala|velka)\b', b):
        return 'Velikost nebo gramáž není shodná na obou stranách. Potvrďte přiřazení ručně.'
    if re.findall(r'\b\d+\b', a) != re.findall(r'\b\d+\b', b):
        return 'Číslo varianty se liší. Potvrďte přiřazení ručně.'
    for marker in ['mastene', 'mr', 'smazene', 'zapecene', 'svickova', 's houb', 's brokolici', 's nudlemi', 's ryzi', 's kapanim']:
        if bool(re.search(r'\b' + marker + r'\b', a)) != bool(re.search(r'\b' + marker + r'\b', b)):
            return 'Úprava jídla se liší. Potvrďte přiřazení ručně.'
    return ''


def event_key(event, import_id=None, source=None):
    return (import_id or event.get('importId'), source if source is not None else event.get('sourceFile', ''),
            event.get('date', ''), event.get('meal', ''), normalized(event.get('originalName', '')), event.get('dietCode', ''))


def sync_history(recipe, previous):
    old_menu_dates = {event['date'] for event in previous.get('menuHistory', [])}
    manual = set(previous.get('history') or []) - old_menu_dates
    old_last = previous.get('lastServedAt')
    if old_last and old_last not in old_menu_dates:
        manual.add(old_last)
    dates = manual | {event['date'] for event in recipe.get('menuHistory', []) if not event.get('needsReview')}
    recipe['history'] = sorted(dates)
    recipe['lastServedAt'] = max(dates) if dates else None


def save(root, mapping, source, events, import_id):
    if not events:
        raise ValueError('Vyberte alespoň jednu položku.')
    mapping = dict(mapping)
    recipes = {rid: json.loads((root / relative).read_text(encoding='utf-8')) for rid, relative in mapping.items()}
    previous = json.loads(json.dumps(recipes))
    registry_path = root / 'menu-imports.json'
    registry = json.loads(registry_path.read_text(encoding='utf-8')) if registry_path.exists() else {'version': 1, 'imports': []}
    aliases_path = root / 'menu-aliases.json'
    aliases = json.loads(aliases_path.read_text(encoding='utf-8')) if aliases_path.exists() else {'version': 1, 'aliases': {}}
    if aliases.get('version') != 1 or not isinstance(aliases.get('aliases'), dict):
        raise ValueError('Poškozený slovník alternativních názvů.')
    entry = next((item for item in registry['imports'] if item['id'] == import_id), None)
    if entry and entry['sourceFile'] != source:
        raise ValueError('ID importu patří jinému zdrojovému souboru.')
    touched, seen = set(), set()
    saved = duplicates = reviewed = 0
    for event in events:
        rid = event['recipeId']
        if rid not in recipes:
            raise ValueError('Přiřazená norma již neexistuje.')
        warning = quantity_warning(recipes[rid]) or assignment_conflict(event['originalName'], recipes[rid]['name'])
        if not warning and event.get('automatic'):
            warning = automatic_warning(event, recipes[rid], recipes, aliases['aliases'])
        if warning:
            raise ValueError(warning)
        signature = event_key(event, import_id, source)
        if signature in seen:
            raise ValueError('Požadavek obsahuje stejnou položku vícekrát.')
        seen.add(signature)
        existing = [(old_rid, item) for old_rid, recipe in recipes.items() for item in recipe.get('menuHistory', []) if event_key(item) == signature]
        if len(existing) > 1:
            raise ValueError('Položka už má více přiřazení. Nejprve ověřte uložená data.')
        if event.get('review'):
            if not existing:
                raise ValueError('Uložené přiřazení k ověření nebylo nalezeno. Obnovte stránku.')
            old_rid, old_event = existing[0]
            if not old_event.get('needsReview'):
                if old_rid == rid:
                    duplicates += 1
                    continue
                raise ValueError('Přiřazení mezitím ověřilo jiné okno. Obnovte stránku.')
            confirmed = {key: value for key, value in old_event.items() if key not in {'needsReview', 'reviewWarning'}}
            recipes[old_rid]['menuHistory'].remove(old_event)
            recipes[rid].setdefault('menuHistory', []).append(confirmed)
            touched.update({old_rid, rid})
            reviewed += 1
        elif existing:
            old_rid, old_event = existing[0]
            if old_event.get('needsReview'):
                raise ValueError('Tato položka čeká na ověření původního přiřazení.')
            if old_rid != rid:
                raise ValueError('Položka již patří jiné normě. Použijte její ověření nebo náhradu.')
            duplicates += 1
            continue
        else:
            recipes[rid].setdefault('menuHistory', []).append({
                'date': event['date'], 'meal': event['meal'], 'originalName': event['originalName'],
                'dietCode': event.get('dietCode', ''), 'sourceFile': source, 'importId': import_id})
            touched.add(rid)
            saved += 1
        if event.get('learnAlias'):
            alias_key = normalized(event['originalName'])
            aliases['aliases'][alias_key] = rid
            alternative = recipes[rid].setdefault('alternativeNames', [])
            if alias_key not in {normalized(item) for item in alternative}:
                alternative.append(event['originalName'])
            touched.add(rid)
    files = {}
    for rid in touched:
        sync_history(recipes[rid], previous[rid])
        recipes[rid]['menuHistory'].sort(key=lambda item: (item.get('date', ''), item.get('meal', ''), item.get('originalName', '')))
        files[mapping[rid]] = folder_store.encode(recipes[rid])
    all_events = [event for recipe in recipes.values() for event in recipe.get('menuHistory', []) if event.get('importId') == import_id]
    dates = sorted({event['date'] for event in all_events})
    if not entry:
        entry = {'id': import_id, 'sourceFile': source, 'createdAt': datetime.datetime.now().astimezone().isoformat(timespec='seconds')}
        registry['imports'].append(entry)
    entry.update(saved=len(all_events), **({'from': dates[0], 'to': dates[-1]} if dates else {}))
    if touched:
        files['menu-aliases.json'] = folder_store.encode(aliases)
        files['menu-imports.json'] = folder_store.encode(registry)
        folder_store.commit(root, files)
    return {'saved': saved, 'duplicates': duplicates, 'reviewed': reviewed,
            'recipes': len({event['recipeId'] for event in events}), 'importId': import_id}
