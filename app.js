const STORAGE_KEY='receptar:zapecene-brambory-s-kurecim-masem-a-besamelem';
const defaultRecipe={
  name:'Zapečené brambory s kuřecím masem a bešamelem',planningNote:'',
  alternativeNames:['Zapečené brambory s kuřetem','Kuřecí brambory s bešamelem'],
  description:'Kuřecí prsa, brambory, smetanový bešamel, mozzarella a balkánský sýr.',
  servings:10,pricePerServingCzk:30.57,mealTypes:['Oběd'],meatType:'Kuřecí',sideDish:'Brambory',preparationType:'Zapečené',status:'active',
  season:{availability:'Celoročně',recommendedDisplay:'Podzim–zima',recommended:['Podzim','Zima'],months:'Září–březen'},nutritionPerServing:{energyKj:3092,proteinG:44.6,fatG:19.8,carbohydratesG:79.5,fiberG:5.3},
  popularity:null,lastServedAt:null,history:[]
};
let recipe=defaultRecipe;
let dashboardRecipes=[];
let selectedQuickRecipe=null;
const dashboardSources=[
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

function normalize(value=''){return value.toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function formatDate(value){return value?new Intl.DateTimeFormat('cs-CZ').format(new Date(`${value}T12:00:00`)):'—'}
function addDays(value,days){const date=new Date(`${value}T12:00:00`);date.setDate(date.getDate()+days);return date}
function daysBetween(a,b){return Math.floor((b-a)/86400000)}
function lastUsed(item=recipe){return [...(item.history||[]),item.lastServedAt].filter(Boolean).sort().at(-1)||null}
function getRotationState(item=recipe,month=''){
  return (month?RecipeImports.rotationMonth(item,month)?.state:null)||RecipeImports.rotationState(item);
}

async function loadDashboardRecipes(){
  const baseRecipes=await Promise.all(dashboardSources.map(async source=>({...await BuiltinStorage.load(`Recepty/${source.folder}/${source.file}?v=88`,source.storage),_folder:source.folder,_storage:source.storage})));
  await RecipeImports.ready;await RecipeImports.refreshCatalog();return RecipeImports.combine(baseRecipes);
}
function rotationPriority(state){return({overdue:0,ready:1,none:2,early:3,unset:4,off:5})[state.key]??9}
function rotationBand(state={}){
  if(state.key==='none')return {key:'no-history',label:'Bez historie'};
  const overdueDays=Number(state.overdueDays)||0;
  if(overdueDays>=60)return {key:'forgotten',label:'Zapomenuté'};
  if(overdueDays>=30)return {key:'waiting',label:'Dlouho nepoužito'};
  return {key:'fresh',label:'Nově po rotaci'};
}
let dashboardLoading=false;
let rotationLimit=10;
async function renderDashboard(){
  if(dashboardLoading)return;
  dashboardLoading=true;
  try{
    dashboardRecipes=await loadDashboardRecipes();
    recipe=dashboardRecipes.find(item=>item.id==='zapecene-brambory-s-kurecim-masem-a-besamelem')||defaultRecipe;
  }catch(error){
    document.querySelector('#repeatList').textContent=error.message||'Recepty se nepodařilo načíst.';
    const row=Array.from(document.querySelectorAll('aside p')).find(p=>p.textContent.includes('Receptů v databázi'));if(row)row.lastElementChild.textContent='nedostupné';
    document.getElementById('rotationCount').textContent='';
    document.getElementById('rotationMore').hidden=true;
    dashboardLoading=false;
    return;
  }
  dashboardLoading=false;
  const countRow=Array.from(document.querySelectorAll('aside p')).find(p=>p.textContent.includes('Receptů v databázi'));if(countRow)countRow.lastElementChild.textContent=dashboardRecipes.length;
  renderRotation();
}
function renderRotation(){
  const repeat=document.querySelector('#repeatList');
  const month=document.getElementById('rotationMonth').value;
  const seasonMonth=Number((month||RecipeImports.todayString().slice(0,7)).slice(5,7));
  const end=month?RecipeImports.rotationMonth({},month)?.end:null;
  const period=end?'K '+formatDate(end)+': ':'Dnes: ';
  document.getElementById('rotationPeriod').textContent=end?'Zobrazeny jsou pouze normy vhodné pro vybraný měsíc, kterým rotace skončí nejpozději '+formatDate(end)+', a normy bez historie. Stavy Dlouho nepoužito a Zapomenuté se vztahují k tomuto datu.':'Zobrazeny jsou pouze normy vhodné pro aktuální měsíc. Rotace se řídí dnešním datem.';
  const eligible=dashboardRecipes.map(item=>({item,state:getRotationState(item,month)})).filter(({item,state})=>(!item.status||item.status==='active')&&RecipeImports.seasonMonths(item.season).includes(seasonMonth)&&(state.key==='ready'||state.key==='none'));
  const urgency=document.getElementById('rotationUrgency').value;
  const sort=document.getElementById('rotationSort').value;
  const query=normalize(document.getElementById('rotationSearch').value);
  const meal=document.getElementById('rotationMeal').value;

  const filtered=eligible.filter(({item,state})=>
    (!query||normalize([item.name,...(item.alternativeNames||[])].join(' ')).includes(query))&&
    (!meal||(item.mealTypes||[]).includes(meal))&&

    (!urgency||rotationBand(state).key===urgency));
  filtered.sort((a,b)=>{
    if(sort==='name')return a.item.name.localeCompare(b.item.name,'cs');
    if(a.state.key!==b.state.key)return a.state.key==='ready'?-1:1;
    if(a.state.key==='none')return a.item.name.localeCompare(b.item.name,'cs');
    if(sort==='overdue-asc')return a.state.overdueDays-b.state.overdueDays||a.item.name.localeCompare(b.item.name,'cs');
    return b.state.overdueDays-a.state.overdueDays||a.item.name.localeCompare(b.item.name,'cs');
  });
  const visible=filtered.slice(0,rotationLimit);
  repeat.innerHTML=visible.length?visible.map(({item,state})=>{const band=rotationBand(state),rotationDate=state.key==='none'?'':`<span>${state.label}</span>`;item=RecipeImports.display(item);const base=`Recepty/${encodeURIComponent(item._folder)}/`,imagePath=item._imported?RecipeImports.imageHref(item):item.image?base+encodeURIComponent(item.image):null,image=imagePath?`<img src="${imagePath}" alt="">`:'🥔';return `<article class="dish"><a style="display:contents;text-decoration:none;color:inherit" href="${RecipeImports.href(item)}" aria-label="Otevřít detail: ${item.name}"><span class="dish-icon">${image}</span><div><b>${item.name}</b><div class="tags"><span>${(item.mealTypes||[]).join(", ")||"Nezařazeno"}</span><span class="rotation-band ${band.key}">${band.label}</span>${rotationDate}</div></div></a><div class="age"><strong>${state.detail}</strong><button class="quick-info-button" style="display:block;margin-top:7px;border:1px solid #9bc9aa;border-radius:7px;background:#f1faf4;color:#137738;padding:6px 10px;font-weight:700;cursor:pointer" type="button" data-quick-recipe="${item.id}">Rychlé info</button></div></article>`}).join(''):`<div class="empty-state"><span>◇</span><b>Žádná norma pro zvolené období není k hlídání</b><p>Zobrazují se pouze normy vhodné pro daný měsíc s nastavenou oblíbeností, které jsou po rotaci nebo bez historie použití.</p></div>`;
  if(!visible.length&&eligible.length)repeat.innerHTML='<div class="empty-state"><b>Žádná norma neodpovídá filtrům</b><p>Změňte výběr nebo použijte tlačítko Zrušit filtry.</p></div>';
  document.getElementById('rotationMore').hidden=visible.length>=filtered.length;
  repeat.querySelectorAll('a[href$=".html"]').forEach(link=>link.href+='?v=55');
  const readyCount=eligible.filter(({state})=>state.key==='ready').length;
  const noHistoryCount=eligible.length-readyCount;
  document.getElementById('rotationCount').textContent=period+'Po rotaci: '+readyCount+'. Bez historie: '+noHistoryCount+'. Odpovídá filtrům: '+filtered.length+'. Zobrazeno: '+visible.length+'.';
  updateRecipePreview();
  document.querySelectorAll('[data-quick-recipe]').forEach(button=>button.addEventListener('click',()=>openQuickInfo(button.dataset.quickRecipe)));
}

function openQuickInfo(id){
  selectedQuickRecipe=dashboardRecipes.find(item=>item.id===id)||recipe;
  document.querySelector('#quickInfoName').textContent=selectedQuickRecipe.name;
  document.querySelector('#quickPrice').textContent=selectedQuickRecipe.pricePerServingCzk==null?'—':`${selectedQuickRecipe.pricePerServingCzk.toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})} Kč`;
  document.querySelector('#quickNote').textContent=selectedQuickRecipe.planningNote||'Bez poznámky.';
  const n=selectedQuickRecipe.nutritionPerServing||{};
  document.querySelector('.quick-nutrition').innerHTML=[['Energie',n.energyKj,'kJ'],['Bílkoviny',n.proteinG,'g'],['Tuky',n.fatG,'g'],['Sacharidy',n.carbohydratesG,'g'],['Vláknina',n.fiberG,'g']].map(([label,value,unit])=>`<p style="display:flex;justify-content:space-between"><span>${label}</span><b>${value==null?'—':`${value.toLocaleString('cs-CZ')} ${unit}`}</b></p>`).join('');
  document.querySelector('#quickInfoDialog').showModal();
}

function updateRecipePreview(){
  if(!document.querySelector('#recipePreview'))return;
  const state=getRotationState(),availability=recipe.season?.availability||'—',recommended=recipe.season?.recommendedDisplay||recipe.season?.recommended?.join('–')||'—';
  document.querySelector('#previewName').textContent=recipe.name;
  document.querySelector('#previewDescription').textContent=recipe.description;
  document.querySelector('#previewPrice').textContent=recipe.pricePerServingCzk==null?'—':`${recipe.pricePerServingCzk.toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})} Kč`;
  document.querySelector('#previewTags').innerHTML=[...new Set([RecipeImports.flavorOf(recipe),...(recipe.mealTypes||[]),availability,`${recipe.servings} porcí`].filter(Boolean))].map(tag=>`<span>${tag}</span>`).join('');
  document.querySelector('#previewPopularity').textContent=recipe.popularity?`Oblíbenost: ${recipe.popularity}`:'Oblíbenost: neurčena';
  document.querySelector('#previewRotation').textContent=`Rotace: ${state.label.toLocaleLowerCase('cs')}`;
  document.querySelector('#recipePreview').dataset.search=[recipe.name,recipe.description,...(recipe.alternativeNames||[]),recipe.meatType,recipe.sideDish,recipe.preparationType,availability,recommended,recipe.pricePerServingCzk].filter(Boolean).join(' ').toLocaleLowerCase('cs');
}

const toast=document.querySelector('#toast');
function showToast(message){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2400)}
document.getElementById('rotationFilters').addEventListener('submit',event=>event.preventDefault());
document.getElementById('rotationFilters').addEventListener('input',()=>{rotationLimit=10;renderRotation()});
document.getElementById('rotationFilters').addEventListener('reset',()=>{setTimeout(()=>{rotationLimit=10;renderRotation()},0)});
document.getElementById('rotationMore').addEventListener('click',()=>{rotationLimit+=10;renderRotation()});
document.querySelector('#menuButton').addEventListener('click',()=>document.querySelector('#sidebar').classList.toggle('open'));
document.addEventListener('click',event=>{if(innerWidth<=760&&!event.target.closest('#sidebar')&&!event.target.closest('#menuButton'))document.querySelector('#sidebar').classList.remove('open')});

document.querySelector('#closeQuickInfo').addEventListener('click',()=>document.querySelector('#quickInfoDialog').close());
document.querySelector('#closeQuickInfoBottom').addEventListener('click',()=>document.querySelector('#quickInfoDialog').close());
document.querySelector('#openRecipeFromInfo').addEventListener('click',()=>{if(selectedQuickRecipe)window.location.href=RecipeImports.href(selectedQuickRecipe)});

window.addEventListener('pageshow',event=>{if(event.persisted)renderDashboard()});
window.addEventListener('storage',event=>{if(!event.key||event.key.startsWith('receptar:'))renderDashboard()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderDashboard()});
renderDashboard();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));









