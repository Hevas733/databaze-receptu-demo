/* Norm details and replacement stay in dialogs above the menu. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),dialog=$('menuNormEditor'),frame=$('menuNormFrame'),status=$('menuNormStatus'),close=$('menuNormClose'),replace=$('menuNormReplace');
 let sourceButton=null,target=null,scrollY=0,editorState={dirty:false,saving:false},savedNotice=false;
 function showIssues(){
  const issues=$('menuNormIssues');
  issues.textContent=document.querySelector('[data-menu-item-index="'+target?.index+'"]')?.dataset.normIssues||'';
  issues.hidden=!issues.textContent;
 }
 function state(){
  try{return frame.hidden?editorState:frame.contentWindow.MenuNormEditorState?.()||editorState}catch{return editorState}
 }
 function canLeave(question){
  const current=state();
  if(current.saving){status.textContent='Probíhá ukládání. Počkejte na dokončení.';return false}
  return !current.dirty||confirm(question);
 }
 function closeEditor(){
  if(canLeave('Zavřít normu a zahodit neuložené změny?'))dialog.close();
 }
 function showRecipe(href,name){
  showIssues();
  editorState={dirty:false,saving:false};savedNotice=false;close.disabled=false;replace.disabled=false;
  $('menuNormTitle').textContent=name||'Norma položky';
  const url=href?new URL(href,location.href):null;
  const valid=url&&url.origin===location.origin&&url.pathname.endsWith('/recipe-detail.html')&&/^[a-z0-9-]+$/.test(url.searchParams.get('id')||'');
  target.id=valid?url.searchParams.get('id'):null;target.href=valid?url.href:'';
  frame.hidden=!valid;$('menuNormMissing').hidden=!!valid;
  if(!valid){frame.removeAttribute('src');status.textContent='Položka nemá dostupnou přiřazenou normu.';return}
  status.textContent='Načítám normu…';url.searchParams.set('embedded','menu');url.searchParams.set('v','148');frame.src=url.href;
 }
 $('menuDays').addEventListener('click',event=>{
  const button=event.target.closest('[data-menu-item-index],.meal-info-toggle[data-info-index]');
  if(!button||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const nameButton=button.matches('[data-menu-item-index]')?button:button.closest('li').querySelector('[data-menu-item-index]');
  if(!nameButton)return;
  event.preventDefault();event.stopPropagation();
  sourceButton=button;scrollY=window.scrollY;target={index:nameButton.dataset.menuItemIndex};
  showRecipe(nameButton.dataset.normHref,nameButton.dataset.normName||nameButton.textContent.trim());
  dialog.showModal();document.body.classList.add('menu-norm-editor-open');
 },true);
 replace.addEventListener('click',()=>{
  if(!target||!canLeave('Nahradit normu a zahodit neuložené změny?'))return;
  if(state().dirty)showRecipe(target.href,$('menuNormTitle').textContent);
  document.dispatchEvent(new CustomEvent('menu-norm-replace',{detail:{index:target.index}}));
 });
 document.addEventListener('menu-item-replaced',event=>{
  if(!dialog.open||!target||String(event.detail.index)!==target.index)return;
  showRecipe(event.detail.href,event.detail.name);
 });
 close.addEventListener('click',closeEditor);
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor()});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeEditor()});
 dialog.addEventListener('close',()=>{
  // A queued close may arrive after another norm has already reopened the dialog.
  if(dialog.open)return;
  const index=target?.index;document.body.classList.remove('menu-norm-editor-open');
  frame.removeAttribute('src');target=null;editorState={dirty:false,saving:false};close.disabled=false;replace.disabled=false;
  const focus=sourceButton?.isConnected?sourceButton:document.querySelector('[data-menu-item-index="'+index+'"]');
  focus?.focus({preventScroll:true});window.scrollTo({top:scrollY,behavior:'instant'});sourceButton=null;
 });
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||!dialog.open||!target?.id||event.data?.id!==target.id)return;
  if(event.data.type==='menu-norm-close'){closeEditor();return}
  if(event.data.type==='menu-norm-state'){
   editorState={dirty:!!event.data.dirty,saving:!!event.data.saving};close.disabled=editorState.saving;replace.disabled=editorState.saving;
   status.textContent=editorState.saving?'Ukládám změny…':editorState.dirty?'Neuložené změny — v normě stiskněte Uložit.':savedNotice?'Změny uloženy. Denní součty a značky jsou aktualizované.':'Normu můžete upravit nebo tlačítkem Nahradit vybrat jinou pro tuto položku.';return;
  }
  if(event.data.type!=='menu-norm-saved'||!event.data.recipe||event.data.recipe.id!==target.id)return;
  savedNotice=true;$('menuNormTitle').textContent=event.data.recipe.name;
  document.dispatchEvent(new CustomEvent('menu-norm-updated',{detail:event.data.recipe}));
  showIssues();
  status.textContent='Změny uloženy. Denní součty a značky jsou aktualizované.';
 });
})();

