/* Local, offline catalog. One atomic write per import; existing recipes are never overwritten. */
window.RecipeImports=(()=>{
 'use strict';
 const KEY='receptar:imported-norms:v1';
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=(v,max=1000)=>{if(typeof v!=='string'||v.length>max)throw Error('Neplatný text v normě.');return v};
 const num=v=>{if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('Neplatné číslo v normě.');return v};
 function clean(r){
  if(!r||typeof r!=='object')throw Error('Neplatná norma.');
  const id=text(r.id,150);if(!/^docx-[a-z0-9-]+$/.test(id))throw Error('Neplatné ID normy.');
  const name=text(r.name,250);if(!name.trim())throw Error('Norma nemá název.');
  if(!Number.isInteger(r.servings)||r.servings<1||r.servings>100000)throw Error('Neplatný počet porcí.');
  if(!Array.isArray(r.ingredients)||!r.ingredients.length||r.ingredients.length>500)throw Error('Chybějí suroviny.');
  const ingredients=r.ingredients.map(i=>{const unit=text(i.unit,10);if(!['kg','g','l','ml','ks'].includes(unit))throw Error('Neplatná jednotka.');return {name:text(i.name,250),amount:num(i.amount),unit,perServing:i.perServing==null?null:text(i.perServing,100),needsClarification:!!i.needsClarification}});
  const n={};for(const k of ['energyKj','energyKcalApprox','proteinG','fatG','carbohydratesG','fiberG','calciumMg','ironMg','vitaminAUg','vitaminB1Mg','vitaminB2Mg','vitaminCMg'])n[k]=num(r.nutritionPerServing?.[k]??null);
  const warnings=Array.isArray(r.importWarnings)?r.importWarnings.map(w=>text(w,1200)).slice(0,100):[];
  return {id,name,sourceVariant:text(r.sourceVariant||'',250),servings:r.servings,ingredients,nutritionPerServing:n,
   source:text(r.source||'DOCX',250),sourceFile:text(r.sourceFile||'',250),importedAt:text(r.importedAt||'',60),
   description:text(r.description||'Norma importovaná z DOCX.',1000),planningNote:text(r.planningNote||'',8000),
   importWarnings:warnings,pricePerServingCzk:num(r.pricePerServingCzk??null),
   nutritionReview:text(r.nutritionReview||'Přepis DOCX; správnost zdrojové výživy není nezávisle ověřena.',1500),
   mealTypes:(r.mealTypes||[]).filter(x=>['Snídaně','Oběd','Svačina','Večeře','Polévka','Příloha'].includes(x)),
   category:text(r.category||'',80),meatType:text(r.meatType||'',80),sideDish:text(r.sideDish||'',100),preparationType:text(r.preparationType||'',80),
   popularity:[1,2,3].includes(r.popularity)?r.popularity:null,
   season:{availability:text(r.season?.availability||'',80),recommended:(r.season?.recommended||[]).map(v=>text(v,80)),recommendedDisplay:text(r.season?.recommendedDisplay||'',150),months:text(r.season?.months||'',150),monthNumbers:(r.season?.monthNumbers||[]).filter(v=>Number.isInteger(v)&&v>=1&&v<=12)},
   history:(r.history||[]).filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)),lastServedAt:r.lastServedAt?text(r.lastServedAt,10):null,rotationDays:{1:60,2:90,3:120}[r.popularity]||null,
   status:['active','paused','archived'].includes(r.status)?r.status:'active',completionStatus:'needs-completion',image:/^[a-zA-Z0-9._-]+$/.test(r.image||'')?r.image:null,allergens:[],allergensIncomplete:true,alternativeNames:(r.alternativeNames||[]).map(v=>text(v,250)),_imported:true};
 }
 function localList(){const raw=localStorage.getItem(KEY);if(!raw)return [];let data;try{data=JSON.parse(raw)}catch{throw Error('Uložený katalog importů je poškozený. Nic se nepřepsalo.');}if(data.version!==1||!Array.isArray(data.recipes))throw Error('Nepodporovaná verze katalogu.');return data.recipes.map(clean)}
 const identity=r=>norm(r.name)+'|'+norm(r.sourceVariant).split(' ').sort().join(' ');
 const signature=r=>JSON.stringify([r.servings,r.ingredients.map(i=>[norm(i.name),i.amount,i.unit]),r.nutritionPerServing]);
 function combine(base){const ids=new Set(base.map(r=>r.id));return [...base,...list().filter(r=>!ids.has(r.id))]}
 function save(records,builtins=[]){
  const old=list(),next=localList(),results=[];let added=0;
  for(const input of records){
   const r=clean(input),existing=[...old,...next].find(x=>identity(x)===identity(r)||x.id===r.id);
   if(existing){results.push({name:r.name,state:signature(existing)===signature(r)?'duplicate':'conflict',id:existing.id});continue;}
   if(builtins.some(x=>norm(x.name)===norm(r.name)&&(!x.sourceVariant||identity(x)===identity(r)))){results.push({name:r.name,state:'conflict'});continue;}
   next.push(r);added++;results.push({name:r.name,state:'added',id:r.id,warnings:r.importWarnings});
  }
  if(added){try{localStorage.setItem(KEY,JSON.stringify({version:1,recipes:next}))}catch{throw Error('Normy nebyly uloženy: prohlížeč nemá dost místa nebo blokuje úložiště. Vytvořte zálohu; dosavadní katalog zůstává zachován.');}}
  return results;
 }
 async function lockedSave(records,builtins){await ready;const run=async()=>{const result=save(records,builtins);await persistDisk();return result};return navigator.locks?navigator.locks.request(KEY,run):run()}
 function display(value){if(typeof value==='string')return esc(value);if(Array.isArray(value))return value.map(display);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,display(v)]));return value}
 function imageHref(r){const entry=fileEntries.find(e=>e.id===r.id);return r.image&&entry?entry.file.slice(0,entry.file.lastIndexOf('/')+1)+r.image:null}
 function href(r){return r._imported?(fileEntries.find(e=>e.id===r.id)?.page||'imported-recipe.html?id='+encodeURIComponent(r.id)):`Recepty/${encodeURIComponent(r._folder)}/${encodeURIComponent(r.id)}.html?v=55`}
 function backup(){return JSON.stringify({format:'receptar-docx-backup',version:1,exportedAt:new Date().toISOString(),recipes:list()},null,2)}
 function restore(raw,builtins){const d=JSON.parse(raw);if(d.format!=='receptar-docx-backup'||d.version!==1||!Array.isArray(d.recipes)||d.recipes.length>2000)throw Error('Neplatná záloha importovaných norem.');return lockedSave(d.recipes.map(clean),builtins)}
 async function update(id,changes){await ready;const run=async()=>{const original=list().find(r=>r.id===id);if(!original)throw Error('Norma nenalezena.');const records=localList(),updated=clean({...original,...changes}),index=records.findIndex(r=>r.id===id);if(index<0)records.push(updated);else records[index]=updated;localStorage.setItem(KEY,JSON.stringify({version:1,recipes:records}));await persistDisk();return updated};return navigator.locks?navigator.locks.request(KEY,run):run()}

 let published=[],revision=null,diskAvailable=false,diskMessage='',fileEntries=[],sourceDocument=null;
 function catalog(data){if(data.version!==1||!Array.isArray(data.recipes)||data.recipes.length>2000)throw Error('Neplatný katalog na disku.');return data.recipes.map(clean)}
 function list(){const merged=new Map(published.map(r=>[r.id,r]));for(const r of localList())merged.set(r.id,r);return [...merged.values()]}
 const ready=(async()=>{
  const response=await fetch('imported-index.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Nelze načíst rejstřík imported-index.json.');
  const index=await response.json();if(index.version!==1||!Array.isArray(index.recipes))throw Error('Neplatný rejstřík.');
  fileEntries=index.recipes;revision=index.revision;
  published=await Promise.all(fileEntries.map(async entry=>{if(!/^Recepty\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(entry.file))throw Error('Neplatná cesta normy.');const r=await fetch(entry.file,{cache:'no-cache'});if(!r.ok)throw Error('Nelze načíst '+entry.file);const recipe=clean(await r.json());if(recipe.id!==entry.id)throw Error('Nesouhlasí ID normy.');return recipe}));
  if(['localhost','127.0.0.1'].includes(location.hostname))try{const r=await fetch('__recipe_storage',{cache:'no-store'});diskAvailable=r.ok&&(await r.json()).storage==='recipe-disk-v1'}catch{}
  diskMessage=diskAvailable?'Místní zápis na disk je připraven. Import i úpravy importovaných norem se ukládají jednotlivě do složek Recepty/<název>/.':'Webový režim: nové importy a úpravy zůstávají v tomto prohlížeči. Pro zveřejnění obnovte zálohu na místním PC a nahrajte změněné složky a imported-index.json do GitHubu.';
 })();
 ready.catch(()=>{});
 async function persistDisk(){
  if(!diskAvailable)return false;
  try{
   const response=await fetch('__recipe_storage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,baseRevision:revision,recipes:list(),sourceDocument})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Zápis selhal.');
   published=catalog(data);revision=data.revision;fileEntries=data.index.recipes;sourceDocument=null;
   // Remove only overlays identical to the saved version; keep any newer edits from other tabs.
   try{if('caches' in window){const names=(await caches.keys()).filter(name=>name.startsWith('receptar-v'));if(names.length){for(const name of names){const cache=await caches.open(name);await cache.put(new URL('imported-index.json',document.baseURI).href,new Response(JSON.stringify(data.index),{headers:{'Content-Type':'application/json'}}));for(const entry of fileEntries){await cache.put(new URL(entry.file,document.baseURI).href,new Response(JSON.stringify(published.find(r=>r.id===entry.id)),{headers:{'Content-Type':'application/json'}}))}}const saved=new Map(published.map(r=>[r.id,JSON.stringify(r)]));const pending=localList().filter(r=>saved.get(r.id)!==JSON.stringify(r));localStorage.setItem(KEY,JSON.stringify({version:1,recipes:pending}))}}}catch{}
   diskMessage='Uloženo na disk: '+published.length+' norem v samostatných složkách Recepty/. Na GitHub nahrajte změněné složky a imported-index.json.';return true;
  }catch(error){diskMessage='POZOR: Na disk se neuložilo: '+error.message+' Normy zůstávají v prohlížeči; zopakujte uložení nebo stáhněte katalog.';return false}
 }
 async function syncDisk(){await ready;const run=()=>persistDisk();return navigator.locks?navigator.locks.request(KEY,run):run()}
 function diskStatus(){return diskMessage}
 async function setSourceFile(file){if(file.size>8*1024*1024)throw Error('Podklad smí mít nejvýše 8 MB.');sourceDocument={name:file.name,base64:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Nelze načíst podklad.'));reader.readAsDataURL(file)})}}
 function exportCatalog(){return JSON.stringify({version:1,revision,recipes:list()},null,2)}
 return {imageHref,ready,setSourceFile,syncDisk,diskStatus,exportCatalog,list,combine,save:lockedSave,backup,restore,update,esc,display,href,norm,clean,signature,identity};
})();
