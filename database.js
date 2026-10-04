const sources=[

{folder:'kureci-rolada-plnena-vejci-hraskem-a-sunkou',file:'kureci-rolada-plnena-vejci-hraskem-a-sunkou.json',storage:'receptar:kureci-rolada-plnena-vejci-hraskem-a-sunkou'},

{folder:'kureci-rizek-smazeny',file:'kureci-rizek-smazeny.json',storage:'receptar:kureci-rizek-smazeny'},

{folder:'kureci-stehna-uzena',file:'kureci-stehna-uzena.json',storage:'receptar:kureci-stehna-uzena'},

{folder:'kureci-zavitek-s-nivou-a-slaninou',file:'kureci-zavitek-s-nivou-a-slaninou.json',storage:'receptar:kureci-zavitek-s-nivou-a-slaninou'},

  {folder:'kureci-platek-se-smetanovo-bylinkovou-omackou-nove',file:'kureci-platek-se-smetanovo-bylinkovou-omackou-nove.json',storage:'receptar:kureci-platek-se-smetanovo-bylinkovou-omackou-nove'},

  {folder:'kureci-prsa-s-nivou-a-slaninou',file:'kureci-prsa-s-nivou-a-slaninou.json',storage:'receptar:kureci-prsa-s-nivou-a-slaninou'},

  {folder:'kureci-prirodni-rizek',file:'kureci-prirodni-rizek.json',storage:'receptar:kureci-prirodni-rizek'},

  {folder:'bramborova-kase',file:'bramborova-kase.json',storage:'receptar:bramborova-kase'},

  {folder:'sterilovane-okurky',file:'sterilovane-okurky.json',storage:'receptar:sterilovane-okurky'},

  {folder:'testovinova-ryze',file:'testovinova-ryze.json',storage:'receptar:testovinova-ryze'},

  {folder:'polevka-gulasova-vecere',file:'polevka-gulasova-vecere.json',storage:'receptar:polevka-gulasova-vecere'},

  {folder:'kremova-kureci-polevka',file:'kremova-kureci-polevka.json',storage:'receptar:kremova-kureci-polevka'},

  {folder:'polevka-porkova',file:'polevka-porkova.json',storage:'receptar:polevka-porkova'},

  {folder:'hovezi-gulas',file:'hovezi-gulas.json',storage:'receptar:hovezi-gulas'},

  {folder:'veprovy-rizek-holandsky',file:'veprovy-rizek-holandsky.json',storage:'receptar:veprovy-rizek-holandsky'},

  {folder:'bramborove-noky-s-kurecim-masem-a-spenatem',file:'bramborove-noky-s-kurecim-masem-a-spenatem.json',storage:'receptar:bramborove-noky-s-kurecim-masem-a-spenatem'},

  {folder:'zapecene-brambory-s-kurecim-masem-a-besamelem',file:'zapecene-brambory-s-kurecim-masem-a-besamelem.json',storage:'receptar:zapecene-brambory-s-kurecim-masem-a-besamelem'},

  {folder:'bramborove-placky-z-varenych-brambor',file:'bramborove-placky-z-varenych-brambor.json',storage:'receptar:bramborove-placky-z-varenych-brambor'},

  {folder:'houskove-knedliky',file:'houskove-knedliky.json',storage:'receptar:houskove-knedliky'},

  {folder:'polevka-kapustova-s-uzeninou',file:'polevka-kapustova-s-uzeninou.json',storage:'receptar:polevka-kapustova-s-uzeninou'},

  {folder:'polevka-borsc',file:'polevka-borsc.json',storage:'receptar:polevka-borsc'},

  {folder:'vanocka',file:'vanocka.json',storage:'receptar:vanocka'},

  {folder:'vanocka-dia',file:'vanocka-dia.json',storage:'receptar:vanocka-dia'},

  {folder:'vysocina-snidane',file:'vysocina-snidane.json',storage:'receptar:vysocina-snidane'},

  {folder:'chleb-100-g',file:'chleb-100-g.json',storage:'receptar:chleb-100-g'},

  {folder:'toustovy-chleb',file:'toustovy-chleb.json',storage:'receptar:toustovy-chleb'},

  {folder:'chleb-150-g',file:'chleb-150-g.json',storage:'receptar:chleb-150-g'},

  {folder:'kureci-platek-na-zampionech',file:'kureci-platek-na-zampionech.json',storage:'receptar:kureci-platek-na-zampionech'},

  {folder:'bramborovy-knedlik-plneny-uzenym',file:'bramborovy-knedlik-plneny-uzenym.json',storage:'receptar:bramborovy-knedlik-plneny-uzenym'},

  {folder:'hovezi-na-cesneku',file:'hovezi-na-cesneku.json',storage:'receptar:hovezi-na-cesneku'}

];

const normalize=value=>(value||'').toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();



const monthNames=['leden','unor','brezen','duben','kveten','cerven','cervenec','srpen','zari','rijen','listopad','prosinec'];

function recipeMonths(recipe){
 return RecipeImports.seasonMonths(recipe.season).map(number=>monthNames[number-1]);
}



function needsCompletion(recipe){return RecipeImports.needsCompletion(recipe)}
let recipes=[],activeMeal='',rotationFilter='';
const isMenuPicker=new URLSearchParams(location.search).get('pick')==='menu'&&window.parent!==window;
function activityMatches(recipe){const active=RecipeImports.isActive(recipe),status=document.getElementById('statusFilter').value;return (!isMenuPicker||active)&&(status==='all'||(status==='inactive'?!active:active))}
function planningMatches(recipe){if(!selectedMonth())return true;return RecipeImports.isActive(recipe)?RecipeImports.rotationMonth(recipe,selectedMonth())?.eligible:RecipeImports.seasonMonths(recipe.season).includes(Number(selectedMonth().slice(5)))}

function selectedMonth(){return document.getElementById('planningMonth').value}
function recommendation(recipe){return RecipeImports.rotationMonth(recipe,selectedMonth())?.state||RecipeImports.rotationState(recipe)}
function rotationState(recipe){return RecipeImports.rotationState(recipe).key}

function rotationLabel(recipe){return recommendation(recipe).label}

function searchable(recipe){return normalize([recipe.name,recipe.description,recipe.planningNote,...(recipe.alternativeNames||[]),RecipeImports.flavorOf(recipe),recipe.meatType,recipe.sideDish,recipe.preparationType,recipe.season?.availability,recipe.season?.recommendedDisplay,...(recipe.season?.recommended||[]),recipe.pricePerServingCzk].join(' '))}

let numericFilters={priceMin:null,priceMax:null,energyMin:null,energyMax:null,unit:'kcal'};
function readNumericFilters(){for(const key of ['priceMin','priceMax','energyMin','energyMax'])numericFilters[key]=RecipeFilters.bound(document.getElementById(key).value);numericFilters.unit=document.getElementById('energyUnit').value;return RecipeFilters.error(numericFilters.priceMin,numericFilters.priceMax,'Cena')||RecipeFilters.error(numericFilters.energyMin,numericFilters.energyMax,'Energie')}
function energyLabel(recipe){const value=RecipeFilters.energy(recipe,document.getElementById('energyUnit').value);return value===null?'Energie: neuvedena':value.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' '+document.getElementById('energyUnit').value+' / porce'}
function matches(recipe){const words=normalize(document.querySelector('#databaseQuery').value).split(' ').filter(Boolean),season=document.querySelector('#seasonFilter').value,popularity=document.querySelector('#popularityFilter').value,text=searchable(recipe),seasons=[recipe.season?.availability,recipe.season?.recommendedDisplay,...(recipe.season?.recommended||[])].filter(Boolean);return activityMatches(recipe)&&planningMatches(recipe)&&RecipeFilters.matches(recipe,numericFilters)&&words.every(word=>monthNames.includes(word)?recipeMonths(recipe).includes(word):text.includes(word))&&(!activeMeal||(activeMeal==='K doplnění'?needsCompletion(recipe):(recipe.mealTypes||[]).includes(activeMeal)))&&(!season||normalize(recipe.season?.availability)==='celorocne'||seasons.some(value=>normalize(value).includes(normalize(season))))&&(!popularity||Number(popularity)===Number(recipe.popularity))&&(!rotationFilter||(RecipeImports.isActive(recipe)&&rotationFilter===rotationState(recipe)))}

function card(recipe){recipe=RecipeImports.display(recipe);const base=`Recepty/${encodeURIComponent(recipe._folder)}/`,imagePath=recipe._imported?RecipeImports.imageHref(recipe):recipe.image?base+encodeURIComponent(recipe.image):null,image=imagePath?`<img src="${imagePath}" alt="">`:'🥔',price=recipe.pricePerServingCzk==null?'—':`${recipe.pricePerServingCzk.toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})} Kč`;return `<a class="recipe-card${RecipeImports.isActive(recipe)?'':' is-inactive'}" data-recipe-id="${recipe.id}" href="${RecipeImports.href(recipe)}"><span class="recipe-thumb">${image}</span><div class="recipe-card-body"><div class="recipe-title"><h3>${recipe.name}</h3><strong>${price}</strong></div><p>${recipe.description}</p><div class="recipe-tags">${[...new Set([energyLabel(recipe),!RecipeImports.isActive(recipe)?'Neaktivní / nepoužívaná':null,needsCompletion(recipe)?'K doplnění':null,RecipeImports.flavorOf(recipe),...(recipe.mealTypes||[]),recipe.season?.availability,`${recipe.servings} porcí`].filter(Boolean))].map(value=>`<span>${value}</span>`).join('')}</div><div class="recipe-meta"><span>${recipe.popularity?`Oblíbenost: ${recipe.popularity}`:'Oblíbenost: neurčena'}</span><span>${rotationLabel(recipe)}</span></div></div><em>›</em></a>`}

function applyFilters(){saveFilterState();const error=readNumericFilters(),message=document.getElementById('valueFilterError');message.textContent=error;message.hidden=!error;const visible=error?[]:recipes.filter(matches);if(rotationFilter==='ready')visible.sort((a,b)=>RecipeImports.rotationState(b).overdueDays-RecipeImports.rotationState(a).overdueDays||a.name.localeCompare(b.name,'cs'));document.getElementById('filteredCount').textContent=error?'':`Zobrazeno ${visible.length} z ${recipes.length} norem`;const results=document.querySelector('#recipeResults');results.innerHTML=visible.map(card).join('');results.querySelectorAll('a[href$=".html"]').forEach(link=>link.href+='?v=55');document.querySelector('#noResults').hidden=!!error||visible.length>0}

document.querySelector('#databaseSearch').addEventListener('submit',event=>{event.preventDefault();applyFilters()});

document.querySelectorAll('[data-meal]').forEach(button=>button.addEventListener('click',()=>{activeMeal=activeMeal===button.dataset.meal?'':button.dataset.meal;document.querySelectorAll('[data-meal]').forEach(item=>item.classList.toggle('selected',item.dataset.meal===activeMeal));applyFilters()}));

document.getElementById('planningMonth').addEventListener('change',()=>{rotationFilter='';document.getElementById('rotationFilter').value='';applyFilters()});
document.querySelector('#statusFilter').addEventListener('change',applyFilters);document.querySelector('#seasonFilter').addEventListener('change',applyFilters);document.querySelector('#popularityFilter').addEventListener('change',applyFilters);document.querySelector('#rotationFilter').addEventListener('change',event=>{rotationFilter=event.target.value;applyFilters()});

document.querySelector('#clearFilters').addEventListener('click',()=>{activeMeal='';rotationFilter='';document.getElementById('statusFilter').value='active';document.querySelectorAll('[data-meal]').forEach(button=>button.classList.remove('selected'));document.querySelectorAll('#planningMonth,#seasonFilter,#popularityFilter,#rotationFilter,#databaseQuery,#priceMin,#priceMax,#energyMin,#energyMax').forEach(input=>input.value='');applyFilters()});

const filterStorageKey='receptar:database-filters:v1';
// Returning from an editor/import must use fresh disk history and recommendations.
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
const filterFields=['statusFilter','planningMonth','databaseQuery','seasonFilter','popularityFilter','rotationFilter','priceMin','priceMax','energyMin','energyMax','energyUnit'];
const filterParams={status:'statusFilter',month:'planningMonth',q:'databaseQuery',season:'seasonFilter',popularity:'popularityFilter',rotation:'rotationFilter',priceMin:'priceMin',priceMax:'priceMax',energyMin:'energyMin',energyMax:'energyMax',unit:'energyUnit'};
function saveFilterState(){
 try{sessionStorage.setItem(filterStorageKey,JSON.stringify({meal:activeMeal,...Object.fromEntries(filterFields.map(id=>[id,document.getElementById(id).value]))}))}catch{}
 const url=new URL(location.href);
 for(const [param,id] of Object.entries(filterParams)){const value=document.getElementById(id).value;if(value)url.searchParams.set(param,value);else url.searchParams.delete(param)}
 if(activeMeal)url.searchParams.set('meal',activeMeal);else url.searchParams.delete('meal');
 history.replaceState(null,'',url);
}
const params=new URLSearchParams(location.search);const explicit=['meal',...Object.keys(filterParams)].some(k=>params.has(k));let previous={};if(!explicit)try{previous=JSON.parse(sessionStorage.getItem(filterStorageKey)||'{}')}catch{}
for(const id of filterFields)if(typeof previous[id]==='string')document.getElementById(id).value=previous[id];
if(!['kcal','kJ'].includes(document.getElementById('energyUnit').value))document.getElementById('energyUnit').value='kcal';
activeMeal=explicit?(params.get('meal')||''):(previous.meal||'');
if(explicit)for(const [param,id] of Object.entries(filterParams))document.getElementById(id).value=params.get(param)||(id==='energyUnit'?'kcal':id==='statusFilter'?'active':'');
if(!['active','inactive','all'].includes(document.getElementById('statusFilter').value))document.getElementById('statusFilter').value='active';
if(isMenuPicker){document.getElementById('statusFilter').value='active';document.getElementById('statusFilter').disabled=true;document.getElementById('statusFilter').title='Do jídelníčku lze vybrat pouze aktivní normy.'}
if(params.get('rotation')==='overdue')document.getElementById('rotationFilter').value='ready';
rotationFilter=document.getElementById('rotationFilter').value;document.querySelectorAll('[data-meal]').forEach(button=>button.classList.toggle('selected',button.dataset.meal===activeMeal));
window.addEventListener('pagehide',saveFilterState);document.getElementById('databaseQuery').addEventListener('input',saveFilterState);


Promise.all(sources.map(async source=>({...await BuiltinStorage.load(`Recepty/${encodeURIComponent(source.folder)}/${source.file}?v=88`,source.storage),_folder:source.folder}))).then(async data=>{await RecipeImports.ready;recipes=RecipeImports.combine(data);document.querySelector('#recipeCount').textContent=`${recipes.length} uložené recepty`;applyFilters()}).catch(error=>{document.querySelector('#recipeCount').textContent=error.message||'Recepty se nepodařilo načíst';document.querySelector('#noResults').hidden=false});











// Check for app updates even when opening the database directly.

if ('serviceWorker' in navigator) window.addEventListener('load', () => {

  navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(registration => registration.update()).catch(error => console.warn('Aktualizace offline verze se nezdařila.', error));

});


for(const id of ['priceMin','priceMax','energyMin','energyMax'])document.getElementById(id).addEventListener('input',applyFilters);
let previousEnergyUnit=document.getElementById('energyUnit').value;
document.getElementById('energyUnit').addEventListener('change',()=>{const unit=document.getElementById('energyUnit').value;for(const id of ['energyMin','energyMax']){const input=document.getElementById(id),value=RecipeFilters.bound(input.value);if(value!==null&&Number.isFinite(value))input.value=String(Number((value*(previousEnergyUnit==='kcal'?4.184:1/4.184)).toFixed(6)))}previousEnergyUnit=unit;applyFilters()});
