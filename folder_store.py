"""Per-recipe files and a small index; paths are chosen by the server only."""
import base64
import hashlib
import html
import json
import os
from pathlib import Path
import re
import unicodedata
import uuid

INDEX = 'imported-index.json'
def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n').encode('utf-8')

def safe(root, relative):
    path=root/relative
    if not path.resolve().is_relative_to(root.resolve()) or any(p.startswith('.') for p in Path(relative).parts):
        raise ValueError('Neplatná cesta normy.')
    if path.is_symlink():
        raise ValueError('Soubor normy nesmí být symbolický odkaz.')
    return path

def load(root):
    index=json.loads((root/INDEX).read_text(encoding='utf-8'))
    recipes=[]
    for entry in index['recipes']:
        raw=safe(root,entry['file']).read_bytes()
        recipe=json.loads(raw)
        if recipe['id']!=entry['id']:
            raise ValueError('ID v rejstříku neodpovídá normě.')
        recipes.append(recipe)
    return {'version':1,'revision':index['revision'],'recipes':recipes,'index':index}

def plan(root, data, template, previous=None):
    previous=previous or {'recipes':[]}
    old={e['id']:e for e in previous['recipes']}
    entries=[];files={};used=set()
    source=data.get('sourceDocument')
    source_bytes=None
    if source:
        if not isinstance(source.get('name'),str) or not source['name'].lower().endswith('.docx'):
            raise ValueError('Podklad musí být DOCX.')
        source_bytes=base64.b64decode(source['base64'],validate=True)
        if len(source_bytes)>8*1024*1024 or not source_bytes.startswith(b'PK'):
            raise ValueError('Neplatný nebo příliš velký DOCX podklad.')
    for recipe in data['recipes']:
        rid=recipe['id']
        if rid in old:
            entry=old[rid].copy();folder=Path(entry['file']).parent.as_posix();slug=Path(folder).name
            safe(root,entry['file'])
        else:
            slug=re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',recipe['name']).encode('ascii','ignore').decode().lower()).strip('-')[:90] or 'norma'
            if slug.upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(10)],*[f'LPT{i}' for i in range(10)]}:slug='norma-'+slug
            candidate=slug;number=1
            while (root/'Recepty'/candidate).exists() or candidate in used:
                number+=1;candidate=f'{slug}-{number}'
            slug=candidate;folder='Recepty/'+slug
            entry={'id':rid,'name':recipe['name'],'file':f'{folder}/{slug}.json','page':f'{folder}/{slug}.html'}
        used.add(slug);entry['name']=recipe['name'];entries.append(entry)
        files[entry['file']]=encode(recipe)
        if rid not in old:
            page=template.replace('<head>','<head><base href="../../">',1).replace('<body ',f'<body data-recipe-id="{html.escape(rid,quote=True)}" ',1).replace('<title>Importovaná norma</title>',f'<title>{html.escape(recipe["name"])}</title>')
            files[entry['page']]=page.encode('utf-8')
            note=f'# {recipe["name"]}\n\nZdroj: {recipe.get("sourceFile", "neuveden")}\n\nImport: {recipe.get("importedAt", "neuvedeno")}\n\nÚdaje normy jsou v {slug}.json, detail v {slug}.html. Podklady jsou ve složce podklady. Neznámé údaje nebyly odhadovány.\n\n'
            note+='\n'.join('- '+w for w in recipe.get('importWarnings',[]))+'\n'
            files[f'{folder}/IMPORT.md']=note.encode('utf-8')
            files[f'{folder}/podklady/README.md']='Sem patří originální podklady normy. DOCX se při novém místním importu ukládá automaticky.\n'.encode('utf-8')
        if source_bytes is not None and recipe.get('sourceFile')==source['name']:
            name=re.sub(r'[^\w. -]','_',Path(source['name']).name).strip('. ') or 'podklad.docx'
            relative=f'{folder}/podklady/{name}'
            target=safe(root,relative)
            if target.exists() and target.read_bytes()!=source_bytes:
                relative=f'{folder}/podklady/{Path(name).stem}-{hashlib.sha256(source_bytes).hexdigest()[:10]}.docx'
            files[relative]=source_bytes
    index={'version':1,'revision':uuid.uuid4().hex,'recipes':entries}
    files[INDEX]=encode(index)
    return files,index

def commit(root, files):
    # Save every previous file before the first mutation; replace index last.
    backup=root/'.recipe-backups'/uuid.uuid4().hex
    if not backup.resolve().is_relative_to(root.resolve()):raise ValueError('Neplatná složka záloh.')
    originals={name:safe(root,name).read_bytes() if safe(root,name).exists() else None for name in files}
    for name,raw in originals.items():
        if raw is not None:
            path=backup/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
    changed=[]
    try:
        for name,raw in files.items():
            path=safe(root,name);path.parent.mkdir(parents=True,exist_ok=True)
            tmp=path.with_name('.'+path.name+'.tmp-'+uuid.uuid4().hex)
            try:
                with tmp.open('xb') as out:out.write(raw);out.flush();os.fsync(out.fileno())
                os.replace(tmp,path)
                changed.append(name)
            finally:
                if tmp.exists():tmp.unlink()
    except Exception:
        for name in reversed(changed):
            path=safe(root,name)
            if originals[name] is None:path.unlink()
            else:path.write_bytes(originals[name])
        raise
