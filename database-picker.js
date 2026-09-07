(()=>{
  if(new URLSearchParams(location.search).get('pick')!=='menu'||window.parent===window)return;
  document.body.classList.add('database-picker');
  document.querySelector('.detail-toolbar').hidden=true;
  document.querySelector('.database-heading h2').textContent='Vyberte náhradní jídlo';
  const results=document.getElementById('recipeResults');
  const path=href=>new URL(href,location.href).pathname;
  results.addEventListener('click',event=>{
    const card=event.target.closest('.recipe-card');
    if(!card)return;
    event.preventDefault();
    const recipe=recipes.find(item=>path(RecipeImports.href(item))===path(card.href));
    if(recipe)window.parent.postMessage({type:'menu-recipe-selected',recipeId:recipe.id},location.origin);
  });
  function labelCards(){
    for(const card of results.querySelectorAll('.recipe-card')){
      const label=card.querySelector('em');
      if(label&&label.textContent!=='Vybrat')label.textContent='Vybrat';
    }
  }
  new MutationObserver(labelCards).observe(results,{childList:true});
  labelCards();
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')window.parent.postMessage({type:'menu-picker-close'},location.origin);
  });
})();
