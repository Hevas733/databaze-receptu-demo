(()=>{
 'use strict';
 const $=id=>document.getElementById(id),MEALS=['Snídaně','Přesnídávka','Oběd','Svačina','Večeře'],DRAFT_KEY='receptar:menu-import-draft:v1',WEB_KEY='receptar:menu-history:v1';
 const rules=MenuImportRules;
 const state={catalog:[],aliases:{},imports:[],rows:[],fileName:'',year:null,importId:null,storage:'disk',repairs:{files:{}},ready:false,busy:false};
 const norm=value=>String(value||'').toLocaleLowerCase('cs-CZ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\bster\.?\b/g,'sterilovane').replace(/\bl00\b/g,'100').replace(/\bvelka porce\b|\bmala porce\b/g,' ').replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ks)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fullKey=rules.key,portions=rules.quantities,portionWarning=rules.portionWarning;
 function bestMatch(name){
  const match=rules.bestMatch(name,state.catalog,state.aliases);
  if(match.kind!=='strong')return match;
  const warning=certaintyWarning(name,match.recipe);
  return warning?{...match,kind:'possible',warning}:match;
 }
 function certaintyWarning(name,recipe){
  if(!recipe)return 'Norma není dostupná.';
  if(recipe.status&&recipe.status!=='active')return 'Norma je neaktivní nebo nepoužívaná. Použití potvrďte ručně.';
  const source=fullKey(name),ids=new Set(state.catalog.filter(item=>[item.name,...(item.alternativeNames||[])].some(label=>fullKey(label)===source)||item.id===state.aliases[source]).map(item=>item.id));
  return ids.size!==1||!ids.has(recipe.id)?'Název nebo jeho alternativní název patří více normám. Přiřazení potvrďte ručně.':'';
 }
 function certainRow(row){
  if(row.kind!=='strong'||!row.recipeId||row.manualRecipe||row.manualKind||row.reviewAssignment||row.reviewWarning||row.warning||row.occurrences.some(event=>event.needsReview))return false;
  const match=bestMatch(row.originalName);
  return match.kind==='strong'&&match.recipeId===row.recipeId&&!match.warning;
 }
 function splitItems(value){return rules.splitItems(value,state.catalog)}
 const eventKey=event=>JSON.stringify([event.date,event.meal,event.dietCode||'',fullKey(event.originalName)]);
 function sourceEvents(){return state.catalog.flatMap(recipe=>(recipe.menuHistory||[]).filter(event=>event.sourceFile===state.fileName&&(!state.importId||event.importId===state.importId)).map(event=>({...event,recipeId:recipe.id})))}
 function useExistingImport(){const matches=state.imports.filter(item=>item.sourceFile===state.fileName);if(matches.length===1)state.importId=matches[0].id}
 function beginSource(name){if(state.fileName!==name)state.importId=null;state.fileName=name;useExistingImport()}
 function syncControls(){
  for(const id of ['menuFile','menuText','analyzeMenuText'])$(id).disabled=state.busy||!state.ready;
  for(const id of ['clearMenuDraft','menuFilter'])$(id).disabled=state.busy;
  $('selectStrong').hidden=!state.rows.some(certainRow);$('selectStrong').disabled=state.busy;
  $('saveMenuImport').disabled=state.busy||!state.rows.some(row=>row.selected&&row.recipeId);
  for(const host of $('menuRows').querySelectorAll('[data-row]')){
   const row=state.rows[Number(host.dataset.row)];
   for(const input of host.querySelectorAll('input,select'))input.disabled=state.busy||(['selected','alias'].includes(input.dataset.action)&&!row?.recipeId);
  }
  for(const button of $('savedMenuImports').querySelectorAll('button'))button.disabled=state.busy;
 }
 function setBusy(value){state.busy=value;syncControls()}
 async function runImport(action){
  if(state.busy||!state.ready)return;
  setBusy(true);
  try{await action()}catch(error){$('menuImportStatus').textContent='Import nelze připravit: '+error.message}
  finally{setBusy(false)}
 }
 function dateFrom(value,year){const m=String(value||'').match(/(\d{1,2})\.\s*(\d{1,2})\.?/);if(!m)return null;const date=new Date(Date.UTC(year,Number(m[2])-1,Number(m[1])));if(date.getUTCFullYear()!==year||date.getUTCMonth()!==Number(m[2])-1||date.getUTCDate()!==Number(m[1]))return null;return`${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
 function textOf(el,W){return Array.from(el.getElementsByTagNameNS(W,'t')).map(x=>x.textContent).join('').trim()}
 async function parseDocx(file){
  if(!window.JSZip)throw Error('Chybí čtečka DOCX. Obnovte stránku.');
  const year=Number((file.name.match(/\b(20\d{2})\b/)||[])[1]);if(!year)throw Error('Rok musí být uveden v názvu souboru, například „Leden 2026.docx“.');state.year=year;
  const zip=await JSZip.loadAsync(await file.arrayBuffer()),entry=zip.file('word/document.xml');if(!entry)throw Error('DOCX neobsahuje čitelný dokument.');
  const xml=await entry.async('string');if(xml.length>12e6||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Dokument je příliš velký nebo obsahuje nepodporované XML.');
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',dom=new DOMParser().parseFromString(xml,'application/xml');if(dom.querySelector('parsererror'))throw Error('Poškozené XML dokumentu.');
  const rows=[];for(const table of dom.getElementsByTagNameNS(W,'tbl'))for(const tr of Array.from(table.children).filter(x=>x.namespaceURI===W&&x.localName==='tr'))rows.push(Array.from(tr.children).filter(x=>x.namespaceURI===W&&x.localName==='tc').map(x=>textOf(x,W)));
  let header=null;const records=[];
  for(const cells of rows){const normalized=cells.map(norm);if(normalized.includes('snidane')&&normalized.includes('obed')&&normalized.includes('vecere')){header={};for(const meal of MEALS){const index=normalized.indexOf(norm(meal));if(index>=0)header[meal]=index}continue}if(!header)continue;
   const date=dateFrom(cells[0],year);if(!date)continue;const dietCode=(cells[1]||'').trim();for(const meal of MEALS){const index=header[meal];if(index==null)continue;for(const originalName of splitItems(cells[index]))records.push({date,meal,dietCode,originalName,sourceCell:cells[index]})}
  }
  if(!records.length)throw Error('V dokumentu nebyl nalezen jídelníček CYGNUS s daty a chody.');return records;
 }
 function parseText(text,fileName){
  const year=Number((fileName.match(/\b(20\d{2})\b/)||[])[1])||new Date().getFullYear();state.year=year;const rows=[];
  for(const line of text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){const parts=line.split(/[;\t|]/).map(x=>x.trim());const date=dateFrom(parts[0],year)||(/^20\d{2}-\d{2}-\d{2}$/.test(parts[0])?parts[0]:null);if(!date)continue;const meal=MEALS.find(x=>norm(x)===norm(parts[1]))||'Oběd';for(const originalName of splitItems(parts.slice(2).join(',')))rows.push({date,meal,dietCode:'',originalName})}
  if(!rows.length)throw Error('Text musí obsahovat řádky ve tvaru datum; chod; název jídla.');return rows;
 }
 function classify(records){
  const saved=sourceEvents(),confirmed=new Set(saved.filter(event=>!event.needsReview).map(eventKey)),reviews=new Map(saved.filter(event=>event.needsReview).map(event=>[eventKey(event),event]));
  const groups=new Map();
  for(const parsed of rules.repairRecords(records,state.fileName,state.repairs)){
   const savedReview=reviews.get(eventKey(parsed)),record=savedReview?{...parsed,needsReview:true,reviewWarning:savedReview.reviewWarning}:parsed;
   if(confirmed.has(eventKey(record)))continue;
   const key=fullKey(record.originalName);if(!groups.has(key))groups.set(key,{originalName:record.originalName,occurrences:[]});groups.get(key).occurrences.push(record);
  }
  state.rows=[...groups.values()].map((row,id)=>{
   const match=bestMatch(row.originalName),review=row.occurrences.find(event=>event.needsReview);
   return{...row,id,...match,kind:review?(match.recipe?'possible':'unmatched'):match.kind,selected:!review&&match.kind==='strong',learnAlias:false,recipeId:match.recipe?.id||'',reviewWarning:review?.reviewWarning||'',reviewAssignment:!!review};
  });
 }
 function stats(){const strong=state.rows.filter(x=>x.kind==='strong').length,possible=state.rows.filter(x=>x.kind==='possible').length,unmatched=state.rows.filter(x=>x.kind==='unmatched').length;return{strong,possible,unmatched,total:state.rows.length,occurrences:state.rows.reduce((sum,row)=>sum+row.occurrences.length,0)}}
 function occurrenceLabel(row){const dates=[...new Set(row.occurrences.map(x=>x.date))].sort(),meals=[...new Set(row.occurrences.map(x=>x.meal))];const range=dates.length>1?`${dates[0]} až ${dates.at(-1)}`:dates[0];return`${row.occurrences.length}× · ${range} · ${meals.join(', ')}`}
 function inspectionLinks(row){
  const chosen=row.recipe||state.catalog.find(recipe=>recipe.id===row.inspectionRecipeId);
  const previous=row.reviewAssignment?sourceEvents().find(event=>event.needsReview&&fullKey(event.originalName)===fullKey(row.originalName)):null;
  const original=previous?state.catalog.find(recipe=>recipe.id===previous.recipeId):null;
  const links=chosen?[{recipe:chosen,label:'Otevřít normu'}]:original?[{recipe:original,label:`Otevřít původní normu: ${original.name}`}]:[];
  if(!links.length)for(const recipe of row.candidates||[])links.push({recipe,label:`Otevřít normu: ${recipe.name}`});
  return links.length?`<div class="menu-norm-links">${links.map(({recipe,label})=>`<button type="button" class="menu-open-norm" data-preview-recipe="${esc(recipe.id)}" aria-haspopup="dialog" aria-controls="normPreview" aria-label="${esc('Otevřít náhled normy '+recipe.name)}" title="${esc(recipe.name+' – suroviny, gramáže a výživové hodnoty')}">${esc(label)}</button>`).join('')}</div>`:'';
 }
 let previewReturnFocus=null,previewRequest=null,previewSerial=0,previewScrollY=0;
 const numberText=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('cs-CZ',{maximumFractionDigits:6}):'—';
 async function previewJson(url,signal){const response=await fetch(url,{cache:'no-cache',signal});if(!response.ok)throw Error('Normu nelze načíst ('+response.status+').');return response.json()}
 async function readPreviewRecipe(id,signal){
  if(!/^[a-z0-9-]+$/.test(id))throw Error('Neplatné ID normy.');
  const local=['localhost','127.0.0.1'].includes(location.hostname);let recipe;
  if(id.startsWith('docx-')){
   const index=await previewJson('imported-index.json',signal),entry=index.recipes?.find(item=>item.id===id);
   if(!entry||!/^Recepty\/[a-z0-9-]+\/[a-z0-9-]+\.json$/.test(entry.file))throw Error('Importovaná norma nebyla nalezena.');
   recipe=await previewJson(entry.file,signal);
   if(!local){try{const data=JSON.parse(localStorage.getItem('receptar:imported-norms:v1')||'null'),overlay=data?.recipes?.find(item=>item.id===id);if(overlay)recipe={...recipe,...overlay}}catch{}}
  }else if(local){const data=await previewJson('__builtin_recipe?id='+encodeURIComponent(id),signal);recipe=data.recipe}
  else{recipe=await previewJson(`Recepty/${id}/${id}.json`,signal);try{const overlay=JSON.parse(localStorage.getItem('receptar:'+id)||'null');if(overlay)recipe={...recipe,...overlay,season:{...recipe.season,...overlay.season}}}catch{}}
  if(!recipe||recipe.id!==id||!Array.isArray(recipe.ingredients))throw Error('Norma nemá platná data.');return recipe;
 }
 function renderPreviewRecipe(recipe){
  const servings=recipe.servings,warning=rules.consistencyWarning(recipe),nutrition=recipe.nutritionPerServing||{};
  const nutritionFields=[['energyKj','Energie','kJ'],['energyKcalApprox','Energie','kcal'],['proteinG','Bílkoviny','g'],['fatG','Tuky','g'],['carbohydratesG','Sacharidy','g'],['fiberG','Vláknina','g'],['calciumMg','Vápník','mg'],['ironMg','Železo','mg'],['vitaminAUg','Vitamin A','µg'],['vitaminB1Mg','Vitamin B1','mg'],['vitaminB2Mg','Vitamin B2','mg'],['vitaminCMg','Vitamin C','mg']];
  const perPortion=ingredient=>{if(!(servings>0)||typeof ingredient.amount!=='number'||!Number.isFinite(ingredient.amount))return '—';const unit=ingredient.unit,converted=unit==='kg'||unit==='l';return numberText(ingredient.amount*(converted?1000:1)/servings)+' '+(unit==='kg'?'g':unit==='l'?'ml':unit||'')};
  $('normPreviewTitle').textContent=recipe.name;
  $('normPreviewBody').innerHTML=`${warning?`<p class="norm-preview-warning" role="note">${esc(warning)}</p>`:''}<div class="norm-preview-facts"><span>Počet porcí: <b>${esc(numberText(servings))}</b></span><span>Cena za porci: <b>${esc(numberText(recipe.pricePerServingCzk))}${typeof recipe.pricePerServingCzk==='number'?' Kč':''}</b></span></div>${recipe.description&&!/^Norma importovaná z DOCX\.?$/i.test(recipe.description.trim())?`<p class="norm-preview-description">${esc(recipe.description)}</p>`:''}<section><h3>Suroviny a gramáže</h3><div class="norm-preview-table-wrap"><table class="norm-preview-table"><thead><tr><th scope="col">Surovina</th><th scope="col">Celá norma (${esc(numberText(servings))} porcí)</th><th scope="col">Na 1 porci</th></tr></thead><tbody>${recipe.ingredients.map(ingredient=>`<tr><th scope="row">${esc(ingredient.name)}${ingredient.needsClarification?' <small>Údaj vyžaduje ověření.</small>':''}</th><td>${esc(numberText(ingredient.amount))} ${esc(ingredient.unit||'')}</td><td>${esc(perPortion(ingredient))}</td></tr>`).join('')}</tbody></table></div><p class="norm-preview-note">Množství na porci je přepočtené z množství celé normy a uvedeného počtu porcí.</p></section><section><h3>Výživové hodnoty na porci</h3><dl class="norm-preview-nutrition">${nutritionFields.map(([key,label,unit])=>`<div><dt>${label}</dt><dd>${esc(numberText(nutrition[key]))}${typeof nutrition[key]==='number'?' '+unit:''}</dd></div>`).join('')}</dl><p class="norm-preview-note">${esc(recipe.nutritionReview||'Neuvedené hodnoty nejsou nuly.')}</p></section>${recipe.planningNote?`<section><h3>Pracovní poznámka</h3><p class="norm-preview-note-text">${esc(recipe.planningNote)}</p></section>`:''}${recipe.importWarnings?.length?`<section><h3>Upozornění normy</h3><ul>${recipe.importWarnings.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></section>`:''}<p class="norm-preview-source">Zdroj: ${esc(recipe.sourceFile||recipe.source||'neuvedený')}</p>`;
 }
 async function openNormPreview(id,button){
  const recipe=state.catalog.find(item=>item.id===id);if(!recipe)return;
  previewRequest?.abort();const serial=++previewSerial,controller=new AbortController();previewRequest=controller;
  $('normPreviewTitle').textContent=recipe.name;$('normPreviewBody').innerHTML='<p role="status">Načítám obsah normy…</p>';
  if(!$('normPreview').open){previewReturnFocus=button;previewScrollY=window.scrollY;$('normPreview').showModal();document.body.classList.add('norm-preview-open')}
  $('normPreviewBody').scrollTop=0;const timeout=setTimeout(()=>controller.abort(),15000);
  try{const full=await readPreviewRecipe(id,controller.signal);if(serial===previewSerial&&$('normPreview').open)renderPreviewRecipe(full)}
  catch(error){if(serial===previewSerial&&$('normPreview').open)$('normPreviewBody').innerHTML=`<p class="norm-preview-warning" role="alert">${esc(controller.signal.aborted?'Načítání trvalo příliš dlouho. Zkuste náhled otevřít znovu.':error.message)}</p>`}
  finally{clearTimeout(timeout);if(serial===previewSerial)previewRequest=null}
 }
 $('menuRows').addEventListener('click',event=>{const button=event.target.closest('[data-preview-recipe]');if(button)openNormPreview(button.dataset.previewRecipe,button)});
 for(const id of ['normPreviewClose','normPreviewDone'])$(id).addEventListener('click',()=>$('normPreview').close());
 $('normPreview').addEventListener('click',event=>{if(event.target!==$('normPreview'))return;const rect=$('normPreview').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('normPreview').close()});
 $('normPreview').addEventListener('close',()=>{++previewSerial;previewRequest?.abort();previewRequest=null;document.body.classList.remove('norm-preview-open');if(previewReturnFocus?.isConnected)previewReturnFocus.focus({preventScroll:true});window.scrollTo(0,previewScrollY)});
 function saveDraft(){
  if(!state.rows.length){localStorage.removeItem(DRAFT_KEY);return}
  const rows=state.rows.map(({originalName,occurrences,kind,score,selected,learnAlias,recipeId,inspectionRecipeId,manualKind,manualRecipe,warning,reviewWarning,reviewAssignment})=>({originalName,occurrences,kind,score,selected,learnAlias,recipeId,inspectionRecipeId,manualKind,manualRecipe,warning,reviewWarning,reviewAssignment}));
  localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,matcherVersion:rules.VERSION,parserVersion:rules.VERSION,fileName:state.fileName,year:state.year,importId:state.importId,savedAt:new Date().toISOString(),rows}));
 }
 async function restoreDraft(){
  let draft;try{draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null')}catch{}
  const valid=draft?.version===1&&Array.isArray(draft.rows)&&draft.rows.length;
  const reviewFile=state.catalog.flatMap(recipe=>recipe.menuHistory||[]).find(event=>event.needsReview)?.sourceFile||state.imports.find(item=>state.repairs.sources?.[item.sourceFile])?.sourceFile;
  if(!valid&&!reviewFile)return;
  state.fileName=valid?(draft.fileName||'rozpracovaný import'):reviewFile;
  state.year=valid?(draft.year||null):null;state.importId=valid?(draft.importId||null):null;
  if(!state.importId)useExistingImport();
  const previous=valid?draft.rows:[],reviews=sourceEvents().filter(event=>event.needsReview);
  const authoritative=(!valid||draft.parserVersion!==rules.VERSION)?rules.sourceRecords(state.fileName,state.repairs,state.catalog):[];
  classify([...(authoritative.length?authoritative:previous.filter(row=>Array.isArray(row.occurrences)).flatMap(row=>row.occurrences)),...reviews]);
  for(const row of state.rows){
   const prior=previous.find(item=>fullKey(item.originalName)===fullKey(row.originalName));
   if(!prior||row.occurrences.some(event=>event.sourceRepaired))continue;
   if(prior.manualRecipe){
    row.inspectionRecipeId=state.catalog.some(recipe=>recipe.id===prior.inspectionRecipeId)?prior.inspectionRecipeId:'';
    const recipe=state.catalog.find(item=>item.id===prior.recipeId);
    if(recipe&&!rules.blockingWarning(row.originalName,recipe)){row.recipe=recipe;row.recipeId=recipe.id;row.manualRecipe=true;row.warning=rules.assignmentWarning(row.originalName,recipe);row.kind='possible'}
    const inspection=state.catalog.find(item=>item.id===row.inspectionRecipeId),block=inspection?rules.blockingWarning(row.originalName,inspection):'';
    if(block){row.recipe=null;row.recipeId='';row.manualRecipe=true;row.warning=block;row.kind='unmatched'}
   }
   if(prior.manualKind&&draft.matcherVersion===rules.VERSION&&row.recipeId){row.kind=prior.manualKind;row.manualKind=prior.manualKind}
   row.selected=!!prior.selected&&row.recipeId===prior.recipeId&&draft.matcherVersion===rules.VERSION&&!rules.blockingWarning(row.originalName,row.recipe||{});
   row.learnAlias=row.selected&&!!prior.learnAlias;
  }
  saveDraft();if(!state.rows.length)return;render();
  await autoSaveStrong(`Obnoven a ověřen rozpracovaný import ${state.fileName}`);
 }
 function renderImports(){const host=$('savedMenuImports');if(!state.imports.length){host.innerHTML='<p class="empty-imports">Zatím není uložený žádný jídelní lístek.</p>';return}host.innerHTML=state.imports.slice().reverse().map(item=>`<article class="saved-menu-import"><div><b>${esc(item.sourceFile)}</b><small>${esc(item.from||'bez data')}${item.to&&item.to!==item.from?' až '+esc(item.to):''} · ${Number(item.saved)||0} záznamů${state.catalog.flatMap(recipe=>recipe.menuHistory||[]).filter(event=>event.importId===item.id&&event.needsReview).length?' · '+state.catalog.flatMap(recipe=>recipe.menuHistory||[]).filter(event=>event.importId===item.id&&event.needsReview).length+' k ověření':''}</small></div><button type="button" class="secondary-button danger" data-delete-import="${esc(item.id)}">Odstranit</button></article>`).join('')}
 function render(){
  const s=stats();$('menuSummary').innerHTML=`<b>${s.total} různých položek · ${s.occurrences} výskytů</b><span class="match-badge strong">${s.strong} jistých</span><span class="match-badge possible">${s.possible} ke kontrole</span><span class="match-badge unmatched">${s.unmatched} nenalezených</span>`;
  const options=state.catalog.slice().sort((a,b)=>a.name.localeCompare(b.name,'cs')).map(r=>`<option value="${esc(r.name)}"></option>`).join('');
  $('menuRows').innerHTML=`<datalist id="menuRecipeOptions">${options}</datalist>`+state.rows.map(row=>`<article class="menu-match ${row.kind}" data-row="${row.id}"><label class="menu-select"><input type="checkbox" data-action="selected" ${row.selected&&row.recipeId?'checked':''} ${row.recipeId?'':'disabled'}><span>${row.kind==='strong'?'✓':row.kind==='possible'?'?':'!'}</span></label><div class="menu-source"><b>${esc(row.originalName)}</b><small>${esc(occurrenceLabel(row))}</small></div><div class="menu-target"><input type="search" list="menuRecipeOptions" data-action="recipe" autocomplete="off" placeholder="Pište název receptu…" value="${esc(row.recipe?.name||state.catalog.find(recipe=>recipe.id===row.inspectionRecipeId)?.name||'')}">${inspectionLinks(row)}<small>${row.kind==='strong'?'Jistá shoda':row.kind==='possible'?'Zkontrolujte navrženou shodu':'Vyhledejte a vyberte recept ručně'}</small>${row.reviewWarning?`<small class="portion-warning">Uložené přiřazení k ověření: ${esc(row.reviewWarning)}</small>`:''}${row.warning?`<small class="portion-warning">${esc(row.warning)}</small>`:''}<label class="menu-group">Skupina <select data-action="kind" aria-label="Skupina: ${esc(row.originalName)}"><option value="strong" ${row.kind==='strong'?'selected':''} ${row.recipeId?'':'disabled'}>Jistá shoda</option><option value="possible" ${row.kind==='possible'?'selected':''}>Ke kontrole</option><option value="unmatched" ${row.kind==='unmatched'?'selected':''}>Nenalezené</option></select></label></div><label class="learn-alias"><input type="checkbox" data-action="alias" ${row.learnAlias?'checked':''} ${row.recipeId?'':'disabled'}> Zapamatovat název</label></article>`).join('');
  $('menuResults').hidden=!state.rows.length;applyFilter();syncControls();
 }
 function applyFilter(){const value=$('menuFilter').value;for(const card of $('menuRows').querySelectorAll('.menu-match'))card.hidden=!!value&&!card.classList.contains(value)}
 function updateRow(host,changed){
  if(state.busy)return;
  const row=state.rows[Number(host.dataset.row)];
  if(changed?.dataset.action==='recipe'){
   const matches=state.catalog.filter(recipe=>fullKey(recipe.name)===fullKey(changed.value)),match=matches.length===1?matches[0]:null;
   const block=match?rules.blockingWarning(row.originalName,match):'';
   row.recipe=block?null:match;row.recipeId=row.recipe?.id||'';row.inspectionRecipeId=match?.id||'';row.manualRecipe=true;
   row.warning=block||(match?rules.assignmentWarning(row.originalName,match):matches.length>1?'Stejný název má více norem. Vyberte jednoznačnou normu.':'');
   row.kind=row.recipeId?'possible':'unmatched';row.selected=false;row.learnAlias=false;
  }else if(changed?.dataset.action==='kind'){
   row.kind=changed.value;row.manualKind=row.kind;row.selected=row.kind==='strong'&&!!row.recipeId;if(row.kind!=='strong')row.learnAlias=false;
  }else if(changed?.dataset.action==='selected'){row.selected=changed.checked&&!!row.recipeId}
  else if(changed?.dataset.action==='alias'){row.learnAlias=changed.checked&&!!row.recipeId}
  saveDraft();render();
 }
 function webData(){try{const data=JSON.parse(localStorage.getItem(WEB_KEY)||'null');if(data?.version===1)return data}catch{}return{version:1,imports:[],events:[],aliases:{}}}
 function saveWebData(data){localStorage.setItem(WEB_KEY,JSON.stringify(data))}
 async function staticCatalog(){const builtins=await fetch('builtin-recipes.json',{cache:'no-cache'}).then(r=>r.json()),index=await fetch('imported-index.json',{cache:'no-cache'}).then(r=>r.json()),sources=[...builtins.map(x=>({id:x.id,file:`Recepty/${x.id}/${x.id}.json`})),...(index.recipes||[])];return Promise.all(sources.map(async x=>{const response=await fetch(x.file,{cache:'no-cache'});if(!response.ok)return null;const recipe=await response.json();return{id:x.id,name:recipe.name,status:recipe.status,alternativeNames:recipe.alternativeNames||[],ingredients:recipe.ingredients,servings:recipe.servings,menuHistory:recipe.menuHistory||[]}})).then(x=>x.filter(Boolean))}
 async function loadCatalog(){
  state.repairs=await fetch('menu-source-repairs.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('Nelze načíst pravidla opravy zdroje.');return response.json()});
  try{
   if(!MenuWebStorage.local)throw Error('Webový režim');
   const response=await fetch('__menu_import',{cache:'no-store'}),type=response.headers.get('content-type')||'';
   if(!response.ok||!type.includes('application/json'))throw Error('Katalog není dostupný.');
   const data=await response.json();state.storage='disk';state.catalog=data.recipes;state.aliases=data.aliases||{};state.imports=data.imports||[];
   $('menuStorageStatus').textContent=`Připraveno: ${state.catalog.length} receptů. Jisté shody se automaticky uloží na disk se zálohou.`;
  }catch(error){
   // A local-server failure must not silently redirect disk imports into browser storage.
   if(['127.0.0.1','localhost','::1','[::1]'].includes(location.hostname))throw Error('Místní server není dostupný. Automatické ukládání na disk není možné; obnovte stránku po jeho spuštění.');
   state.storage='browser';state.catalog=MenuWebStorage.overlayCatalog(await staticCatalog());
   const data=await MenuWebStorage.read(state.catalog);state.aliases=data.aliases||{};state.imports=data.imports||[];
   for(const recipe of state.catalog)recipe.menuHistory=[];
   for(const event of data.events||[]){const recipe=state.catalog.find(item=>item.id===event.recipeId);if(recipe)recipe.menuHistory.push({...event})}
   $('menuStorageStatus').textContent=`Webová verze: ${state.catalog.length} receptů. Jisté shody se automaticky uloží pouze v tomto prohlížeči.`;
  }
  renderImports();syncControls();
 }
 function saveBrowserEvents(events){const data=webData(),importId=state.importId||`web-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,known=new Set(data.events.map(x=>JSON.stringify([x.importId,x.recipeId,eventKey(x)])));let saved=0,duplicates=0,reviewed=0;for(const event of events){const key=JSON.stringify([importId,event.recipeId,eventKey(event)]);if(event.review){const prior=data.events.find(item=>item.importId===importId&&eventKey(item)===eventKey(event)&&item.needsReview);if(!prior)throw Error('Přiřazení k ověření už neexistuje. Obnovte stránku.');prior.recipeId=event.recipeId;delete prior.needsReview;delete prior.reviewWarning;reviewed++;continue}if(known.has(key)){duplicates++;continue}known.add(key);data.events.push({...event,importId,sourceFile:state.fileName});saved++;if(event.learnAlias)data.aliases[fullKey(event.originalName)]=event.recipeId}let meta=data.imports.find(x=>x.id===importId);if(!meta){meta={id:importId,sourceFile:state.fileName,from:'',to:'',saved:0};data.imports.push(meta)}const related=data.events.filter(x=>x.importId===importId),dates=related.map(x=>x.date).sort();meta.from=dates[0]||'';meta.to=dates.at(-1)||'';meta.saved=related.length;saveWebData(data);return{importId,saved,duplicates,reviewed,recipes:new Set(events.map(x=>x.recipeId)).size}}
 function deleteBrowserImport(importId){const data=webData(),before=data.events.length;data.events=data.events.filter(x=>x.importId!==importId);data.imports=data.imports.filter(x=>x.id!==importId);saveWebData(data);return{removed:before-data.events.length}}
 async function saveRows(rows,automatic=false){
  const events=rows.flatMap(row=>row.occurrences.map(x=>({recipeId:row.recipeId,date:x.date,meal:x.meal,originalName:x.originalName,dietCode:x.dietCode,learnAlias:automatic?false:row.learnAlias,review:!!x.needsReview,automatic})));
  if(!events.length)return null;
  // Persist the batch ID before sending: a lost response can be retried without creating another import.
  if(!state.importId)state.importId=state.storage==='disk'?crypto.randomUUID():`web-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  saveDraft();$('menuImportStatus').textContent=automatic?'Automaticky ukládám jisté shody…':'Ukládám ručně potvrzenou historii…';
  let data;
  try{
   if(state.storage==='browser')data=saveBrowserEvents(events);
   else{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try{
     const response=await fetch('__menu_import',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({version:1,sourceFile:state.fileName,importId:state.importId,events})});
     data=await response.json();if(!response.ok)throw Error(data.error||'Uložení selhalo.');
    }finally{clearTimeout(timeout)}
   }
  }catch(error){
   $('menuImportStatus').textContent=`${automatic?'Automatické uložení jistých shod':'Uložení'} se nepodařilo potvrdit: ${error.name==='AbortError'?'Server neodpověděl do 30 sekund.':error.message} Rozpracované položky zůstaly zachované; zkuste uložení znovu.`;
   return null;
  }
  state.importId=data.importId;
  const savedRows=new Set(rows);state.rows=state.rows.filter(row=>!savedRows.has(row)).map((row,id)=>({...row,id}));
  let notice='';try{saveDraft()}catch{notice=' Rozpracovaný stav se nepodařilo uložit v prohlížeči.'}
  render();
  try{await loadCatalog()}catch(error){notice+=' Uložení proběhlo, ale katalog se nepodařilo obnovit: '+error.message}
  return {...data,notice};
 }
 async function autoSaveStrong(context){
  if(!state.importId&&state.imports.filter(item=>item.sourceFile===state.fileName).length>1){$('menuImportStatus').textContent=`${context}. Pod tímto názvem existuje více importů. Automatické ukládání je pozastavené, aby nevznikla další duplicitní dávka; nejprve ověřte uložené importy.`;return}
  const rows=state.rows.filter(certainRow);
  if(!rows.length){$('menuImportStatus').textContent=`${context}. ${state.rows.length?'Zbývající nejasné položky potvrďte ručně.':'Všechny položky už jsou uložené.'}`;return}
  const data=await saveRows(rows,true);
  if(data)$('menuImportStatus').textContent=`${context}. Automaticky uloženo ${data.saved} použití jistých shod; duplicit přeskočeno: ${data.duplicates}. ${state.rows.length?`Zbývá ${state.rows.length} různých položek k ruční kontrole.`:'Všechny položky jsou uložené.'}${data.notice}`;
 }
 async function analyzeFile(file){
  $('menuImportStatus').textContent='Čtu a porovnávám jídelníček…';
  const year=state.year;let records;
  try{records=/\.docx$/i.test(file.name)?await parseDocx(file):parseText(await file.text(),file.name)}catch(error){state.year=year;throw error}
  beginSource(file.name);classify(records);saveDraft();render();await autoSaveStrong(`Načten zdroj ${file.name}`);
 }
 $('menuFile').addEventListener('change',event=>{const file=event.target.files[0];if(file)runImport(()=>analyzeFile(file))});
 $('analyzeMenuText').addEventListener('click',()=>runImport(async()=>{const records=parseText($('menuText').value,'vložený-text.txt');beginSource('vložený-text.txt');classify(records);saveDraft();render();await autoSaveStrong('Text analyzován')}));
 $('menuRows').addEventListener('change',event=>{const host=event.target.closest('[data-row]');if(host)updateRow(host,event.target)});
 $('menuFilter').addEventListener('change',applyFilter);
 $('selectStrong').addEventListener('click',()=>runImport(()=>autoSaveStrong(`Import ${state.fileName}`)));
 $('clearMenuDraft').addEventListener('click',()=>{if(state.busy)return;state.rows=[];state.importId=null;localStorage.removeItem(DRAFT_KEY);render();$('menuImportStatus').textContent='Rozpracovaný import byl z tohoto prohlížeče odstraněn. Již uložené jisté shody zůstávají v databázi.'});
 $('savedMenuImports').addEventListener('click',event=>{
  const button=event.target.closest('[data-delete-import]');if(!button||state.busy)return;
  const item=state.imports.find(x=>x.id===button.dataset.deleteImport),hasDraft=state.importId===button.dataset.deleteImport||(!state.importId&&state.fileName===item?.sourceFile);
  if(!item||!confirm(`Odstranit celý import „${item.sourceFile}“${hasDraft?' včetně zbývajících rozpracovaných položek':''} a jeho historii z receptů?`))return;
  runImport(async()=>{
   $('savedMenuImportsStatus').textContent='Odstraňuji import…';
   try{
    let data;if(state.storage==='browser')data=deleteBrowserImport(item.id);
    else{const response=await fetch('__menu_import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',importId:item.id})});data=await response.json();if(!response.ok)throw Error(data.error||'Odstranění selhalo.')}
    if(hasDraft){state.rows=[];state.importId=null;localStorage.removeItem(DRAFT_KEY);render();$('menuImportStatus').textContent='Rozpracované položky tohoto jídelníčku byly odstraněny.'}
    await loadCatalog();$('savedMenuImportsStatus').textContent=`Import odstraněn. Smazáno ${data.removed} uložených záznamů${hasDraft?' i jeho rozpracované položky':''}; jídelníček můžete nyní nahrát znovu.`;
   }catch(error){$('savedMenuImportsStatus').textContent='Odstranění importu se nepodařilo potvrdit: '+error.message}
  });
 });
 $('saveMenuImport').addEventListener('click',()=>runImport(async()=>{
  const data=await saveRows(state.rows.filter(row=>row.selected&&row.recipeId));
  if(data)$('menuImportStatus').textContent=`Uloženo ${data.saved} nových použití${data.reviewed?' · ověřeno '+data.reviewed+' přiřazení':''} do ${data.recipes} receptů. Duplicit přeskočeno: ${data.duplicates}. Potvrzené položky byly ze seznamu odstraněny.${data.notice}`;
 }));
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
 setBusy(true);
 loadCatalog().then(async()=>{state.ready=true;await restoreDraft()}).catch(error=>{$('menuStorageStatus').textContent='Importer není připraven: '+error.message}).finally(()=>setBusy(false));
})();
