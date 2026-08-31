const rotationIntervals={1:60,2:90,3:120};

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

 const s=recipe.season||{},raw=normalize(s.months),names=raw.split(' ').filter(w=>monthNames.includes(w));

 if(raw==='celorocne')return monthNames;

 if(names.length===2&&/[–—-]/.test(s.months||'')){const out=[];let i=monthNames.indexOf(names[0]);for(let count=0;count<12;count++,i=(i+1)%12){out.push(monthNames[i]);if(monthNames[i]===names[1])break}return out}

 if(names.length)return [...new Set(names)];

 const rec=(s.recommended||[]).map(normalize);if(rec.includes('celorocne'))return monthNames;

 const map={jaro:[2,3,4],leto:[5,6,7],podzim:[8,9,10],zima:[11,0,1]};

 const out=[...new Set(rec.flatMap(x=>(map[x]||[]).map(i=>monthNames[i])))];

 return out.length?out:normalize(s.availability)==='celorocne'?monthNames:[];

}



function needsCompletion(recipe){return ['needs-completion','needs-review'].includes(recipe.completionStatus)}
let recipes=[],activeMeal='',rotationFilter='';

function rotationState(recipe){const last=[...(recipe.history||[]),recipe.lastServedAt].filter(Boolean).sort().at(-1),interval=rotationIntervals[recipe.popularity]||null;if(!last)return'none';if(!interval)return'unset';const next=new Date(new Date(`${last}T12:00:00`).getTime()+interval*86400000),remaining=Math.ceil((next-new Date())/86400000),overdue=Math.abs(remaining);if(remaining>14)return'early';if(remaining>0)return'soon';if(overdue>interval)return'forgotten';if(overdue>30)return'overdue';return'ready'}

function rotationLabel(recipe){return({none:'bez historie',unset:'čeká na nastavení',early:'příliš brzy',soon:'brzy bude možné',ready:'lze zařadit',overdue:'dlouho nebylo',forgotten:'zapomenuté'})[rotationState(recipe)]}

function searchable(recipe){return normalize([recipe.name,recipe.description,recipe.planningNote,...(recipe.alternativeNames||[]),recipe.meatType,recipe.sideDish,recipe.preparationType,recipe.season?.availability,recipe.season?.recommendedDisplay,...(recipe.season?.recommended||[]),recipe.pricePerServingCzk].join(' '))}

let numericFilters={priceMin:null,priceMax:null,energyMin:null,energyMax:null,unit:'kcal'};
function readNumericFilters(){for(const key of ['priceMin','priceMax','energyMin','energyMax'])numericFilters[key]=RecipeFilters.bound(document.getElementById(key).value);numericFilters.unit=document.getElementById('energyUnit').value;return RecipeFilters.error(numericFilters.priceMin,numericFilters.priceMax,'Cena')||RecipeFilters.error(numericFilters.energyMin,numericFilters.energyMax,'Energie')}
function energyLabel(recipe){const value=RecipeFilters.energy(recipe,document.getElementById('energyUnit').value);return value===null?'Energie: neuvedena':value.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' '+document.getElementById('energyUnit').value+' / porce'}
function matches(recipe){const words=normalize(document.querySelector('#databaseQuery').value).split(' ').filter(Boolean),season=document.querySelector('#seasonFilter').value,popularity=document.querySelector('#popularityFilter').value,text=searchable(recipe),seasons=[recipe.season?.availability,recipe.season?.recommendedDisplay,...(recipe.season?.recommended||[])].filter(Boolean);return RecipeFilters.matches(recipe,numericFilters)&&words.every(word=>monthNames.includes(word)?recipeMonths(recipe).includes(word):text.includes(word))&&(!activeMeal||(activeMeal==='K doplnění'?needsCompletion(recipe):(recipe.mealTypes||[]).includes(activeMeal)))&&(!season||normalize(recipe.season?.availability)==='celorocne'||seasons.some(value=>normalize(value).includes(normalize(season))))&&(!popularity||Number(popularity)===Number(recipe.popularity))&&(!rotationFilter||rotationFilter===rotationState(recipe))}

function card(recipe){recipe=RecipeImports.display(recipe);const base=`Recepty/${encodeURIComponent(recipe._folder)}/`,imagePath=recipe._imported?RecipeImports.imageHref(recipe):recipe.image?base+encodeURIComponent(recipe.image):null,image=imagePath?`<img src="${imagePath}" alt="">`:'🥔',recommended=recipe.season?.recommendedDisplay||recipe.season?.recommended?.join('–')||'—',price=recipe.pricePerServingCzk==null?'—':`${recipe.pricePerServingCzk.toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})} Kč`;return `<a class="recipe-card" href="${RecipeImports.href(recipe)}"><span class="recipe-thumb">${image}</span><div class="recipe-card-body"><div class="recipe-title"><h3>${recipe.name}</h3><strong>${price}</strong></div><p>${recipe.description}</p><div class="recipe-tags">${[energyLabel(recipe),needsCompletion(recipe)?'K doplnění':null,...(recipe.mealTypes||[]),recipe.meatType,recipe.season?.availability,recommended,`${recipe.servings} porcí`].filter(Boolean).map(value=>`<span>${value}</span>`).join('')}</div><div class="recipe-meta"><span>${recipe.popularity?`Oblíbenost: ${recipe.popularity}`:'Oblíbenost: neurčena'}</span><span>Rotace: ${rotationLabel(recipe)}</span></div></div><em>›</em></a>`}

function applyFilters(){saveFilterState();const error=readNumericFilters(),message=document.getElementById('valueFilterError');message.textContent=error;message.hidden=!error;const visible=error?[]:recipes.filter(matches);document.getElementById('filteredCount').textContent=error?'':`Zobrazeno ${visible.length} z ${recipes.length} norem`;const results=document.querySelector('#recipeResults');results.innerHTML=visible.map(card).join('');results.querySelectorAll('a[href$=".html"]').forEach(link=>link.href+='?v=55');document.querySelector('#noResults').hidden=!!error||visible.length>0}

document.querySelector('#databaseSearch').addEventListener('submit',event=>{event.preventDefault();applyFilters()});

document.querySelectorAll('[data-meal]').forEach(button=>button.addEventListener('click',()=>{activeMeal=activeMeal===button.dataset.meal?'':button.dataset.meal;document.querySelectorAll('[data-meal]').forEach(item=>item.classList.toggle('selected',item.dataset.meal===activeMeal));applyFilters()}));

document.querySelector('#seasonFilter').addEventListener('change',applyFilters);document.querySelector('#popularityFilter').addEventListener('change',applyFilters);document.querySelector('#rotationFilter').addEventListener('change',event=>{rotationFilter=event.target.value;applyFilters()});

document.querySelector('#clearFilters').addEventListener('click',()=>{activeMeal='';rotationFilter='';document.querySelectorAll('[data-meal]').forEach(button=>button.classList.remove('selected'));document.querySelectorAll('#seasonFilter,#popularityFilter,#rotationFilter,#databaseQuery,#priceMin,#priceMax,#energyMin,#energyMax').forEach(input=>input.value='');applyFilters()});

const filterStorageKey='receptar:database-filters:v1';
const filterFields=['databaseQuery','seasonFilter','popularityFilter','rotationFilter','priceMin','priceMax','energyMin','energyMax','energyUnit'];
function saveFilterState(){try{sessionStorage.setItem(filterStorageKey,JSON.stringify({meal:activeMeal,...Object.fromEntries(filterFields.map(id=>[id,document.getElementById(id).value]))}))}catch{}}
const params=new URLSearchParams(location.search);const explicit=['meal','rotation','q','season','popularity'].some(k=>params.has(k));let previous={};if(!explicit)try{previous=JSON.parse(sessionStorage.getItem(filterStorageKey)||'{}')}catch{}
for(const id of filterFields)if(typeof previous[id]==='string')document.getElementById(id).value=previous[id];
if(!['kcal','kJ'].includes(document.getElementById('energyUnit').value))document.getElementById('energyUnit').value='kcal';
activeMeal=explicit?(params.get('meal')||''):(previous.meal||'');
if(explicit)for(const [param,id] of Object.entries({q:'databaseQuery',season:'seasonFilter',popularity:'popularityFilter',rotation:'rotationFilter'}))document.getElementById(id).value=params.get(param)||'';
rotationFilter=document.getElementById('rotationFilter').value;document.querySelectorAll('[data-meal]').forEach(button=>button.classList.toggle('selected',button.dataset.meal===activeMeal));
window.addEventListener('pagehide',saveFilterState);document.getElementById('databaseQuery').addEventListener('input',saveFilterState);


Promise.all(sources.map(async source=>{const base=await fetch(`Recepty/${encodeURIComponent(source.folder)}/${source.file}?v=55`).then(response=>response.json());let saved={};try{saved=JSON.parse(localStorage.getItem(source.storage)||'{}')}catch{}return {...base,...saved,_folder:source.folder,season:{...base.season,...(saved.season||{})}}})).then(async data=>{await RecipeImports.ready;recipes=RecipeImports.combine(data);document.querySelector('#recipeCount').textContent=`${recipes.length} uložené recepty`;applyFilters()}).catch(()=>{document.querySelector('#recipeCount').textContent='Recepty se nepodařilo načíst';document.querySelector('#noResults').hidden=false});











// Check for app updates even when opening the database directly.

if ('serviceWorker' in navigator) window.addEventListener('load', () => {

  navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).then(registration => registration.update()).catch(error => console.warn('Aktualizace offline verze se nezdařila.', error));

});


for(const id of ['priceMin','priceMax','energyMin','energyMax'])document.getElementById(id).addEventListener('input',applyFilters);
let previousEnergyUnit=document.getElementById('energyUnit').value;
document.getElementById('energyUnit').addEventListener('change',()=>{const unit=document.getElementById('energyUnit').value;for(const id of ['energyMin','energyMax']){const input=document.getElementById(id),value=RecipeFilters.bound(input.value);if(value!==null&&Number.isFinite(value))input.value=String(Number((value*(previousEnergyUnit==='kcal'?4.184:1/4.184)).toFixed(6)))}previousEnergyUnit=unit;applyFilters()});
