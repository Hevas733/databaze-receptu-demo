window.DocxNormParser=(()=>{
 'use strict';
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',norm=RecipeImports.norm;
 const children=(el,name)=>Array.from(el.children).filter(x=>x.namespaceURI===W&&x.localName===name);
 const txt=el=>Array.from(el.getElementsByTagNameNS(W,'t')).map(x=>x.textContent).join('').trim();
 function number(s){s=String(s).trim();if(/^(?:[—–-]|)$/u.test(s))return null;s=s.replace(/[\s\u00a0\u202f]/g,'');if(!/^\d+(?:[.,]\d+)?$/.test(s))throw Error('Nečitelné číslo: '+s);const n=Number(s.replace(',','.'));if(!Number.isFinite(n))throw Error('Příliš velké číslo.');return n}
 const fmt=n=>Number(n.toFixed(6)).toLocaleString('cs-CZ',{maximumFractionDigits:6});
 const fields={'energie kj':'energyKj','bilkoviny g':'proteinG','tuky g':'fatG','sacharidy g':'carbohydratesG','vlak nina g':'fiberG','vlaknina g':'fiberG','ca mg':'calciumMg','fe mg':'ironMg','a g':'vitaminAUg','a ug':'vitaminAUg','b1 mg':'vitaminB1Mg','b2 mg':'vitaminB2Mg','c mg':'vitaminCMg'};
 function nutrient(label){if(/^A\s*\[(?:µ|μ|u)g\]$/i.test(label))return 'vitaminAUg';return fields[norm(label)]||null}
 async function hash(s){const bytes=new TextEncoder().encode(s);const value=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(value)).map(x=>x.toString(16).padStart(2,'0')).join('')}
 async function parseXml(xml,fileName){
  if(xml.length>8000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Dokument je příliš velký nebo obsahuje nepodporované XML.');
  const dom=new DOMParser().parseFromString(xml,'application/xml');if(dom.querySelector('parsererror'))throw Error('Poškozené XML dokumentu.');
  const body=dom.getElementsByTagNameNS(W,'body')[0];if(!body)throw Error('Soubor neobsahuje dokument Word.');
  const blocks=Array.from(body.children),records=[],rejected=[];let lastTitle='',diet='',current=null,mode='',nutritionBasis=false;
  function finish(){if(!current)return;if(!current.ingredients.length)current.errors.push('Chybí tabulka surovin.');if(current.errors.length)rejected.push({name:current.name,reason:current.errors.join(' ')});else records.push(current);current=null;}
  for(const block of blocks){
   if(block.localName==='p'){
    const t=txt(block);if(!t)continue;
    if(/^Diety\s*:/i.test(t)){diet=t.replace(/^Diety\s*:\s*/i,'');continue;}
    const servings=t.match(/^Norma\s+na\s+(\d+)\s+porc[ií]\s*$/i);
    if(servings){finish();current={name:lastTitle,sourceVariant:diet,servings:Number(servings[1]),ingredients:[],nutritionPerServing:{},importWarnings:[],errors:[]};if(!lastTitle||current.servings<1||current.servings>100000)current.errors.push('Chybí název nebo platný počet porcí.');diet='';mode='ingredients';nutritionBasis=false;continue;}
    if(/^Nutriční\s+hodnoty/i.test(t)){mode='nutrition';nutritionBasis=/^Nutriční\s+hodnoty\s+na\s+1\s+porci\s*$/i.test(t);if(current&&!nutritionBasis)current.errors.push('Neznámý základ výživy: '+t);continue;}
    if(current&&mode==='ingredients')current.errors.push('Neočekávaný text před tabulkou surovin: '+t);
    lastTitle=t;
   }else if(block.localName==='tbl'){
    if(!current)continue;
    const rows=children(block,'tr').map(row=>children(row,'tc').map(txt));
    try{
     if(mode==='ingredients'){
      if(current.ingredients.length)throw Error('Více tabulek surovin bez nové hlavičky normy.');
      if(norm(rows[0]?.[0])!=='surovina'||norm(rows[0]?.[1])!=='mnozstvi'||rows[0].length!==2)throw Error('Očekávána tabulka Surovina / Množství.');
      for(const row of rows.slice(1)){
       if(row.every(x=>!x))continue;if(row.length!==2||!row[0])throw Error('Neúplný řádek surovin.');
       const m=row[1].match(/^(.+?)\s*(kg|g|ml|l|ks)\s*$/i);if(!m)throw Error('Neznámé množství nebo jednotka: '+row.join(' / '));
       const amount=number(m[1]),unit=m[2].toLowerCase();if(amount===null)throw Error('Chybějící množství: '+row[0]);
       const n=amount/current.servings*(unit==='kg'||unit==='l'?1000:1);
       current.ingredients.push({name:row[0],amount,unit,perServing:unit==='ks'?null:fmt(n)+' '+({kg:'g',l:'ml'}[unit]||unit),needsClarification:unit==='ks'});
      }
      mode='afterIngredients';
     }else if(mode==='nutrition'){
      if(!nutritionBasis)throw Error('Nelze určit základ nutriční tabulky.');
      for(const row of rows){if(row.length%2!==0)throw Error('Neúplná nutriční tabulka.');for(let i=0;i<row.length;i+=2){
       const field=nutrient(row[i]);if(field){if(Object.hasOwn(current.nutritionPerServing,field))throw Error('Duplicitní výživový údaj: '+row[i]);current.nutritionPerServing[field]=number(row[i+1]);}
       else if(row[i])current.importWarnings.push('Nepřiřazený údaj zdroje: '+row[i]+' = '+row[i+1]+'.');
      }}mode='afterNutrition';
     }else throw Error('Tabulka bez rozpoznané hlavičky.');
    }catch(e){current.errors.push(e.message)}
   }
  }finish();if(!records.length&&!rejected.length)throw Error('Nenalezena žádná norma. Podporovaný DOCX má název, Diety, Norma na N porcí, tabulku Surovina / Množství a volitelnou výživu na 1 porci.');
  if(records.length+rejected.length>500)throw Error('Nejvýše 500 norem v jednom souboru.');
  const output=[];
  for(const r of records){
   r.id='docx-'+(await hash(RecipeImports.identity(r))).slice(0,24);
   r.source='DOCX';r.sourceFile=fileName;r.importedAt=new Date().toISOString();
   r.importWarnings.unshift('Cena a alergeny nejsou v tomto formátu uvedeny; nejsou doplněny odhadem.');
   const units=r.ingredients.filter(i=>i.needsClarification).map(i=>i.name);if(units.length)r.importWarnings.push('Upřesnit velikost balení / jednotku ks: '+units.join(', ')+'.');
   for(const k of ['energyKj','proteinG','fatG','carbohydratesG','fiberG'])if(r.nutritionPerServing[k]==null)r.importWarnings.push('Chybí '+({energyKj:'energie',proteinG:'bílkoviny',fatG:'tuky',carbohydratesG:'sacharidy',fiberG:'vláknina'}[k])+'.');
   if(r.nutritionPerServing.energyKj!=null)r.nutritionPerServing.energyKcalApprox=Math.round(r.nutritionPerServing.energyKj/4.184);
   // Compare core source values, independently of derived kcal.
   const similar=records.find(other=>other!==r&&['energyKj','proteinG','fatG','carbohydratesG','fiberG'].every(k=>other.nutritionPerServing[k]===r.nutritionPerServing[k])&&r.nutritionPerServing.energyKj!=null&&JSON.stringify(other.ingredients)!==JSON.stringify(r.ingredients));
   if(similar)r.importWarnings.push('Shodná základní výživa s normou „'+similar.name+'“, ale jiné suroviny. Ověřte zdroj.');
   r.planningNote=r.importWarnings.join('\n');r.nutritionReview='Přepis DOCX na 1 porci, bez nezávislého ověření. Prázdné údaje nejsou nuly. Kcal dopočteny z kJ / 4,184.';
   output.push(RecipeImports.clean(r));
  }
  return {recipes:output,rejected};
 }
 async function parseFile(file){
  if(!/\.docx$/i.test(file.name))throw Error('Vyberte soubor .docx.');if(file.size>20*1024*1024)throw Error('DOCX smí mít nejvýše 20 MB.');
  const buffer=await file.arrayBuffer();const bytes=new Uint8Array(buffer);if(bytes[0]!==80||bytes[1]!==75)throw Error('Soubor není platný DOCX.');
  // Check declared ZIP expansion sizes before decompressing (zip bombs).
  const view=new DataView(buffer);let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('Poškozený archiv DOCX.');const count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),total=0;
  if(count>3000)throw Error('DOCX obsahuje příliš mnoho souborů.');
  for(let i=0;i<count;i++){if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('Poškozená struktura ZIP.');total+=view.getUint32(pos+24,true);if(total>60*1024*1024)throw Error('Rozbalený DOCX je příliš velký.');pos+=46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);}
  const zip=await JSZip.loadAsync(buffer),entry=zip.file('word/document.xml');if(!entry)throw Error('Chybí obsah dokumentu Word.');return parseXml(await entry.async('string'),file.name);
 }
 return {parseFile,parseXml,number};
})();
