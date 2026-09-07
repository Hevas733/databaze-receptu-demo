const vm=require('node:vm');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../jidelniky.js','utf8');
let saved={version:1,revision:'',items:{}};
const history=[{date:'2026-01-01',meal:'Oběd',originalName:'Original',dietCode:'00',importId:'batch',sourceFile:'Leden.docx'}, {date:'2026-01-02',meal:'Oběd',originalName:'Original',dietCode:'00',importId:'batch',sourceFile:'Leden.docx'}];
const recipes=[{id:'a',name:'Original',pricePerServingCzk:10,nutritionPerServing:{energyKj:418.4,proteinG:5,fatG:1,carbohydratesG:9},menuHistory:history},{id:'b',name:'Replacement',pricePerServingCzk:20,nutritionPerServing:{energyKj:836.8,proteinG:10,fatG:2,carbohydratesG:18},menuHistory:[]}];
const draft={version:1,importId:'batch',fileName:'Leden.docx',rows:[{recipeId:'',occurrences:[{date:'2026-01-01',meal:'Večeře',originalName:'Unmatched',dietCode:'00'}]}]};
const webStorage=new Map();
async function launch(web=false){
 const nodes={};
 function node(id){return nodes[id]??=( {id,value:id==='periodFilter'?'all':'',innerHTML:'',textContent:'',events:{},disabled:false,open:false,src:'',contentWindow:{},addEventListener(type,fn){this.events[type]=fn},getAttribute(key){return this[key]},showModal(){this.open=true},close(){this.open=false;this.events.close?.()},focus(){},querySelector(){return {focus(){}}}} )}
 const win={events:{},addEventListener(type,fn){this.events[type]=fn}};
 const fetch=async(url,options={})=>{
  let data;
  if(url==='builtin-recipes.json')data=recipes;
  else if(url==='imported-index.json')data={recipes:[]};
  else if(url.startsWith('Recepty/'))data=recipes.find(r=>url.includes('/'+r.id+'/'));
  else if(url==='__menu_import')data={recipes,imports:[{id:'batch',sourceFile:'Leden.docx'}]};
  else if(url==='__menu_replacements'){
   if(options.method==='POST'){const body=JSON.parse(options.body);assert.equal(body.baseRevision,saved.revision);saved={version:1,revision:String(Number(saved.revision)+1),items:{...saved.items,[JSON.stringify(body.target)]:{target:body.target,recipeId:body.recipeId,recipeName:'Replacement'}}}}
   data=saved;
  }else throw Error(url);
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>structuredClone(data)};
 };
 vm.runInNewContext(source,{document:{getElementById:node},window:win,location:{origin:'http://local',hostname:web?'example.github.io':'127.0.0.1'},crypto:require('node:crypto').webcrypto,localStorage:{getItem:key=>key.includes('draft')?JSON.stringify(draft):webStorage.get(key)||null,setItem:(key,value)=>webStorage.set(key,value)},fetch,Intl,Date,console});
 for(let count=0;count<30;count++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(nodes.menuDays.innerHTML.includes('week-2025-12-29'),nodes.menusStatus.textContent);
 return {nodes,win};
}
function open(ui,index){const button={dataset:{replaceIndex:String(index)},focus(){}};ui.nodes.menuDays.events.click({target:{closest:selector=>selector==='[data-replace-index]'?button:null}});assert.ok(ui.nodes.recipePicker.open);assert.match(ui.nodes.pickerFrame.src,/pick=menu/)}
async function choose(ui){ui.win.events.message({origin:'http://wrong',source:ui.nodes.pickerFrame.contentWindow,data:{type:'menu-recipe-selected',recipeId:'b'}});assert.ok(ui.nodes.pickerSave.disabled);ui.win.events.message({origin:'http://local',source:ui.nodes.pickerFrame.contentWindow,data:{type:'menu-recipe-selected',recipeId:'b'}});assert.equal(ui.nodes.pickerSave.disabled,false);await ui.nodes.pickerSave.events.click();assert.equal(ui.nodes.recipePicker.open,false)}
(async()=>{
 let ui=await launch();assert.match(ui.nodes.menuDays.innerHTML,/aria-expanded="false"/);
 open(ui,0);await choose(ui);
 assert.match(ui.nodes.menuDays.innerHTML,/Původně: Original/);
 assert.match(ui.nodes.menuDays.innerHTML,/20,00/);
 assert.match(ui.nodes.menuDays.innerHTML,/10,00/); // second day unchanged
 ui=await launch();assert.match(ui.nodes.menuDays.innerHTML,/Původně: Original/);
 open(ui,2);await choose(ui); // unmatched draft item
 ui=await launch();assert.match(ui.nodes.menuDays.innerHTML,/Původně: Unmatched/);
 assert.match(ui.nodes.menuDays.innerHTML,/40,00/); // both meals on first day
 assert.equal(Object.keys(saved.items).length,2);
 ui=await launch(true);open(ui,0);await choose(ui);
 assert.match(ui.nodes.menusStatus.textContent,/v tomto prohlížeči/);
 ui=await launch(true);assert.match(ui.nodes.menuDays.innerHTML,/Původně: Original/);
 console.log('PASS: modal selection, origin checks, persistence, unmatched item, daily totals and other-day isolation');
})().catch(error=>{console.error(error);process.exitCode=1});
