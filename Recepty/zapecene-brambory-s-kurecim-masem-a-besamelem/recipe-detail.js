const DATA_URL='./zapecene-brambory-s-kurecim-masem-a-besamelem.json';
const STORAGE_KEY='receptar:zapecene-brambory-s-kurecim-masem-a-besamelem';
const rotationByPopularity={1:60,2:90,3:120};
let recipe;

const formatDate=value=>value?new Intl.DateTimeFormat('cs-CZ').format(new Date(`${value}T12:00:00`)):'—';
const calculateNext=(date,days)=>{if(!date||!days)return null;const next=new Date(`${date}T12:00:00`);next.setDate(next.getDate()+days);return next.toISOString().slice(0,10)};
const showToast=message=>{const toast=document.querySelector('#detailToast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200)};

function render(){
  const rotationDays=rotationByPopularity[recipe.popularity]||null;
  const nextRotation=calculateNext(recipe.lastServedAt,rotationDays);
  document.title=recipe.name;
  document.querySelector('#recipeName').textContent=recipe.name;
  document.querySelector('#recipeDescription').textContent=recipe.description;
  document.querySelector('#planningNote').textContent=recipe.planningNote||'Bez pracovní poznámky.';
  document.querySelector('#heroServings').textContent=recipe.servings;
  document.querySelector('#ingredientServings').textContent=recipe.servings;
  document.querySelector('#seasonAvailability').textContent=recipe.season.availability||'—';
  document.querySelector('#seasonRecommended').textContent=recipe.season.recommendedDisplay||recipe.season.recommended.join('–')||'—';
  document.querySelector('#seasonMonths').textContent=recipe.season.months||'—';
  document.querySelector('#popularity').textContent=recipe.popularity?String(recipe.popularity):'Neurčena';
  document.querySelector('#rotation').textContent=rotationDays?`${rotationDays} dní`:'Čeká na nastavení';
  document.querySelector('#lastServed').textContent=formatDate(recipe.lastServedAt);
  document.querySelector('#nextRotation').textContent=formatDate(nextRotation);
  document.querySelector('#price').textContent=recipe.pricePerServingCzk==null?'—':`${recipe.pricePerServingCzk.toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})} Kč`;
  document.querySelector('#heroTags').innerHTML=[...recipe.mealTypes,recipe.season.availability,recipe.season.recommendedDisplay||recipe.season.recommended.join('–')].filter(Boolean).map(tag=>`<span>${tag}</span>`).join('');
  document.querySelector('#ingredients').innerHTML=recipe.ingredients.map(i=>`<div class="ingredient-row"><span>${i.name}${i.needsClarification?' <small title="Jednotka vyžaduje upřesnění">⚠ upřesnit</small>':''}</span><b>${String(i.amount).replace('.',',')} ${i.unit}</b></div>`).join('');
  renderHistory();
}

function renderHistory(){const dates=[...(recipe.history||[]),recipe.lastServedAt].filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).sort();const yearAgo=new Date();yearAgo.setFullYear(yearAgo.getFullYear()-1);const recent=dates.filter(value=>new Date(`${value}T12:00:00`)>=yearAgo);const gaps=dates.slice(1).map((value,index)=>Math.round((new Date(`${value}T12:00:00`)-new Date(`${dates[index]}T12:00:00`))/86400000));const average=gaps.length?Math.round(gaps.reduce((sum,value)=>sum+value,0)/gaps.length):null,shortest=gaps.length?Math.min(...gaps):null,expected=rotationByPopularity[recipe.popularity]||null;document.querySelector('#historyYear').textContent=recent.length;document.querySelector('#historyAverage').textContent=average?`${average} dní`:'—';document.querySelector('#historyShortest').textContent=shortest?`${shortest} dní`:'—';document.querySelector('#historyAssessment').textContent=!dates.length?'Bez historie':!expected?'Rotace neurčena':average&&average<expected?'Používá se často':average&&average>expected*1.5?'Používá se málo':'Odpovídá rotaci';document.querySelector('#historyList').innerHTML=dates.length?[...dates].reverse().map(value=>`<div class="ingredient-row"><span>Zařazeno v jídelníčku</span><b>${formatDate(value)}</b></div>`).join(''):'<div class="pending">Zatím nebylo zaznamenáno žádné použití.</div>'}

function openEditor(){
  const form=document.querySelector('#editForm');
  BuiltinStorage.keepOptions(form,recipe);
  form.elements.name.value=recipe.name;
  form.elements.description.value=recipe.description;
  form.elements.alternativeNames.value=(recipe.alternativeNames||[]).join(', ');
  form.elements.planningNote.value=recipe.planningNote||'';
  form.elements.servings.value=recipe.servings;
  form.elements.price.value=recipe.pricePerServingCzk??'';
  form.elements.meatType.value=recipe.meatType||'Kuřecí';
  form.elements.sideDish.value=recipe.sideDish||'';
  form.elements.preparationType.value=recipe.preparationType||'Zapečené';
  form.elements.status.value=recipe.status||'active';
  form.elements.availability.value=recipe.season.availability||'Celoročně';
  form.elements.recommended.value=recipe.season.recommendedDisplay||recipe.season.recommended.join('–')||'Podzim–zima';
  form.elements.months.value=recipe.season.months||'';
  form.elements.popularity.value=recipe.popularity??'';
  form.elements.lastServedAt.value=recipe.lastServedAt||'';
  updateRotationNote();
  document.querySelector('#editDialog').showModal();
}

function updateRotationNote(){
  const value=document.querySelector('#editForm').elements.popularity.value;
  document.querySelector('#rotationNote').textContent=value?`Oblíbenost ${value}: další zařazení bude možné za ${rotationByPopularity[value]} dní od posledního použití.`:'Rotační interval se vypočítá automaticky podle oblíbenosti.';
}

document.querySelector('#editButton').disabled=true;
BuiltinStorage.status(BuiltinStorage.label);
BuiltinStorage.load(DATA_URL,STORAGE_KEY).then(source=>{
  recipe=source;render();document.querySelector('#editButton').disabled=false;
}).catch(error=>BuiltinStorage.status(error.message,true));

document.querySelector('#editButton').addEventListener('click',openEditor);
document.querySelector('#closeEdit').addEventListener('click',()=>document.querySelector('#editDialog').close());
document.querySelector('#cancelEdit').addEventListener('click',()=>document.querySelector('#editDialog').close());
document.querySelector('#editForm').elements.popularity.addEventListener('change',updateRotationNote);
document.querySelector('#editForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const fields=event.currentTarget.elements;
  const popularity=fields.popularity.value?Number(fields.popularity.value):null;
  const saved={name:fields.name.value.trim(),description:fields.description.value.trim(),alternativeNames:fields.alternativeNames.value.split(',').map(value=>value.trim()).filter(Boolean),planningNote:fields.planningNote.value.trim(),servings:Number(fields.servings.value),pricePerServingCzk:fields.price.value===''?null:Number(fields.price.value),meatType:fields.meatType.value,sideDish:fields.sideDish.value.trim(),preparationType:fields.preparationType.value,status:fields.status.value,popularity,lastServedAt:fields.lastServedAt.value||null,history:recipe.history||[],rotationDays:rotationByPopularity[popularity]||null,season:{availability:fields.availability.value,recommendedDisplay:fields.recommended.value,recommended:fields.recommended.value.includes('–')?fields.recommended.value.split('–'):[fields.recommended.value],months:fields.months.value.trim()}};
  const form=event.currentTarget,button=form.querySelector('[type="submit"]');
  if(button.disabled)return;
  button.disabled=true;
  let errorNode=form.querySelector('[data-save-error]');
  if(!errorNode){errorNode=document.createElement('p');errorNode.dataset.saveError='';errorNode.setAttribute('role','alert');errorNode.style.color='#a21919';form.append(errorNode)}
  errorNode.textContent='';
  try{
    recipe=await BuiltinStorage.save(STORAGE_KEY,saved,recipe);
    render();document.querySelector('#editDialog').close();
    BuiltinStorage.status(BuiltinStorage.savedMessage);showToast(BuiltinStorage.savedMessage);
  }catch(error){errorNode.textContent=error.message;BuiltinStorage.status(error.message,true)}
  finally{button.disabled=false}

});
