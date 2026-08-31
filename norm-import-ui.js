(()=>{
 'use strict';const $=id=>document.getElementById(id);let busy=false;
 async function builtins(){const index=await fetch('builtin-recipes.json?v=55');if(!index.ok)throw Error('Nelze ověřit existující normy; import se neuložil.');return index.json()}
 function report(results,rejected=[]){
  const counts={added:0,duplicate:0,conflict:0};results.forEach(r=>counts[r.state]++);
  $('normStatus').textContent=`Přidáno ${counts.added} · již existuje ${counts.duplicate} · konflikty ${counts.conflict} · nepřečteno ${rejected.length}`;
  const host=$('normResults');host.replaceChildren();
  for(const r of [...results,...rejected.map(r=>({...r,state:'rejected'}))]){
   const section=document.createElement('section');section.className='norm-result';
   const title=document.createElement('h3');title.textContent=r.name;section.append(title);
   const status=document.createElement('p');status.textContent=({added:'Uloženo do databáze.',duplicate:'Stejná norma už existuje; přeskočeno.',conflict:'Existuje norma se stejným názvem/variantou a jiným obsahem. Nepřepsáno.',rejected:r.reason})[r.state];section.append(status);
   if(r.warnings?.length){const ul=document.createElement('ul');for(const warning of r.warnings){const li=document.createElement('li');li.textContent=warning;ul.append(li)}section.append(ul)}
   if(r.id){const a=document.createElement('a');a.href='imported-recipe.html?id='+encodeURIComponent(r.id);a.textContent='Otevřít normu →';section.append(a)}host.append(section);
  }
 }
 async function importFile(file,restore=false){if(!file||busy)return;busy=true;$('docxFile').disabled=true;$('restoreFile').disabled=true;$('normStatus').textContent='Čtu soubor a kontroluji normy…';$('normResults').replaceChildren();
  try{await RecipeImports.ready;const existing=await builtins();if(restore){if(file.size>10*1024*1024)throw Error('Záloha smí mít nejvýše 10 MB.');report(await RecipeImports.restore(await file.text(),existing))}
   else {const parsed=await DocxNormParser.parseFile(file);await RecipeImports.setSourceFile(file);report(await RecipeImports.save(parsed.recipes,existing),parsed.rejected)}
  }catch(error){$('normStatus').textContent='Import se nepodařil: '+error.message}
  finally{$('diskStatus').textContent=RecipeImports.diskStatus();busy=false;$('docxFile').disabled=false;$('restoreFile').disabled=false;$('docxFile').value='';$('restoreFile').value=''}
 }
 $('docxFile').addEventListener('change',e=>importFile(e.target.files[0]));$('restoreFile').addEventListener('change',e=>importFile(e.target.files[0],true));
 $('backupNorms').addEventListener('click',()=>{try{const blob=new Blob([RecipeImports.backup()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='receptar-importovane-normy-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){$('normStatus').textContent=e.message}});

 $('saveDisk').addEventListener('click',async()=>{if(busy)return;busy=true;$('saveDisk').disabled=true;try{await RecipeImports.syncDisk();$('diskStatus').textContent=RecipeImports.diskStatus()}catch(e){$('diskStatus').textContent=e.message}finally{busy=false;$('saveDisk').disabled=false}});

 RecipeImports.ready.then(()=>{$('diskStatus').textContent=RecipeImports.diskStatus()}).catch(e=>{$('diskStatus').textContent=e.message;$('docxFile').disabled=true;$('restoreFile').disabled=true});
 if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
})();
