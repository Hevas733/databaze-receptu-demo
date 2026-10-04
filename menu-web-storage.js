/* GitHub Pages: published data is a starting snapshot; edits stay in this browser. */
window.MenuWebStorage=(()=>{
  const key='receptar:menu-history:v1';
  const local=['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
  function overlayCatalog(recipes){
    if(local)return recipes;
    const imported=JSON.parse(localStorage.getItem('receptar:imported-norms:v1')||'{"recipes":[]}');
    const overrides=new Map((imported.recipes||[]).map(recipe=>[recipe.id,recipe]));
    const result=recipes.map(recipe=>{
      const patch=overrides.get(recipe.id)||JSON.parse(localStorage.getItem('receptar:'+recipe.id)||'{}');
      overrides.delete(recipe.id);
      return {...recipe,...patch,menuHistory:recipe.menuHistory||[]};
    });
    for(const recipe of overrides.values())result.push({...recipe,_detailHref:'recipe-detail.html?imported=1&id='+encodeURIComponent(recipe.id)});
    return result;
  }
  async function read(recipes){
    const [registry,aliases]=await Promise.all(['menu-imports.json','menu-aliases.json'].map(async file=>{
      const response=await fetch(file,{cache:'no-cache'});
      if(!response.ok)throw Error('Nelze načíst '+file);
      return response.json();
    }));
    const raw=localStorage.getItem(key);
    const data=raw?JSON.parse(raw):{version:1,imports:[],events:[],aliases:{}};
    if(data.version!==1||!Array.isArray(data.imports)||!Array.isArray(data.events))throw Error('Neplatná data jídelníčku v prohlížeči.');
    const seeded=new Set(data.publishedImports||[]);
    const signature=event=>JSON.stringify([event.importId,event.recipeId,event.date,event.meal,event.originalName,event.dietCode||'']);
    const known=new Set(data.events.map(signature));
    for(const meta of registry.imports||[]){
      if(seeded.has(meta.id))continue;
      if(!data.imports.some(item=>item.id===meta.id))data.imports.push(meta);
      for(const recipe of recipes)for(const source of recipe.menuHistory||[]){
        if(source.importId!==meta.id)continue;
        const event={...source,recipeId:recipe.id};
        if(!known.has(signature(event))){data.events.push(event);known.add(signature(event))}
      }
      seeded.add(meta.id);
    }
    data.publishedImports=[...seeded];
    data.aliases={...aliases.aliases,...data.aliases};
    localStorage.setItem(key,JSON.stringify(data));
    return data;
  }
  return {local,read,overlayCatalog};
})();
