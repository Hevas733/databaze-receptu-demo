/* Local, offline catalog. One atomic write per import; existing recipes are never overwritten. */
window.RecipeImports=(()=>{
 'use strict';
 const KEY='receptar:imported-norms:v1';
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=(v,max=1000)=>{if(typeof v!=='string'||v.length>max)throw Error('Neplatný text v normě.');return v};
 const num=v=>{if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('Neplatné číslo v normě.');return v};
 const FOOD_TYPES=['Hlavní jídlo','Polévka','Příloha','Nápoj','Pečivo','Svačina'];
 const FLAVORS=['Slané','Sladké','Neutrální'];
 const MONTH_LABELS=['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
 const MONTH_KEYS=MONTH_LABELS.map(norm);
 const isActive=r=>!r.status||r.status==='active';
 function seasonMonths(season={}){
  const direct=(season.monthNumbers||[]).filter(v=>Number.isInteger(v)&&v>=1&&v<=12);
  if(direct.length)return [...new Set(direct)].sort((a,b)=>a-b);
  const raw=String(season.months||''),words=norm(raw).split(' ').filter(word=>MONTH_KEYS.includes(word));
  if(norm(raw)==='celorocne')return MONTH_LABELS.map((_,index)=>index+1);
  if(words.length===2&&/[–—-]/.test(raw)){const out=[];let index=MONTH_KEYS.indexOf(words[0]);for(let count=0;count<12;count++,index=(index+1)%12){out.push(index+1);if(MONTH_KEYS[index]===words[1])break}return out}
  if(words.length)return [...new Set(words.map(word=>MONTH_KEYS.indexOf(word)+1))].sort((a,b)=>a-b);
  const seasons=(season.recommended||[]).map(norm),map={jaro:[3,4,5],leto:[6,7,8],podzim:[9,10,11],zima:[12,1,2]};
  const fromSeason=[...new Set(seasons.flatMap(value=>map[value]||[]))];
  return fromSeason.length?fromSeason.sort((a,b)=>a-b):norm(season.availability)==='celorocne'?MONTH_LABELS.map((_,index)=>index+1):[];
 }
 function foodTypeOf(r={}){if(r.foodType==='Dezert'||r.category==='Dezert')return 'Svačina';if(FOOD_TYPES.includes(r.foodType))return r.foodType;if(FOOD_TYPES.includes(r.category))return r.category;if((r.mealTypes||[]).includes('Polévka'))return 'Polévka';if((r.mealTypes||[]).includes('Příloha'))return 'Příloha';return 'Hlavní jídlo'}
 function flavorOf(r={},foodType=foodTypeOf(r)){if(foodType==='Nápoj')return 'Neutrální';if(FLAVORS.includes(r.flavor))return r.flavor;return 'Slané'}
 function defaultRotationConfig(r={}){
  if((r.mealTypes||[]).includes('Pečivo'))return {key:'bread',active:false,editable:false,automatic:true,options:[],interval:null,longAfter:null,forgottenAfter:null,label:'Bez rotace – pečivo',detail:'Pečivo lze zařazovat opakovaně během týdne. Oblíbenost se nepoužívá.'};
  const automaticMeals=(r.mealTypes||[]).filter(meal=>['Snídaně','Svačina','Příloha'].includes(meal));
  if(automaticMeals.length)return {key:'automatic-30',active:true,editable:false,automatic:true,options:[],interval:30,longAfter:60,forgottenAfter:90,label:'Automatická rotace 30 dní',detail:'Podle zařazení: '+automaticMeals.join(', ')+'. Oblíbenost se pro tuto rotaci nepoužívá.'};
  const popularity=r.popularity,interval=({1:60,2:90,3:120})[popularity];
  const options=[{value:1,label:'1 · rotace 60 dní'},{value:2,label:'2 · rotace 90 dní'},{value:3,label:'3 · rotace 120 dní'}];
  return {key:interval?'popularity-'+popularity:'unset',active:true,editable:true,options,interval:interval||null,longAfter:interval?interval+30:null,forgottenAfter:interval?interval+60:null,label:interval?'Doporučená rotace '+interval+' dní':'Nastavte oblíbenost',detail:interval?'Dlouho nepoužito 30 dní po rotaci, zapomenuté 60 dní po rotaci.':'Vyberte oblíbenost 1, 2 nebo 3. Bez výběru zůstává norma k doplnění.'};
 }
 // Calendar-day arithmetic avoids time-of-day and daylight-saving shifts.
 const DAY_MS=86400000;
 function dayNumber(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [y,m,d]=value.split('-').map(Number),stamp=Date.UTC(y,m-1,d),date=new Date(stamp);
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?stamp/DAY_MS:null;
 }
 function todayString(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}
 function dayString(day){return new Date(day*DAY_MS).toISOString().slice(0,10)}
 function dateText(value){return new Date(value+'T12:00:00').toLocaleDateString('cs-CZ')}
 function rotationConfig(r={}){
  const base=defaultRotationConfig(r),options=(base.options||[]).map(option=>({...option,label:option.label.split(' · dlouho nebylo')[0]}));
  return {...base,options,label:base.automatic?base.label:base.interval?'Doporučená rotace '+base.interval+' dní':base.active?'Doporučená rotace nenastavena':'Bez doporučené rotace',detail:base.automatic?base.detail:base.interval?'Doporučený odstup '+base.interval+' dní. Jídlo lze zařadit i dříve.':base.detail};
 } function usageDates(r){
  let events=[];
  // On static hosting the menu importer keeps its history in browser storage.
  if(!['localhost','127.0.0.1'].includes(location.hostname))try{const data=JSON.parse(localStorage.getItem('receptar:menu-history:v1')||'null');if(data?.version===1&&Array.isArray(data.events))events=data.events.filter(event=>event.recipeId===r.id).map(event=>event.date)}catch{}
  return [...new Set([...(r.history||[]),...(r.menuHistory||[]).map(event=>event.date),r.lastServedAt,...events].filter(value=>dayNumber(value)!==null))].sort();
 }
 function rotationState(r={},today=new Date(),cutoff=null){
  const config=rotationConfig(r),asOf=typeof today==='string'?today:todayString(today);
  const dates=usageDates(r).filter(date=>!cutoff||date<=cutoff),last=dates.at(-1)||null;
  if(!isActive(r))return {key:'inactive',label:'Neaktivní – nepoužívaná',detail:'Norma je uložená, ale nenabízí se pro nové plánování. Historie zůstává zachovaná.',config,last};
  if(!config.active)return {key:'off',label:'Lze použít – bez doporučené rotace',detail:config.detail,config,last};
  if(!config.interval)return {key:'unset',label:'Doporučená rotace nenastavena',detail:'Vyberte oblíbenost 1, 2 nebo 3.',config,last};
  if(!last)return {key:'none',label:'Lze použít – bez historie',detail:'Zatím není zaznamenáno použití.',config,last};
  const nextDay=dayString(dayNumber(last)+config.interval),overdueDays=dayNumber(asOf)-dayNumber(nextDay);
  return {key:overdueDays>=0?'ready':'early',label:'Lze použít od '+dateText(nextDay),detail:overdueDays>=0?'Po doporučené rotaci '+overdueDays+' dní':'Do doporučené rotace zbývá '+(-overdueDays)+' dní',last,next:new Date(nextDay+'T12:00:00'),nextDay,elapsed:dayNumber(asOf)-dayNumber(last),overdueDays,config};
 }
 function rotationMonth(r,month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
  const [year,number]=month.split('-').map(Number),end=dayString(Date.UTC(year,number,0)/DAY_MS);
  const state=rotationState(r,end,end),suitable=seasonMonths(r.season).includes(number);
  return {state,end,eligible:suitable&&isActive(r)&&['ready','none','off'].includes(state.key)};
 }
 function normalizeSeason(season={}){const monthNumbers=seasonMonths(season),months=monthNumbers.map(number=>MONTH_LABELS[number-1]).join(', ');return {availability:monthNumbers.length===12&&season.availability!=='Sezónní'?'Celoročně':monthNumbers.length?'Sezónní':text(season.availability||'',80),recommended:(season.recommended||[]).map(v=>text(v,80)),recommendedDisplay:text(season.recommendedDisplay||'',150),months:months||text(season.months||'',150),monthNumbers}}
 function rawCompletionIssues(r){
  const issues=[];
  if(!Array.isArray(r.mealTypes)||!r.mealTypes.length)issues.push('podávání');
  if(!FLAVORS.includes(r.flavor))issues.push('charakter');
  if(!seasonMonths(r.season).length)issues.push('vhodné měsíce');
  if(r.pricePerServingCzk==null)issues.push('cena porce');
  const profile=rotationConfig(r);
  if(profile.active&&profile.editable&&!profile.interval)issues.push('oblíbenost');
  return issues;
 } function completionIssues(r){return rawCompletionIssues(r)}
 const needsCompletion=r=>completionIssues(r).length>0;
 function clean(r){
  if(!r||typeof r!=='object')throw Error('Neplatná norma.');
  if(r.rotationPolicyVersion!==112)r={...r,popularity:null,rotationIntervalDays:null,rotationDays:null};
  const id=text(r.id,150);if(!/^docx-[a-z0-9-]+$/.test(id))throw Error('Neplatné ID normy.');
  if(r.rotationIntervalDays!=null&&(!Number.isInteger(r.rotationIntervalDays)||r.rotationIntervalDays<0||r.rotationIntervalDays>3650))throw Error('Rotace musí být celé číslo od 0 do 3650 dní.');
  const name=text(r.name,250);if(!name.trim())throw Error('Norma nemá název.');
  if(!Number.isInteger(r.servings)||r.servings<1||r.servings>100000)throw Error('Neplatný počet porcí.');
  if(!Array.isArray(r.ingredients)||!r.ingredients.length||r.ingredients.length>500)throw Error('Chybějí suroviny.');
  const ingredients=r.ingredients.map(i=>{const unit=text(i.unit,10);if(!['kg','g','l','ml','ks'].includes(unit))throw Error('Neplatná jednotka.');return {name:text(i.name,250),amount:num(i.amount),unit,perServing:i.perServing==null?null:text(i.perServing,100),needsClarification:false}});
  const n={};for(const k of ['energyKj','energyKcalApprox','proteinG','fatG','carbohydratesG','fiberG','calciumMg','ironMg','vitaminAUg','vitaminB1Mg','vitaminB2Mg','vitaminCMg'])n[k]=num(r.nutritionPerServing?.[k]??null);
  const allergens=(r.allergens||[]).map(a=>{if(!Number.isInteger(a.number)||a.number<1||a.number>14)throw Error('Neplatné číslo alergenu.');return {number:a.number,name:text(a.name,250)}});
  const warnings=Array.isArray(r.importWarnings)?r.importWarnings.map(w=>text(w,1200)).slice(0,100):[],metadataIssues=rawCompletionIssues(r);
  return {id,name,servings:r.servings,ingredients,nutritionPerServing:n,rotationPolicyVersion:112,rotationIntervalDays:null,
   source:text(r.source||'DOCX',250),sourceFile:text(r.sourceFile||'',250),importedAt:text(r.importedAt||'',60),
   description:text(r.description||'Norma importovaná z DOCX.',1000),planningNote:text(r.planningNote||'',8000),
   importWarnings:warnings,pricePerServingCzk:num(r.pricePerServingCzk??null),
   nutritionReview:text(r.nutritionReview||'Přepis DOCX; správnost zdrojové výživy není nezávisle ověřena.',1500),
   mealTypes:(r.mealTypes||[]).filter(x=>['Snídaně','Oběd','Svačina','Večeře','Polévka','Salát','Příloha','Pečivo'].includes(x)),
   foodType:foodTypeOf(r),flavor:flavorOf(r),
   category:text(r.category||'',80),meatType:text(r.meatType||'',80),sideDish:text(r.sideDish||'',100),preparationType:text(r.preparationType||'',80),
   popularity:[1,2,3].includes(r.popularity)?r.popularity:null,
   season:normalizeSeason(r.season),
   history:(r.history||[]).filter(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)),lastServedAt:r.lastServedAt?text(r.lastServedAt,10):null,rotationDays:rotationConfig(r).interval||null,
   status:['active','paused','archived'].includes(r.status)?r.status:'active',metadataIssues,completionStatus:metadataIssues.length?'needs-completion':'complete',image:/^[a-zA-Z0-9._-]+$/.test(r.image||'')?r.image:null,allergens,allergensIncomplete:r.allergensIncomplete!==false,alternativeNames:(r.alternativeNames||[]).map(v=>text(v,250)),_imported:true};
 }
 function localList(){const raw=localStorage.getItem(KEY);if(!raw)return [];let data;try{data=JSON.parse(raw)}catch{throw Error('Uložený katalog importů je poškozený. Nic se nepřepsalo.');}if(data.version!==1||!Array.isArray(data.recipes))throw Error('Nepodporovaná verze katalogu.');return data.recipes.map(clean)}
 const identity=r=>norm(r.name);
 const signature=r=>JSON.stringify([r.servings,r.ingredients.map(i=>[norm(i.name),i.amount,i.unit]),r.nutritionPerServing]);
 function combine(base){const ids=new Set(base.map(r=>r.id));return [...base,...list().filter(r=>!ids.has(r.id))]}
 function save(records,builtins=[]){
  const old=list(),next=localList(),results=[];let added=0;
  for(const input of records){
   const r=clean(input),existing=[...old,...next].find(x=>identity(x)===identity(r)||x.id===r.id);
   if(existing){results.push({name:r.name,state:signature(existing)===signature(r)?'duplicate':'conflict',id:existing.id});continue;}
   if(builtins.some(x=>norm(x.name)===norm(r.name))){results.push({name:r.name,state:'conflict'});continue;}
   next.push(r);added++;results.push({name:r.name,state:'added',id:r.id,warnings:r.importWarnings});
  }
  if(added){try{localStorage.setItem(KEY,JSON.stringify({version:1,recipes:next}))}catch{throw Error('Normy nebyly uloženy: prohlížeč nemá dost místa nebo blokuje úložiště. Vytvořte zálohu; dosavadní katalog zůstává zachován.');}}
  return results;
 }
 async function lockedSave(records,builtins){await ready;const run=async()=>{const result=save(records,builtins);await persistDisk();return result};return navigator.locks?navigator.locks.request(KEY,run):run()}
 function display(value){if(typeof value==='string')return esc(value);if(Array.isArray(value))return value.map(display);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,display(v)]));return value}
 function imageHref(r){const entry=fileEntries.find(e=>e.id===r.id);return r.image&&entry?entry.file.slice(0,entry.file.lastIndexOf('/')+1)+r.image:null}
 function href(r){return r._imported?'recipe-detail.html?imported=1&id='+encodeURIComponent(r.id):'recipe-detail.html?folder='+encodeURIComponent(r._folder)+'&id='+encodeURIComponent(r.id)}
 function backup(){return JSON.stringify({format:'receptar-docx-backup',version:1,exportedAt:new Date().toISOString(),recipes:list()},null,2)}
 function restore(raw,builtins){const d=JSON.parse(raw);if(d.format!=='receptar-docx-backup'||d.version!==1||!Array.isArray(d.recipes)||d.recipes.length>2000)throw Error('Neplatná záloha importovaných norem.');return lockedSave(d.recipes.map(clean),builtins)}
 async function update(id,changes){await ready;const run=async()=>{const original=list().find(r=>r.id===id);if(!original)throw Error('Norma nenalezena.');const records=localList(),updated=clean({...original,...changes}),index=records.findIndex(r=>r.id===id);if(index<0)records.push(updated);else records[index]=updated;localStorage.setItem(KEY,JSON.stringify({version:1,recipes:records}));await persistDisk();return updated};return navigator.locks?navigator.locks.request(KEY,run):run()}

 let published=[],revision=null,diskAvailable=false,diskMessage='',fileEntries=[],sourceDocument=null;
 function catalog(data){if(data.version!==1||!Array.isArray(data.recipes)||data.recipes.length>2000)throw Error('Neplatný katalog na disku.');return data.recipes.map(clean)}
 function list(){const publishedById=new Map(published.map(r=>[r.id,r])),merged=new Map(publishedById);for(const r of localList()){const source=publishedById.get(r.id),fillImage=source&&!r.image&&source.image,fillMealTypes=source&&!r.mealTypes.length&&source.mealTypes.length,fillSeason=source&&!seasonMonths(r.season).length&&seasonMonths(source.season).length;merged.set(r.id,fillImage||fillMealTypes||fillSeason?clean({...r,...(fillImage?{image:source.image}:{}),...(fillMealTypes?{mealTypes:source.mealTypes}:{}),...(fillSeason?{season:source.season}:{})}):r)}return [...merged.values()]}
 async function refreshCatalog(){
  const response=await fetch('imported-index.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Nelze načíst rejstřík imported-index.json.');
  const index=await response.json();if(index.version!==1||!Array.isArray(index.recipes))throw Error('Neplatný rejstřík.');
  fileEntries=index.recipes;revision=index.revision;
  published=await Promise.all(fileEntries.map(async entry=>{if(!/^Recepty\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(entry.file))throw Error('Neplatná cesta normy.');const r=await fetch(entry.file,{cache:'no-cache'});if(!r.ok)throw Error('Nelze načíst '+entry.file);const recipe=clean(await r.json());if(recipe.id!==entry.id)throw Error('Nesouhlasí ID normy.');return recipe}));
 }
 const ready=(async()=>{
  await refreshCatalog();
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
 return {isActive,imageHref,ready,refreshCatalog,setSourceFile,syncDisk,diskStatus,exportCatalog,list,combine,save:lockedSave,backup,restore,update,esc,display,href,norm,clean,signature,identity,completionIssues,needsCompletion,foodTypeOf,flavorOf,rotationConfig,rotationState,rotationMonth,usageDates,todayString,seasonMonths,MONTH_LABELS,FOOD_TYPES,FLAVORS};
})();

