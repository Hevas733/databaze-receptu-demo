"""Validated builtin edits, sharing folder_store's backup/atomic replacement path."""
import copy
import datetime
import hashlib
import json
import math
import re
import folder_store

STATE = 'builtin-storage-state.json'
EDITABLE = {'name', 'description', 'alternativeNames', 'planningNote', 'servings', 'ingredients', 'nutritionPerServing',
            'pricePerServingCzk', 'meatType', 'sideDish', 'preparationType', 'status',
            'popularity', 'lastServedAt', 'season', 'mealTypes', 'foodType', 'flavor', 'rotationIntervalDays'}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def relative_path(root, rid):
    if not isinstance(rid, str) or not re.fullmatch(r'[a-z0-9-]{1,150}', rid):
        raise ValueError('Neplatné ID receptu.')
    catalog = json.loads((root/'builtin-recipes.json').read_text(encoding='utf-8'))
    if rid not in {item['id'] for item in catalog}:
        raise ValueError('Recept není v seznamu vestavěných receptů.')
    return f'Recepty/{rid}/{rid}.json'


def state(root):
    path = folder_store.safe(root, STATE)
    result = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'version': 1, 'overlays': {}}
    if result.get('version') != 1 or not isinstance(result.get('overlays'), dict):
        raise ValueError('Poškozený stav migrace překryvů.')
    return result


def load(root, rid):
    raw = folder_store.safe(root, relative_path(root, rid)).read_bytes()
    recipe = json.loads(raw)
    if recipe.get('id') != rid:
        raise ValueError('ID souboru neodpovídá receptu.')
    return {'storage': 'builtin-disk-v1', 'revision': digest(raw), 'recipe': recipe,
            'overlayHash': state(root)['overlays'].get('receptar:'+rid)}


def text(value, limit=10000):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError('Neplatná nebo příliš dlouhá textová hodnota.')


def strings(value, limit=100):
    if not isinstance(value, list) or len(value) > limit:
        raise ValueError('Neplatný seznam.')
    for item in value:
        text(item, 500)


def date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Neplatné datum.')
    datetime.date.fromisoformat(value)


def merge(recipe, patch):
    if not isinstance(patch, dict) or not patch or set(patch) - EDITABLE:
        raise ValueError('Nepovolená pole úpravy receptu.')
    for key, value in patch.items():
        if key in {'name', 'description', 'planningNote', 'meatType', 'sideDish', 'preparationType', 'status', 'foodType', 'flavor'}:
            text(value)
            if key == 'name' and not value.strip():
                raise ValueError('Název nesmí být prázdný.')
        elif key in {'alternativeNames', 'mealTypes'}:
            strings(value)
        elif key == 'ingredients':
            if not isinstance(value, list) or not 1 <= len(value) <= 500:
                raise ValueError('Norma musí mít 1 až 500 surovin.')
            for ingredient in value:
                if not isinstance(ingredient, dict):
                    raise ValueError('Neplatná surovina.')
                text(ingredient.get('name'), 250)
                if not ingredient['name'].strip() or ingredient.get('unit') not in {'kg', 'g', 'l', 'ml', 'ks'}:
                    raise ValueError('Surovina musí mít název a platnou jednotku.')
                amount = ingredient.get('amount')
                if type(amount) not in (int, float) or not math.isfinite(amount) or amount <= 0:
                    raise ValueError('Množství suroviny musí být kladné číslo.')
                if ingredient.get('perServing') is not None:
                    text(ingredient['perServing'], 100)
        elif key == 'nutritionPerServing':
            if not isinstance(value, dict) or len(value) > 30:
                raise ValueError('Neplatné nutriční hodnoty.')
            for field, amount in value.items():
                if not isinstance(field, str) or len(field) > 60 or (amount is not None and
                        (type(amount) not in (int, float) or not math.isfinite(amount) or amount < 0)):
                    raise ValueError('Nutriční hodnoty musí být nezáporná čísla nebo prázdné údaje.')
        elif key in {'servings', 'pricePerServingCzk', 'popularity'}:
            if value is None and key != 'servings':
                continue
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValueError('Neplatná číselná hodnota.')
            if (key == 'servings' and not 0 < value <= 100000) or (key == 'pricePerServingCzk' and not 0 <= value <= 10000000):
                raise ValueError('Počet porcí nebo cena je mimo povolený rozsah.')
            if key == 'popularity' and value not in (1, 2, 3):
                raise ValueError('Oblíbenost musí být 1, 2, 3 nebo neurčena.')
        elif key == 'rotationIntervalDays':
            if value is not None and (type(value) is not int or not 0 <= value <= 3650):
                raise ValueError('Rotace musí být celé číslo od 0 do 3650 dní.')
        elif key == 'lastServedAt' and value is not None:
            date(value)
        elif key == 'season':
            if not isinstance(value, dict) or set(value) - {'availability', 'recommendedDisplay', 'recommended', 'months', 'monthNumbers'}:
                raise ValueError('Neplatná sezóna.')
            for field, item in value.items():
                if field == 'recommended':
                    strings(item, 12)
                elif field == 'monthNumbers':
                    if not isinstance(item, list) or any(type(month) is not int or month < 1 or month > 12 for month in item):
                        raise ValueError('Neplatné měsíce.')
                else:
                    text(item, 500)
    if 'status' in patch and patch['status'] not in {'active', 'paused', 'archived'}:
        raise ValueError('Neplatný stav receptu.')
    updated = copy.deepcopy(recipe)
    updated.update(copy.deepcopy(patch))
    if 'season' in patch:
        updated['season'] = {**recipe.get('season', {}), **patch['season']}
        # Never leave machine-readable months contradicting an edited free-text range.
        if 'monthNumbers' in patch['season']:
            updated['season']['monthNumbers'] = patch['season']['monthNumbers']
        elif patch['season'].get('months', recipe.get('season', {}).get('months')) != recipe.get('season', {}).get('months'):
            updated['season'].pop('monthNumbers', None)
    if 'popularity' in patch or 'mealTypes' in patch:
        automatic = any(meal in {'Snídaně', 'Svačina', 'Příloha'} for meal in updated.get('mealTypes', []))
        updated['rotationDays'] = None if 'Pečivo' in updated.get('mealTypes', []) else 30 if automatic else {1: 60, 2: 90, 3: 120}.get(updated.get('popularity'))
    # The norm editor must not erase dates established by a menu import.
    if 'lastServedAt' in patch:
        dates = [e['date'] for e in recipe.get('menuHistory', []) if isinstance(e, dict) and e.get('date')]
        if dates:
            updated['lastServedAt'] = max([patch['lastServedAt'] or '', *dates])
    return updated


def save(root, rid, patch, revision):
    current = load(root, rid)
    if not isinstance(revision, str) or revision != current['revision']:
        return None
    updated = merge(current['recipe'], patch)
    folder_store.commit(root, {relative_path(root, rid): folder_store.encode(updated)})
    return load(root, rid)

