(()=>{
  'use strict';

  const $=id=>document.getElementById(id),rules=MenuImportRules;
  let sourceRepairs={files:{}};
  const today=new Date().toISOString().slice(0,10);
  const mealOrder=['Snídaně','Přesnídávka','Oběd','Polévka','Svačina','Večeře','Příloha'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dateLabel=value=>new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00'));
  const shortDate=value=>new Intl.DateTimeFormat('cs-CZ').format(new Date(value+'T12:00:00'));
  const fullDate=value=>new Intl.DateTimeFormat('cs-CZ',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00'));
  const wholeNumber=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:0});
  const decimalNumber=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:1});
  const priceNumber=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',minimumFractionDigits:2,maximumFractionDigits:2});

  // Agreed reference values per person for a whole day, not individual clinical limits.
  const dailyNorms=Object.freeze({price:130,energyKj:9122,proteinG:86.9,carbohydratesG:295.1,fatG:69.2});
  const decimalPriceNumber=new Intl.NumberFormat('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2});
  const itemNumber=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:2});

  let imports=[];
  let selected='';
  let recipesById=new Map();
  const expandedDays=new Set();
  let replacements={revision:'',items:{}};
  let pickerTarget=null, chosenRecipe=null, saving=false, returnFocus=null;
  const targetKey=target=>JSON.stringify(['importId','sourceFile','date','meal','originalName','dietCode'].map(field=>target[field]||''));

  async function replacementRequest(options){
    if(!MenuWebStorage.local){
      const key='receptar:menu-replacements:v1';
      const current=JSON.parse(localStorage.getItem(key)||'{"version":1,"revision":"","items":{}}');
      if(current.version!==1||!current.items||typeof current.items!=='object')throw Error('Uložené náhrady jídel nelze přečíst.');
      if(options?.method==='POST'){
        const body=JSON.parse(options.body);
        if(body.baseRevision!==current.revision)throw Error('Jídelníček změnilo jiné okno. Obnovte stránku.');
        const recipe=recipesById.get(body.recipeId),id=targetKey(body.target),previous=current.items[id];
        if(!recipe)throw Error('Recept není načtený.');
        const changes=previous?[...(previous.changes||[]),{recipeId:previous.recipeId,recipeName:previous.recipeName,changedAt:previous.changedAt}]:[];
        current.items[id]={target:body.target,recipeId:recipe.id,recipeName:recipe.name,changedAt:new Date().toISOString(),changes};
        current.revision=crypto.randomUUID();
        localStorage.setItem(key,JSON.stringify(current));
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
      ...builtins.map(item=>({id:item.id,file:`Recepty/${item.id}/${item.id}.json`,detailHref:`recipe-detail.html?folder=${encodeURIComponent(item.id)}&id=${encodeURIComponent(item.id)}`})),
      ...(index.recipes||[]).map(item=>({...item,detailHref:'recipe-detail.html?imported=1&id='+encodeURIComponent(item.id)}))
    ];
    return Promise.all(sources.map(async item=>{
      const response=await fetch(item.file,{cache:'no-cache'});
      if(!response.ok)return null;
      const recipe=await response.json();
      return{
        id:item.id,_detailHref:item.detailHref,
        name:recipe.name,
        ingredients:recipe.ingredients,servings:recipe.servings,alternativeNames:recipe.alternativeNames||[],
        menuHistory:recipe.menuHistory||[],
        nutritionPerServing:recipe.nutritionPerServing||null,
        pricePerServingCzk:recipe.pricePerServingCzk
      };
    })).then(items=>items.filter(Boolean));
  }

  async function load(){
    sourceRepairs=await fetch('menu-source-repairs.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('Nelze načíst ověřený zdroj jídelníčku.');return response.json()});
    let recipes=MenuWebStorage.overlayCatalog(await staticCatalog());
    let registry=[];
    try{
      if(!MenuWebStorage.local)throw Error('Webový režim');
      const response=await fetch('__menu_import',{cache:'no-store'});
      const type=response.headers.get('content-type')||'';
      if(!response.ok||!type.includes('application/json'))throw Error();
      const data=await response.json();
      const staticById=new Map(recipes.map(recipe=>[recipe.id,recipe]));
      recipes=(data.recipes||[]).map(recipe=>({...staticById.get(recipe.id),...recipe}));
      registry=data.imports||[];
    }catch{
      {
        const stored=MenuWebStorage.local?JSON.parse(localStorage.getItem('receptar:menu-history:v1')||'null'):await MenuWebStorage.read(recipes);
        if(stored?.version===1){
          registry=stored.imports||[];
          if(!MenuWebStorage.local)for(const recipe of recipes)recipe.menuHistory=[];
          for(const event of stored.events||[]){
            const recipe=recipes.find(item=>item.id===event.recipeId);
            if(recipe)(recipe.menuHistory||(recipe.menuHistory=[])).push(event);
          }
        }
      }
    }

    recipesById=new Map(recipes.map(recipe=>[recipe.id,recipe]));
    const groups=new Map();
    for(const recipe of recipes){
      for(const event of recipe.menuHistory||[]){
        const key=event.importId||event.sourceFile||'starší-import';
        if(!groups.has(key))groups.set(key,{id:key,sourceFile:event.sourceFile||'Starší import',events:[]});
        groups.get(key).events.push({...event,recipeId:recipe.id,recipeName:recipe.name,confirmed:!event.needsReview});
      }
    }
    for(const meta of registry){
      const group=groups.get(meta.id)||{id:meta.id,sourceFile:meta.sourceFile,events:[]};
      group.sourceFile=meta.sourceFile||group.sourceFile;
      groups.set(meta.id,group);
    }

    let draft;
    try{draft=JSON.parse(localStorage.getItem('receptar:menu-import-draft:v1')||'null')}catch{}
    const drafts=draft?.version===1&&Array.isArray(draft.rows)?[draft]:[];
    for(const meta of registry){
      if(!drafts.some(item=>item.fileName===meta.sourceFile)&&sourceRepairs.sources?.[meta.sourceFile])drafts.push({fileName:meta.sourceFile,importId:meta.id,rows:[]});
    }
    for(const current of drafts){
      let group=current.importId?groups.get(current.importId):null;
      if(!group)group=[...groups.values()].find(item=>item.sourceFile===current.fileName);
      if(!group){const id=current.importId||`draft:${current.fileName||'rozpracovany'}`;group={id,sourceFile:current.fileName||'Rozpracovaný jídelníček',events:[]};groups.set(id,group)}
      const existing=new Set(group.events.map(event=>JSON.stringify([event.date,event.meal,event.dietCode||'',rules.key(event.originalName)])));
      const authoritative=current.parserVersion!==rules.VERSION?rules.sourceRecords(current.fileName,sourceRepairs,recipes):[];
      const raw=authoritative.length?authoritative:current.rows.flatMap(row=>row.occurrences||[]);
      for(const event of rules.repairRecords(raw,current.fileName,sourceRepairs)){
        const signature=JSON.stringify([event.date,event.meal,event.dietCode||'',rules.key(event.originalName)]);
        if(existing.has(signature))continue;existing.add(signature);
        const prior=current.rows.find(row=>rules.key(row.originalName)===rules.key(event.originalName));
        let match=rules.bestMatch(event.originalName,recipes);
        const manual=prior?.manualRecipe?recipesById.get(prior.recipeId):null;
        if(manual&&!event.sourceRepaired&&!rules.blockingWarning(event.originalName,manual))match={recipe:manual};
        group.events.push({...event,recipeId:match.recipe?.id||'',recipeName:match.recipe?.name||'',confirmed:false});
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
      delete event.needsReview;delete event.reviewWarning;
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
      if(!event.confirmed){missing+=1;continue}
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


  function energyConflict(recipe){
    const nutrition=recipe?.nutritionPerServing||{};
    const kj=number(nutrition.energyKj),kcal=number(nutrition.energyKcalApprox);
    // Tolerate ordinary rounding; do not infer which stored value is correct.
    return kj!==null&&kcal!==null&&Math.abs(kj/4.184-kcal)>Math.max(2,Math.abs(kj/4.184)*.03);
  }

  // Use the same source values and energy conversion as the day total.
  function itemInformation(event){
    const messages=[];
    if(!event.confirmed)messages.push(event.needsReview?'Přiřazení normy čeká na ověření; položka se nezapočítává do součtu.':'Položka není potvrzená a nezapočítává se do součtu.');
    const recipe=recipesById.get(event.recipeId);
    if(!recipe){messages.push('Není dostupná přiřazená norma; cenu a výživové hodnoty nelze zjistit.');return messages}
    const missing=[
      ['cena',number(recipe.pricePerServingCzk)],
      ['energie',energyValue(recipe,'energyKj')],
      ['bílkoviny',number(recipe.nutritionPerServing?.proteinG)],
      ['sacharidy',number(recipe.nutritionPerServing?.carbohydratesG)],
      ['tuky',number(recipe.nutritionPerServing?.fatG)]
    ].filter(([,value])=>value===null).map(([label])=>label);
    if(missing.length)messages.push('Chybí: '+missing.join(', ')+'.');
    if(energyConflict(recipe))messages.push(`Rozpor energie: ${itemNumber.format(number(recipe.nutritionPerServing.energyKj))} kJ odpovídá přibližně ${itemNumber.format(number(recipe.nutritionPerServing.energyKj)/4.184)} kcal, ale norma uvádí ${itemNumber.format(number(recipe.nutritionPerServing.energyKcalApprox))} kcal. Ověřte původní podklad.`);
    return messages;
  }

  function itemValuesHtml(event){
    const recipe=recipesById.get(event.recipeId),nutrition=recipe?.nutritionPerServing||{};
    const energy=recipe?energyValue(recipe,'energyKcalApprox'):null;
    const kj=recipe?energyValue(recipe,'energyKj'):null;
    const conflict=energyConflict(recipe);
    const valueHtml=(key,label,value,unit,formatter=itemNumber,warning=false,detail='')=>{
      const missing=value===null,text=missing?'—':formatter.format(value);
      const description=`${label}: ${missing?'neuvedeno':text+' '+unit} na porci.${detail?' '+detail:''}`;
      return `<span class="meal-value${missing?' missing-value':''}${warning?' inconsistent-value':''}" data-item-metric="${key}" data-value="${missing?'':value}" title="${esc(description)}" aria-label="${esc(description)}">${text}${unit?' '+unit:''}</span>`;
    };
    const energyDetail=kj===null?'':`${itemNumber.format(kj)} kJ.${conflict?' '+itemInformation(event).join(' '):number(nutrition.energyKcalApprox)===null?' Přepočteno z kJ.':''}`;
    const macro=(key,label,value)=>`<span class="meal-macro"><span class="meal-macro-label" aria-hidden="true">${label}</span> ${valueHtml(key,{protein:'Bílkoviny',fat:'Tuky',carbohydrates:'Sacharidy'}[key],number(value),'g')}</span>`;
    return `<div class="meal-item-values" aria-label="Cena a výživa na jednu porci${event.confirmed?'':'; nepotvrzená položka se nezapočítává do součtu'}"><div class="meal-primary-values">${valueHtml('price','Cena',recipe?number(recipe.pricePerServingCzk):null,'Kč',decimalPriceNumber)}<span class="meal-value-separator" aria-hidden="true">·</span>${valueHtml('energy','Energie',energy,'kcal',wholeNumber,conflict,energyDetail)}</div><div class="meal-macros">${macro('protein','B',nutrition.proteinG)}${macro('fat','T',nutrition.fatG)}${macro('carbohydrates','S',nutrition.carbohydratesG)}</div></div>`;
  }

  function renderItem(event,commonDiet){
    const recipe=recipesById.get(event.recipeId),name=event.replaced?event.recipeName:event.originalName||event.recipeName;
    const mapping=event.recipeName&&rules.key(event.recipeName)!==rules.key(event.originalName);
    return `<li class="${event.confirmed?'':'pending-menu-item'}"><span class="meal-item-title"><button type="button" class="meal-replace" data-menu-item-index="${event.itemIndex}" data-norm-href="${esc(recipe?._detailHref||'')}" data-norm-name="${esc(recipe?.name||'')}" data-norm-issues="${esc(itemInformation(event).join(' '))}" aria-haspopup="dialog" aria-controls="menuNormEditor" aria-label="Otevřít normu: ${esc(name)}"><b>${esc(name)}</b></button>${itemInformationHtml(event)}</span>${event.confirmed?'':`<span class="confirm-badge">${event.needsReview?'Přiřazení k ověření':'Nepotvrzeno'}</span>`}${itemValuesHtml(event)}${event.replaced?`<small>Původně: ${esc(event.originalName)}</small>`:mapping?`<small>Recept: ${esc(event.recipeName)}</small>`:''}${event.reviewWarning?`<small class="menu-review-warning">${esc(event.reviewWarning)}</small>`:''}${event.dietCode&&event.dietCode!==commonDiet?`<small>Dieta: ${esc(event.dietCode)}</small>`:''}</li>`;
  }

  function itemInformationHtml(event){
    const messages=itemInformation(event);
    if(!messages.length)return '';
    const recipe=recipesById.get(event.recipeId);
    if(recipe?._detailHref){
      const label=(event.confirmed?'Otevřít normu: ':'Otevřít navrženou normu: ')+recipe.name+' — '+messages.join(' ');
      return `<a class="meal-info-toggle" data-info-index="${event.itemIndex}" aria-haspopup="dialog" aria-controls="menuNormEditor" href="${esc(recipe._detailHref)}" aria-label="${esc(label)}" title="${esc(messages.join(' ')+' Kliknutím otevřete normu.')}"><span aria-hidden="true">!</span></a>`;
    }
    const label='Neúplné informace: '+(event.replaced?event.recipeName:event.originalName||event.recipeName)+' — '+messages.join(' ');
    return `<button type="button" class="meal-info-toggle" data-info-index="${event.itemIndex}" popovertarget="mealInfoPopover" aria-controls="mealInfoPopover" aria-expanded="false" aria-label="${esc(label)}" title="${esc(messages.join(' '))}"><span aria-hidden="true">!</span></button>`;
  }

  let infoButton=null;
  function closeItemInformation(){
    const popover=$('mealInfoPopover');
    if(popover.matches(':popover-open'))popover.hidePopover();
    if(infoButton)infoButton.setAttribute('aria-expanded','false');
    infoButton=null;
  }
  function openItemInformation(button){
    const group=imports.find(item=>item.id===selected),event=group?.events[Number(button.dataset.infoIndex)];
    if(!event)return;
    const popover=$('mealInfoPopover'),same=infoButton===button&&popover.matches(':popover-open');
    if(same){closeItemInformation();return}
    closeItemInformation();
    infoButton=button;
    $('mealInfoName').textContent=event.replaced?event.recipeName:event.originalName||event.recipeName;
    $('mealInfoText').textContent=itemInformation(event).join('\n');
    popover.showPopover();
    button.setAttribute('aria-expanded','true');
    positionItemInformation();
  }
  function positionItemInformation(){
    const popover=$('mealInfoPopover');
    if(!infoButton||!popover.matches(':popover-open'))return;
    const rect=infoButton.getBoundingClientRect(),bounds=popover.getBoundingClientRect();
    if(rect.bottom<0||rect.top>window.innerHeight){closeItemInformation();return}
    const left=Math.max(12,Math.min(rect.left,window.innerWidth-bounds.width-12));
    const top=rect.bottom+7+bounds.height<=window.innerHeight-12?rect.bottom+7:Math.max(12,rect.top-bounds.height-7);
    popover.style.left=left+'px';popover.style.top=top+'px';
  }
  $('mealInfoClose').addEventListener('click',()=>{const button=infoButton;closeItemInformation();button?.focus()});
  $('mealInfoPopover').addEventListener('toggle',event=>{if(event.newState==='closed'&&!$('mealInfoPopover').matches(':popover-open')){infoButton?.setAttribute('aria-expanded','false');infoButton=null}});
  window.addEventListener('resize',positionItemInformation);
  window.addEventListener('scroll',positionItemInformation);

  function comparisonState(metric,norm){
    // Incomplete sums below the norm cannot be judged; above it they already exceed it.
    if(metric.known&&metric.total>norm+1e-7)return 'above-norm';
    return metric.missing||!metric.known?'unknown-norm':'within-norm';
  }

  function comparisonHtml(metric,norm,unit,formatter){
    const actual=metric.known?formatter.format(metric.total):'—';
    return `<span class="stat-actual">${actual}</span><span class="stat-divider" aria-hidden="true"> / </span><span class="stat-norm">${formatter.format(norm)}${unit?' '+unit:''}</span>`;
  }

  function statHtml(key,label,metric,norm,unit,formatter,context,secondary=''){
    const incomplete=metric.missing>0,state=comparisonState(metric,norm);
    const actual=metric.known?formatter.format(metric.total)+(unit?' '+unit:''):'neuvedeno';
    const comparison=state==='above-norm'?'Nad normou.':state==='within-norm'?'Pod normou nebo na normě.':'Porovnání nelze uzavřít.';
    const missing=incomplete?` Neúplné údaje u ${metric.missing} položek; zobrazený součet je pouze dostupné minimum, nepotvrzené položky nejsou započítané.`:'';
    const title=`${context} ${label}: ${actual}. Norma: ${formatter.format(norm)}${unit?' '+unit:''}. ${comparison}${missing}`;
    return `<div class="day-stat ${state}${incomplete?' incomplete':''}" data-metric="${key}" data-total="${metric.known?metric.total:''}" data-norm="${norm}" data-missing="${metric.missing}" title="${esc(title)}" aria-label="${esc(title)}"><dt>${label}${incomplete?' min.':''}</dt><dd>${comparisonHtml(metric,norm,unit,formatter)}${secondary}</dd></div>`;
  }

  function daySummaryHtml(events,days=1,weekly=false){
    const price=totalMetric(events,recipe=>recipe.pricePerServingCzk);
    const energyKj=totalMetric(events,recipe=>energyValue(recipe,'energyKj'));
    const energyKcal=totalMetric(events,recipe=>energyValue(recipe,'energyKcalApprox'));
    const protein=totalMetric(events,recipe=>recipe.nutritionPerServing?.proteinG);
    const carbohydrates=totalMetric(events,recipe=>recipe.nutritionPerServing?.carbohydratesG);
    const fat=totalMetric(events,recipe=>recipe.nutritionPerServing?.fatG);
    const context=weekly?`Součet na osobu za ${days} dní v tomto jídelníčku.`:'Součet na osobu za den.';
    const caption=weekly?'Součet týdne na osobu':'Součet na osobu';
    const energySecondary=`<span class="stat-secondary">${comparisonHtml(energyKcal,dailyNorms.energyKj*days/4.184,'kcal',wholeNumber)}</span>`;
    return `<div class="day-summary${weekly?' week-summary':''}" data-summary-days="${days}"><span class="day-summary-caption">${caption}${weekly?`<small>Norma za ${days} ${days===1?'den':days<5?'dny':'dní'} v jídelníčku</small>`:''}</span><dl>${statHtml('price','Cena',price,dailyNorms.price*days,'Kč',decimalPriceNumber,context)}${statHtml('energy','Energie',energyKj,dailyNorms.energyKj*days,'kJ',wholeNumber,context,energySecondary)}${statHtml('protein','Bílkoviny',protein,dailyNorms.proteinG*days,'g',decimalNumber,context)}${statHtml('carbohydrates','Sacharidy',carbohydrates,dailyNorms.carbohydratesG*days,'g',decimalNumber,context)}${statHtml('fat','Tuky',fat,dailyNorms.fatG*days,'g',decimalNumber,context)}</dl></div>`;
  }

  function renderDay(date,events){
    const state=date===today?'today':date>today?'future':'past';
    const label=date===today?'Dnes':date>today?'Budoucí':'Minulé';
    const meals=new Map();
    const diets=new Set(events.map(event=>event.dietCode||''));
    const commonDiet=diets.size===1?[...diets][0]:'';
    for(const event of events){
      if(!meals.has(event.meal))meals.set(event.meal,[]);
      meals.get(event.meal).push(event);
    }
    const blocks=[...meals]
      .sort(([a],[b])=>mealOrder.indexOf(a)-mealOrder.indexOf(b))
      .map(([meal,items])=>`<section class="meal-block"><h4>${esc(meal)}</h4><ul>${items.map(event=>renderItem(event,commonDiet)).join('')}</ul></section>`)
      .join('');
    const dayKey=`${selected}|${date}`;
    const collapsed=!expandedDays.has(dayKey);
    const mealsId=`day-meals-${date}`;
    return`<article class="menu-day ${state}${collapsed?' collapsed':''}" data-day="${esc(date)}"><div class="day-heading"><div class="day-heading-main"><h3><button type="button" class="day-toggle" data-day-key="${esc(dayKey)}" aria-expanded="${collapsed?'false':'true'}" aria-controls="${mealsId}" aria-label="${collapsed?'Rozbalit':'Sbalit'} ${esc(dateLabel(date))}"><span class="day-chevron" aria-hidden="true">⌄</span><span class="day-date">${esc(dateLabel(date))}</span><span class="day-toggle-label">${collapsed?'Rozbalit':'Sbalit'}</span></button></h3><span class="day-period">${label}</span></div>${daySummaryHtml(events)}</div><div class="day-meals" id="${mealsId}"${collapsed?' hidden':''}>${blocks}<footer class="meal-values-legend">B = bílkoviny · T = tuky · S = sacharidy · vše na jednu porci · ! = údaj k ověření${commonDiet?`<span>Dieta: ${esc(commonDiet)}</span>`:''}</footer></div></article>`;
  }

  function render(){
    closeItemInformation();
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
      return`<section class="menu-week" aria-labelledby="${weekId}"><header class="week-heading"><div><span class="week-kicker">Pondělí–neděle</span><h2 id="${weekId}">${esc(weekRangeLabel(start))}</h2></div><span class="week-count">${dayCountLabel(weekDays.length)}</span></header>${daySummaryHtml(weekDays.flatMap(([,events])=>events),weekDays.length,true)}<div class="week-days">${weekDays.map(([date,events])=>renderDay(date,events)).join('')}</div></section>`;
    }).join('');
    $('menusStatus').textContent=`Zobrazen kompletní jídelníček ${item.sourceFile}: ${shortDate(item.from)} až ${shortDate(item.to)}. ${item.pending?item.pending+' položek čeká na potvrzení.':'Všechny položky jsou potvrzené.'}`;
  }

  document.addEventListener('menu-norm-updated',event=>{
    const update=event.detail,previous=recipesById.get(update?.id);
    if(!previous||typeof update.name!=='string'||!update.nutritionPerServing)return;
    const fields=['name','ingredients','servings','mealTypes','alternativeNames','nutritionPerServing','pricePerServingCzk'];
    recipesById.set(update.id,{...previous,...Object.fromEntries(fields.filter(key=>Object.hasOwn(update,key)).map(key=>[key,update[key]]))});
    for(const group of imports)for(const item of group.events)if(item.recipeId===update.id)item.recipeName=update.name;
    render();
  });
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
    const info=event.target.closest('[data-info-index]');
    if(info){if(info.matches('a[href]'))return;event.preventDefault();openItemInformation(info);return}
    const button=event.target.closest('[data-day-key]');
    if(!button)return;
    closeItemInformation();
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

  document.addEventListener('menu-norm-replace',event=>{
    if($('menuNormEditor').open&&!$('recipePicker').open)openPicker(Number(event.detail.index),$('menuNormReplace'));
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
    $('pickerStatus').textContent='Vyberte jídlo z databáze.';
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
    const conflict=rules.consistencyWarning(recipesById.get(recipe.id)||recipe);if(conflict){$('pickerStatus').textContent=conflict;return}
    saving=true;$('pickerSave').disabled=true;$('pickerClose').disabled=true;
    $('pickerStatus').textContent='Ukládám náhradu…';
    try{
      replacements=await replacementRequest({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,recipeId:recipe.id,baseRevision:replacements.revision})});
      event.originalName=target.originalName;event.recipeId=recipe.id;event.recipeName=recipe.name;event.replaced=true;event.confirmed=true;delete event.needsReview;delete event.reviewWarning;
      group.pending=group.events.filter(entry=>!entry.confirmed).length;
      render();
      returnFocus=$('menuNormEditor').open?$('menuNormReplace'):$('menuDays').querySelector(`[data-menu-item-index="${event.itemIndex}"]`);
      saving=false;$('recipePicker').close();
      document.dispatchEvent(new CustomEvent('menu-item-replaced',{detail:{index:String(event.itemIndex),href:recipe._detailHref||'',name:recipe.name}}));
      $('menusStatus').textContent=`Uloženo: ${recipe.name} · ${shortDate(event.date)} · ${event.meal}. Denní souhrn je přepočítaný.`;
    }catch(error){$('pickerStatus').textContent='Neuloženo: '+error.message}
    finally{saving=false;$('pickerSave').disabled=false;$('pickerClose').disabled=false}
  });
  $('todayLabel').textContent=dateLabel(today);
  load().catch(error=>{
    $('menusStatus').textContent='Jídelníčky se nepodařilo načíst: '+error.message;
    $('menuDays').innerHTML='<div class="menus-empty"><b>Data nejsou dostupná</b><span>Zkontrolujte připojení nebo místní server.</span></div>';
  });
})();

