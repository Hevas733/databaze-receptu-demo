const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const script=fs.readFileSync(path.join(__dirname,'../builtin-storage.js'),'utf8');
function client(local=true,items=new Map(),fetcher=async()=>{throw Error('offline')}){
 const context={window:{},location:{hostname:local?'127.0.0.1':'hevas733.github.io'},localStorage:{getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v)},crypto:webcrypto,TextEncoder,AbortSignal,fetch:fetcher};
 vm.runInNewContext(script,context);return context.window.BuiltinStorage;
}
const response=data=>({ok:true,json:async()=>data});
const disk=(recipe,revision='abc',overlayHash=null)=>response({storage:'builtin-disk-v1',recipe,revision,overlayHash});
test('local save sends only allowed fields and never rewrites browser overlays',async()=>{
 const items=new Map([['receptar:test','original']]);let body;
 const api=client(true,items,async(url,options)=>{body=JSON.parse(options.body);return disk({id:'test',name:'New'},'def')});
 const result=await api.save('receptar:test',{name:'New',history:[],ingredients:[],rotationDays:999},{_diskRevision:'abc'});
 assert.equal(body.baseRevision,'abc');assert.deepEqual(body.patch,{name:'New'});assert.equal(result._diskRevision,'def');assert.equal(items.get('receptar:test'),'original');
});
test('offline and stale saves reject without a browser-only fallback',async()=>{
 const items=new Map();const api=client(true,items);
 await assert.rejects(()=>api.save('receptar:test',{name:'X'},{_diskRevision:'abc'}),/nebyly uloženy/);
 assert.equal(items.size,0);
 const conflict=client(true,items,async()=>({ok:false,json:async()=>({error:'Konflikt'})}));
 await assert.rejects(()=>conflict.save('receptar:test',{name:'X'},{_diskRevision:'abc'}),/Konflikt/);
});
test('local load ignores only a reviewed overlay; unknown overlays block explicitly',async()=>{
 const overlay='{"name":"Old browser"}',items=new Map([['receptar:test',overlay]]);
 const hash=require('node:crypto').createHash('sha256').update(overlay).digest('hex');
 const approved=client(true,items,async()=>disk({name:'Current disk'},'abc',hash));
 assert.equal((await approved.load('test.json','receptar:test')).name,'Current disk');
 const unapproved=client(true,items,async()=>disk({name:'Current disk'}));
 await assert.rejects(()=>unapproved.load('test.json','receptar:test'),/nepřevedené změny/);
});
test('static GitHub Pages loads and saves overlays without a disk endpoint',async()=>{
 const items=new Map([['receptar:test',JSON.stringify({name:'Browser',planningNote:'Keep',season:{months:'Leden'}})]]);
 const api=client(false,items,async url=>{assert.equal(url,'test.json');return response({name:'Disk',season:{availability:'Celoročně'}})});
 const base=await api.load('test.json','receptar:test');assert.equal(base.name,'Browser');
 await api.save('receptar:test',{name:'Changed'},base);
 const reload=await api.load('test.json','receptar:test');assert.equal(reload.name,'Changed');assert.equal(reload.planningNote,'Keep');assert.equal(reload.season.availability,'Celoročně');
 assert.match(api.savedMessage,/pouze v tomto prohlížeči/);
});
test('static quota error is propagated, not reported as success',async()=>{
 const context={window:{},location:{hostname:'hevas733.github.io'},localStorage:{getItem:()=>null,setItem:()=>{throw Error('Quota exceeded')}},AbortSignal};
 vm.runInNewContext(script,context);
 await assert.rejects(()=>context.window.BuiltinStorage.save('receptar:test',{name:'X'},{season:{}}),/Quota/);
});
