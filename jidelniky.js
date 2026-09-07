(()=>{
  'use strict';

  const $=id=>document.getElementById(id);
  const today=new Date().toISOString().slice(0,10);
  const mealOrder=['Snídaně','Přesnídávka','Oběd','Polévka','Svačina','Večeře','Příloha'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dateLabel=value=>new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00'));
  const shortDate=value=>new Intl.DateTimeFormat('cs-CZ').format(new Date(value+'T12:00:00'));
  const fullDate=value=>new Intl.DateTimeFormat('cs-CZ',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00'));
  const wholeNumber=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:0});
  const decimalNumber=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:1});
  const priceNumber=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',minimumFractionDigits:2,maximumFractionDigits:2});

  let imports=[];
  let selected='';
  let recipesById=new Map();
  const expandedDays=new Set();
  let replacements={revision:'',items:{}};
  let pickerTarget=null, chosenRecipe=null, saving=false, returnFocus=null;
  const targetKey=target=>JSON.stringify(['importId','sourceFile','date','meal','originalName','dietCode'].map(field=>target[field]||''));
  const localServer=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const replacementStorageKey='receptar:menu-replacements:v1';

  async function replacementRequest(options){
    if(!localServer){
      const current=JSON.parse(localStorage.getItem(replacementStorageKey)||'{"version":1,"revision":"","items":{}}');
      if(current.version!==1||!current.items||typeof current.items!=='object')throw Error('Uložené náhrady jídel nelze přečíst.');
      if(options?.method==='POST'){
        const body=JSON.parse(options.body);
        if(body.baseRevision!==current.revision)throw Error('Jídelníček změnilo jiné okno. Obnovte stránku.');
        const key=targetKey(body.target),previous=current.items[key],recipe=recipesById.get(body.recipeId);
        if(!recipe)throw Error('Recept není načtený.');
        const changes=previous?[...(previous.changes||[]),{recipeId:previous.recipeId,recipeName:previous.recipeName,changedAt:previous.changedAt}]:[];
        current.items[key]={target:body.target,recipeId:recipe.id,recipeName:recipe.name,changedAt:new Date().toISOString(),changes};
        current.revision=crypto.randomUUID();
        localStorage.setItem(replacementStorageKey,JSON.stringify(current));
      }
      return current;
    }
    const response=await fetch('__menu_replacements',{cache:'no-store',...options});
    const data=await response.json().catch(()=>({error:'Ukládání změn není dostupné. Zkontrolujte místní server.'}));
    if(!response.ok)throw Error(data.error||'Změny jídelníčku nelze načíst.');
    return data;
  }

  function period(item){
    if(item.from<=today&&item.to>=today)return'current';
    if(item.from>today)return'future';
    return'past';
  }

  function number(value){
    if(value===null||value===undefined||value==='')return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  }

  function isoDate(date){
    const year=date.getFullYear();
    const month=String(date.getMonth()+1).padStart(2,'0');
    const day=String(date.getDate()).padStart(2,'0');
    return`${year}-${month}-${day}`;
  }

  function shiftDate(value,days){
    const date=new Date(value+'T12:00:00');
    date.setDate(date.getDate()+days);
    return isoDate(date);
  }

  function weekStart(value){
    const date=new Date(value+'T12:00:00');
    const daysFromMonday=(date.getDay()+6)%7;
    date.setDate(date.getDate()-daysFromMonday);
    return isoDate(date);
  }

  function weekRangeLabel(start){
    return`${fullDate(start)} – ${fullDate(shiftDate(start,6))}`;
  }

  function dayCountLabel(count){
    if(count===1)return'1 den v jídelníčku';
    if(count>=2&&count<=4)return`${count} dny v jídelníčku`;
    return`${count} dní v jídelníčku`;
  }

  async function staticCatalog(){
    const builtins=await fetch('builtin-recipes.json',{cache:'no-cache'}).then(response=>response.json());
    const index=await fetch('imported-index.json',{cache:'no-cache'}).then(response=>response.json());
    const sources=[
      ...builtins.map(item=>({id:item.id,file:`Recepty/${item.id}/${item.id}.json`})),
      ...(index.recipes||[])
    ];
    return Promise.all(sources.map(async item=>{
      const response=await fetch(item.file,{cache:'no-cache'});
      if(!response.ok)return null;
      const recipe=await response.json();
      return{
        id:item.id,
        name:recipe.name,
        menuHistory:recipe.menuHistory||[],
        nutritionPerServing:recipe.nutritionPerServing||null,
        pricePerServingCzk:recipe.pricePerServingCzk
      };
    })).then(items=>items.filter(Boolean));
  }

  async function load(){
    let recipes=await staticCatalog();
    let registry=[];
    try{
      const response=await fetch('__menu_import',{cache:'no-store'});
      const type=response.headers.get('content-type')||'';
      if(!response.ok||!type.includes('application/json'))throw Error();
      const data=await response.json();
      const staticById=new Map(recipes.map(recipe=>[recipe.id,recipe]));
      recipes=(data.recipes||[]).map(recipe=>({...staticById.get(recipe.id),...recipe}));
      registry=data.imports||[];
    }catch{
      try{
        const stored=JSON.parse(localStorage.getItem('receptar:menu-history:v1')||'null');
        if(stored?.version===1){
          registry=stored.imports||[];
          for(const event of stored.events||[]){
            const recipe=recipes.find(item=>item.id===event.recipeId);
            if(recipe)(recipe.menuHistory||(recipe.menuHistory=[])).push(event);
          }
        }
      }catch{}
    }

    recipesById=new Map(recipes.map(recipe=>[recipe.id,recipe]));
    const groups=new Map();
    for(const recipe of recipes){
      for(const event of recipe.menuHistory||[]){
        const key=event.importId||event.sourceFile||'starší-import';
        if(!groups.has(key))groups.set(key,{id:key,sourceFile:event.sourceFile||'Starší import',events:[]});
        groups.get(key).events.push({...event,recipeId:recipe.id,recipeName:recipe.name,confirmed:true});
      }
    }
    for(const meta of registry){
      const group=groups.get(meta.id)||{id:meta.id,sourceFile:meta.sourceFile,events:[]};
      group.sourceFile=meta.sourceFile||group.sourceFile;
      groups.set(meta.id,group);
    }

    let draft;
    try{draft=JSON.parse(localStorage.getItem('receptar:menu-import-draft:v1')||'null')}catch{}
    if(draft?.version===1&&Array.isArray(draft.rows)){
      let group=draft.importId?groups.get(draft.importId):null;
      if(!group)group=[...groups.values()].find(item=>item.sourceFile===draft.fileName);
      if(!group){
        const id=draft.importId||`draft:${draft.fileName||'rozpracovany'}`;
        group={id,sourceFile:draft.fileName||'Rozpracovaný jídelníček',events:[]};
        groups.set(id,group);
      }
      const existing=new Set(group.events.map(event=>`${event.date}|${event.meal}|${String(event.originalName).toLocaleLowerCase('cs-CZ')}`));
      for(const row of draft.rows){
        const recipe=recipesById.get(row.recipeId);
        for(const event of row.occurrences||[]){
          const signature=`${event.date}|${event.meal}|${String(event.originalName).toLocaleLowerCase('cs-CZ')}`;
          if(existing.has(signature))continue;
          existing.add(signature);
          group.events.push({...event,recipeId:row.recipeId||'',recipeName:recipe?.name||'',confirmed:false});
        }
      }
    }

    replacements=await replacementRequest();
    for(const change of Object.values(replacements.items)){
      const target=change.target;
      let group=groups.get(target.importId);
      if(!group&&target.importId.startsWith('draft:')){
        group={id:target.importId,sourceFile:target.sourceFile,events:[]};
        groups.set(group.id,group);
      }
      if(!group)continue;
      let event=group.events.find(entry=>targetKey({...entry,importId:group.id,sourceFile:group.sourceFile})===targetKey(target));
      if(!event){event={...target};group.events.push(event)}
      event.recipeId=change.recipeId;
      event.recipeName=recipesById.get(change.recipeId)?.name||change.recipeName;
      event.replaced=true;
      event.confirmed=true;
    }
    for(const group of groups.values())group.events.forEach((event,index)=>{event.itemIndex=index});
    imports=[...groups.values()]
      .map(item=>{
        const dates=item.events.map(event=>event.date).filter(Boolean).sort();
        return{...item,from:dates[0]||'',to:dates.at(-1)||'',pending:item.events.filter(event=>!event.confirmed).length};
      })
      .filter(item=>item.events.length)
      .sort((a,b)=>b.from.localeCompare(a.from));
    selected=imports[0]?.id||'';
    renderFilters();
    render();
  }

  function renderFilters(){
    const filter=$('importFilter');
    const current=filter.value||selected;
    filter.innerHTML=imports.map(item=>`<option value="${esc(item.id)}">${esc(item.sourceFile)} · ${shortDate(item.from)}–${shortDate(item.to)}</option>`).join('');
    selected=imports.some(item=>item.id===current)?current:(imports[0]?.id||'');
    filter.value=selected;
  }

  function totalMetric(events,pick){
    let total=0;
    let known=0;
    let missing=0;
    for(const event of events){
      const recipe=recipesById.get(event.recipeId);
      const value=recipe?number(pick(recipe)):null;
      if(value===null)missing+=1;
      else{
        total+=value;
        known+=1;
      }
    }
    return{total,known,missing};
  }

  function energyValue(recipe,key){
    const nutrition=recipe.nutritionPerServing||{};
    const direct=number(nutrition[key]);
    if(direct!==null)return direct;
    if(key==='energyKj'){
      const kcal=number(nutrition.energyKcalApprox);
      return kcal===null?null:kcal*4.184;
    }
    const kj=number(nutrition.energyKj);
    return kj===null?null:kj/4.184;
  }

  function statHtml(label,metric,unit,formatter){
    const incomplete=metric.missing>0;
    const formatted=metric.known?formatter.format(metric.total):'—';
    const value=unit&&metric.known?`${formatted} ${unit}`:formatted;
    const title=incomplete?'Součet dostupných hodnot; některé položky tento údaj nemají.':'Součet jedné porce každé položky dne.';
    return`<div class="day-stat${incomplete?' incomplete':''}" title="${esc(title)}"><dt>${incomplete?label+' min.':label}</dt><dd>${value}</dd></div>`;
  }

  function daySummaryHtml(events){
    const price=totalMetric(events,recipe=>recipe.pricePerServingCzk);
    const energyKj=totalMetric(events,recipe=>energyValue(recipe,'energyKj'));
    const energyKcal=totalMetric(events,recipe=>energyValue(recipe,'energyKcalApprox'));
    const protein=totalMetric(events,recipe=>recipe.nutritionPerServing?.proteinG);
    const carbohydrates=totalMetric(events,recipe=>recipe.nutritionPerServing?.carbohydratesG);
    const fat=totalMetric(events,recipe=>recipe.nutritionPerServing?.fatG);
    const energyIncomplete=energyKj.missing>0||energyKcal.missing>0;
    const energyKnown=energyKj.known||energyKcal.known;
    const energyText=energyKnown?`${wholeNumber.format(energyKj.total)} kJ / ${wholeNumber.format(energyKcal.total)} kcal`:'—';
    const energyTitle=energyIncomplete?'Součet dostupných hodnot; některé položky energii nemají.':'Součet energie jedné porce každé položky dne.';
    return`<div class="day-summary"><span class="day-summary-caption">Součet na osobu</span><dl>${statHtml('Cena',price,'',priceNumber)}<div class="day-stat${energyIncomplete?' incomplete':''}" title="${esc(energyTitle)}"><dt>${energyIncomplete?'Energie min.':'Energie'}</dt><dd>${energyText}</dd></div>${statHtml('Bílkoviny',protein,'g',decimalNumber)}${statHtml('Sacharidy',carbohydrates,'g',decimalNumber)}${statHtml('Tuky',fat,'g',decimalNumber)}</dl></div>`;
  }

  function renderDay(date,events){
    const state=date===today?'today':date>today?'future':'past';
    const label=date===today?'Dnes':date>today?'Budoucí':'Minulé';
    const meals=new Map();
    for(const event of events){
      if(!meals.has(event.meal))meals.set(event.meal,[]);
      meals.get(event.meal).push(event);
    }
    const blocks=[...meals]
      .sort(([a],[b])=>mealOrder.indexOf(a)-mealOrder.indexOf(b))
      .map(([meal,items])=>`<section class="meal-block"><h4>${esc(meal)}</h4><ul>${items.map(event=>`<li class="${event.confirmed?'':'pending-menu-item'}"><button type="button" class="meal-replace" data-replace-index="${event.itemIndex}" aria-label="Nahradit: ${esc(event.replaced?event.recipeName:event.originalName||event.recipeName)}"><b>${esc(event.replaced?event.recipeName:event.originalName||event.recipeName)}</b><span>Nahradit ↗</span></button>${event.confirmed?'':'<span class="confirm-badge">Nepotvrzeno</span>'}${event.replaced?`<small>Původně: ${esc(event.originalName)}</small>`:event.recipeName&&event.recipeName!==event.originalName?`<small>Recept: ${esc(event.recipeName)}</small>`:''}${event.dietCode?`<small>Dieta: ${esc(event.dietCode)}</small>`:''}</li>`).join('')}</ul></section>`)
      .join('');
    const dayKey=`${selected}|${date}`;
    const collapsed=!expandedDays.has(dayKey);
    const mealsId=`day-meals-${date}`;
    return`<article class="menu-day ${state}${collapsed?' collapsed':''}" data-day="${esc(date)}"><div class="day-heading"><div class="day-heading-main"><h3><button type="button" class="day-toggle" data-day-key="${esc(dayKey)}" aria-expanded="${collapsed?'false':'true'}" aria-controls="${mealsId}" aria-label="${collapsed?'Rozbalit':'Sbalit'} ${esc(dateLabel(date))}"><span class="day-chevron" aria-hidden="true">⌄</span><span class="day-date">${esc(dateLabel(date))}</span><span class="day-toggle-label">${collapsed?'Rozbalit':'Sbalit'}</span></button></h3><span class="day-period">${label}</span></div>${daySummaryHtml(events)}</div><div class="day-meals" id="${mealsId}"${collapsed?' hidden':''}>${blocks}</div></article>`;
  }

  function render(){
    const wanted=$('periodFilter').value;
    const visible=imports.filter(item=>wanted==='all'||period(item)===wanted);
    $('menuCount').textContent=`${visible.length} jídelníčků`;
    $('menusOverview').innerHTML=visible.map(item=>`<button class="menu-import-card ${item.id===selected?'active':''}" data-menu-id="${esc(item.id)}"><b>${esc(item.sourceFile)}</b><small>${shortDate(item.from)} až ${shortDate(item.to)} · ${item.events.length} položek${item.pending?` · ${item.pending} nepotvrzených`:''}</small></button>`).join('');
    if(!visible.some(item=>item.id===selected))selected=visible[0]?.id||'';
    const item=imports.find(entry=>entry.id===selected);
    if(!item){
      $('menuDays').innerHTML='<div class="menus-empty"><b>Žádný jídelníček v tomto období</b><span>Změňte filtr nebo nejprve jídelníček naimportujte.</span></div>';
      return;
    }

    const days=new Map();
    for(const event of item.events){
      if(!days.has(event.date))days.set(event.date,[]);
      days.get(event.date).push(event);
    }
    const weeks=new Map();
    for(const [date,events] of [...days].sort(([a],[b])=>a.localeCompare(b))){
      const start=weekStart(date);
      if(!weeks.has(start))weeks.set(start,[]);
      weeks.get(start).push([date,events]);
    }
    $('menuDays').innerHTML=[...weeks].map(([start,weekDays])=>{
      const weekId=`week-${start}`;
      return`<section class="menu-week" aria-labelledby="${weekId}"><header class="week-heading"><div><span class="week-kicker">Pondělí–neděle</span><h2 id="${weekId}">${esc(weekRangeLabel(start))}</h2></div><span class="week-count">${dayCountLabel(weekDays.length)}</span></header><div class="week-days">${weekDays.map(([date,events])=>renderDay(date,events)).join('')}</div></section>`;
    }).join('');
    $('menusStatus').textContent=`Zobrazen kompletní jídelníček ${item.sourceFile}: ${shortDate(item.from)} až ${shortDate(item.to)}. ${item.pending?item.pending+' položek čeká na potvrzení.':'Všechny položky jsou potvrzené.'}`;
  }

  $('periodFilter').addEventListener('change',render);
  $('importFilter').addEventListener('change',event=>{
    selected=event.target.value;
    render();
  });
  $('menusOverview').addEventListener('click',event=>{
    const button=event.target.closest('[data-menu-id]');
    if(!button)return;
    selected=button.dataset.menuId;
    $('importFilter').value=selected;
    render();
  });
  $('menuDays').addEventListener('click',event=>{
    const replaceButton=event.target.closest('[data-replace-index]');
    if(replaceButton){openPicker(Number(replaceButton.dataset.replaceIndex),replaceButton);return}
    const button=event.target.closest('[data-day-key]');
    if(!button)return;
    const article=button.closest('.menu-day');
    const meals=article.querySelector('.day-meals');
    const collapse=!article.classList.contains('collapsed');
    article.classList.toggle('collapsed',collapse);
    meals.hidden=collapse;
    button.setAttribute('aria-expanded',String(!collapse));
    button.setAttribute('aria-label',`${collapse?'Rozbalit':'Sbalit'} ${article.querySelector('.day-date').textContent}`);
    button.querySelector('.day-toggle-label').textContent=collapse?'Rozbalit':'Sbalit';
    if(collapse)expandedDays.delete(button.dataset.dayKey);
    else expandedDays.add(button.dataset.dayKey);
  });

  function openPicker(index,button){
    const group=imports.find(item=>item.id===selected);
    const event=group?.events[index];
    if(!event)return;
    returnFocus=button;
    pickerTarget={group,event};
    chosenRecipe=null;
    $('pickerSave').disabled=true;
    $('pickerContext').textContent=`${dateLabel(event.date)} · ${event.meal} · ${event.replaced?event.recipeName:event.originalName||event.recipeName}`;
    $('pickerStatus').textContent=localServer?'Vyberte jídlo z databáze.':'Vyberte jídlo. Na webu se změna uloží pouze do tohoto prohlížeče.';
    if(!$('pickerFrame').getAttribute('src'))$('pickerFrame').src='databaze.html?pick=menu&v=90';
    $('recipePicker').showModal();
  }
  function closePicker(){if(!saving)$('recipePicker').close()}
  $('pickerClose').addEventListener('click',closePicker);
  $('recipePicker').addEventListener('cancel',event=>{if(saving)event.preventDefault()});
  $('recipePicker').addEventListener('close',()=>{pickerTarget=null;chosenRecipe=null;returnFocus?.focus()});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==$('pickerFrame').contentWindow||!$('recipePicker').open||saving)return;
    if(event.data?.type==='menu-picker-close'){closePicker();return}
    if(event.data?.type!=='menu-recipe-selected')return;
    chosenRecipe=recipesById.get(event.data.recipeId);
    if(!chosenRecipe){$('pickerStatus').textContent='Recept není načtený. Obnovte stránku.';return}
    const price=number(chosenRecipe.pricePerServingCzk);
    $('pickerStatus').textContent=`Vybráno: ${chosenRecipe.name} · ${price===null?'cena neuvedena':priceNumber.format(price)+' / porce'}`;
    $('pickerSave').disabled=false;
    $('pickerSave').focus();
  });
  $('pickerSave').addEventListener('click',async()=>{
    if(!pickerTarget||!chosenRecipe||saving)return;
    const {group,event}=pickerTarget;
    const target={importId:group.id,sourceFile:group.sourceFile,date:event.date,meal:event.meal,originalName:event.originalName||event.recipeName,dietCode:event.dietCode||''};
    const recipe=chosenRecipe;
    saving=true;$('pickerSave').disabled=true;$('pickerClose').disabled=true;
    $('pickerStatus').textContent='Ukládám náhradu…';
    try{
      replacements=await replacementRequest({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,recipeId:recipe.id,baseRevision:replacements.revision})});
      event.originalName=target.originalName;event.recipeId=recipe.id;event.recipeName=recipe.name;event.replaced=true;event.confirmed=true;
      group.pending=group.events.filter(entry=>!entry.confirmed).length;
      render();
      returnFocus=$('menuDays').querySelector(`[data-replace-index="${event.itemIndex}"]`);
      saving=false;$('recipePicker').close();
      $('menusStatus').textContent=`${localServer?'Uloženo na disk':'Uloženo v tomto prohlížeči'}: ${recipe.name} · ${shortDate(event.date)} · ${event.meal}. Denní souhrn je přepočítaný.`;
    }catch(error){$('pickerStatus').textContent='Neuloženo: '+error.message}
    finally{saving=false;$('pickerSave').disabled=false;$('pickerClose').disabled=false}
  });
  $('todayLabel').textContent=dateLabel(today);
  load().catch(error=>{
    $('menusStatus').textContent='Jídelníčky se nepodařilo načíst: '+error.message;
    $('menuDays').innerHTML='<div class="menus-empty"><b>Data nejsou dostupná</b><span>Zkontrolujte připojení nebo místní server.</span></div>';
  });
})();
