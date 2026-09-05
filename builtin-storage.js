/* Local edits require a confirmed disk write. Static hosting retains browser-only edits. */
window.BuiltinStorage=(()=>{
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const editable=['name','description','alternativeNames','planningNote','servings','pricePerServingCzk','meatType','sideDish','preparationType','status','popularity','lastServedAt','season','mealTypes'];
  const diskError='Diskové úložiště není dostupné. Spusťte místní server a načtěte stránku znovu. Změny nebyly uloženy.';
  const id=key=>key.replace(/^receptar:/,'');
  async function request(path,options={}){
    let response;
    try{response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(15000),...options})}catch{throw Error(diskError)}
    let data;
    try{data=await response.json()}catch{throw Error(diskError)}
    if(!response.ok)throw Error(data.error||diskError);
    if(data.storage!=='builtin-disk-v1'||!data.recipe||!data.revision)throw Error(diskError);
    return data;
  }
  function overlay(key){
    const raw=localStorage.getItem(key);
    return raw;
  }
  async function hash(raw){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function load(url,key){
    if(local){
      const data=await request('/__builtin_recipe?id='+encodeURIComponent(id(key)));
      const raw=overlay(key);
      if(raw!==null&&await hash(raw)!==data.overlayHash){
        throw Error('Tento prohlížeč obsahuje nepřevedené změny receptu '+data.recipe.name+'. Nejprve vytvořte snímek na stránce browser-data-backup.html a dokončete migraci. Data nebyla smazána.');
      }
      return {...data.recipe,_diskRevision:data.revision};
    }
    const response=await fetch(url,{cache:'no-cache'});
    if(!response.ok)throw Error('Soubor receptu se nepodařilo načíst.');
    const source=await response.json();
    let saved={};try{saved=JSON.parse(overlay(key)||'{}')}catch{}
    return {...source,...saved,season:{...source.season,...saved?.season}};
  }
  async function save(key,patch,base){
    const clean=Object.fromEntries(editable.filter(field=>Object.hasOwn(patch,field)).map(field=>[field,patch[field]]));
    if(local){
      const data=await request('/__builtin_recipe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id(key),baseRevision:base._diskRevision,patch:clean})});
      return {...data.recipe,_diskRevision:data.revision};
    }
    // Keep the full legacy overlay so future partial edits cannot discard older browser edits.
    let previous={};try{previous=JSON.parse(overlay(key)||'{}')}catch{}
    const saved={...previous,...clean,season:{...base.season,...clean.season}};
    if(Object.hasOwn(clean,'popularity'))saved.rotationDays=({1:60,2:90,3:120})[clean.popularity]||null;
    localStorage.setItem(key,JSON.stringify(saved));
    return {...base,...saved};
  }
  function status(message,isError=false){
    let node=document.getElementById('builtinStorageStatus');
    if(!node){node=document.createElement('p');node.id='builtinStorageStatus';node.setAttribute('role','status');node.style.cssText='padding:12px;border:1px solid #aebdce;border-radius:8px;background:#f3f7fb;color:#20324c;';(document.querySelector('.detail-toolbar')||document.querySelector('main')||document.body).append(node)}
    node.textContent=message;node.style.color=isError?'#a21919':'#20324c';
  }
  function keepOptions(form,recipe){
    // Existing data uses e.g. “Pečení”, while some old selects only contain “Pečené”.
    const values={...recipe,availability:recipe.season?.availability,recommended:recipe.season?.recommendedDisplay||recipe.season?.recommended?.join('–'),popularity:recipe.popularity??''};
    for(const select of form.querySelectorAll('select')){
      const value=String(values[select.name]??'');
      if(!Array.from(select.options).some(option=>option.value===value))select.add(new Option(value||'Neurčeno',value));
    }
  }
  const label=local?'Ukládání: soubor receptu na disku přes místní server.':'Ukládání: pouze tento prohlížeč. GitHub Pages nepíše na váš disk.';
  return {local,load,save,status,keepOptions,label,savedMessage:local?'Změny byly uloženy na disk.':'Změny byly uloženy pouze v tomto prohlížeči.'};
})();
