/* Only embedded details report confirmed saves to their owning menu. */
(()=>{
 'use strict';
 const params=new URLSearchParams(location.search);
 if(params.get('embedded')!=='menu'||window.parent===window)return;
 const id=params.get('id'),form=document.getElementById('recipeEdit'),dialog=document.getElementById('editDialog');
 let baseline=null,saving=false;
 const formValue=()=>new URLSearchParams(new FormData(form)).toString();
 const state=()=>({dirty:dialog.open&&baseline!==null&&formValue()!==baseline,saving});
 const send=data=>parent.postMessage({...data,id},location.origin);
 const sendState=()=>send({type:'menu-norm-state',...state()});
 window.MenuNormEditorState=state;
 window.MenuNormEditorBridge={
  beginSave(){saving=true;sendState()},
  saved(recipe){
   if(document.getElementById('saveStatus').classList.contains('is-warning'))throw Error(document.getElementById('saveStatus').textContent);
   baseline=formValue();
   const {name,ingredients,servings,mealTypes,alternativeNames,nutritionPerServing,pricePerServingCzk}=recipe;
   send({type:'menu-norm-saved',recipe:{id,name,ingredients,servings,mealTypes,alternativeNames,nutritionPerServing,pricePerServingCzk}});
  },
  endSave(){saving=false;sendState()}
 };
 new MutationObserver(()=>{if(dialog.open&&baseline===null)baseline=formValue();if(!dialog.open)baseline=null;sendState()}).observe(dialog,{attributes:true,attributeFilter:['open']});
 form.addEventListener('input',sendState);form.addEventListener('change',sendState);
 const back=document.querySelector('.back-link'),button=document.createElement('button');
 button.type='button';button.className='secondary-button';button.textContent='Zavřít normu';button.addEventListener('click',()=>send({type:'menu-norm-close'}));back.replaceWith(button);
 document.body.classList.add('embedded-menu-norm');
 const style=document.createElement('style');style.textContent='.embedded-menu-norm .recipe-detail{max-width:100%;padding:18px}.embedded-menu-norm .detail-toolbar{flex-wrap:wrap}.embedded-menu-norm #heroImage{max-height:180px}.embedded-menu-norm .detail-hero{padding:18px}@media(max-width:650px){.embedded-menu-norm .recipe-detail{padding:12px}}';document.head.append(style);
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialog.open){event.preventDefault();send({type:'menu-norm-close'})}});
 const ready=new MutationObserver(()=>{if(!document.getElementById('editButton').disabled){sendState();ready.disconnect()}});
 ready.observe(document.getElementById('editButton'),{attributes:true,attributeFilter:['disabled']});
})();
