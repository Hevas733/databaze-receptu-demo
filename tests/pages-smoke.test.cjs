const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),base='https://presentation.test/databaze-receptu-demo/';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1500,height:1050}}),errors=[],missing=[],writes=[];
  await context.route('**/*',async route=>{
   const request=route.request();
   if(request.method()!=='GET'){writes.push(request.url());return route.abort()}
   if(!request.url().startsWith(base))throw Error('Unexpected URL: '+request.url());
   const relative=decodeURIComponent(new URL(request.url()).pathname.slice('/databaze-receptu-demo/'.length))||'index.html';
   const file=path.resolve(root,relative);
   assert.ok(file.startsWith(root+path.sep));
   if(!fs.existsSync(file)){missing.push(relative);return route.fulfill({status:404,body:'Not found'})}
   await route.fulfill({path:file,contentType:mime[path.extname(file)]||'application/octet-stream'});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'jidelniky.html');await page.waitForSelector('.day-toggle');
  const registry=JSON.parse(fs.readFileSync(path.join(root,'menu-imports.json'))).imports;
  assert.equal(await page.locator('#importFilter option').count(),registry.length);
  await page.selectOption('#importFilter',registry.find(item=>item.sourceFile==='Leden 2026.docx').id);
  assert.equal(await page.locator('.day-toggle').count(),31);
  assert.equal(await page.locator('[data-menu-item-index]').count(),466);
  await page.locator('.day-toggle').first().click();
  const item=page.locator('[data-menu-item-index]:visible').first(),normURL=await item.getAttribute('data-norm-href');
  await item.click();const frame=page.frameLocator('#menuNormFrame');
  await frame.locator('#editButton:enabled').waitFor();
  await frame.locator('#editButton').click();await frame.locator('[name=price]').fill('1.23');
  await frame.locator('#recipeEdit [type=submit]').click();await frame.locator('#editDialog').waitFor({state:'hidden'});
  await page.locator('#menuNormClose').click();
  assert.match(await page.locator('.meal-block li:visible').first().innerText(),/1,23/);
  await page.reload();await page.waitForSelector('.day-toggle');await page.selectOption('#importFilter',registry[0].id);await page.locator('.day-toggle').first().click();
  assert.match(await page.locator('.meal-block li:visible').first().innerText(),/1,23/);
  await page.locator('[data-menu-item-index]:visible').first().click();await frame.locator('#editButton:enabled').waitFor();
  await page.locator('#menuNormReplace').click();const picker=page.frameLocator('#pickerFrame');
  await picker.locator('body').waitFor();
  const replacement='bramborova-kase';
  await picker.locator('body').evaluate((node,id)=>parent.postMessage({type:'menu-recipe-selected',recipeId:id},location.origin),replacement);
  await page.locator('#pickerSave:enabled').click();await page.locator('#recipePicker').waitFor({state:'hidden'});
  await frame.locator('#recipeName').filter({hasText:'Bramborová kaše'}).waitFor();await page.locator('#menuNormClose').click();
  await page.reload();await page.waitForSelector('.day-toggle');await page.selectOption('#importFilter',registry[0].id);await page.locator('.day-toggle').first().click();
  assert.match(await page.locator('[data-menu-item-index]:visible').first().innerText(),/Bramborová kaše/);
  await page.goto(base+'import-jidelniku.html');await page.locator('#menuStorageStatus').filter({hasText:'Webová verze:'}).waitFor();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('receptar:menu-history:v1')));
  assert.equal(stored.imports.length,registry.length);assert.equal(stored.events.length,registry.reduce((n,item)=>n+item.saved,0));assert.ok(Object.keys(stored.aliases).length>0);
  await page.locator('#menuText').fill('2026-03-01; Oběd; Bramborová kaše');
  await page.locator('#analyzeMenuText').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('receptar:menu-history:v1')).events.some(event=>event.date==='2026-03-01'));
  const count=await page.evaluate(()=>JSON.parse(localStorage.getItem('receptar:menu-history:v1')).events.length);
  await page.locator('#analyzeMenuText:enabled').click();
  await page.locator('#analyzeMenuText:enabled').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('receptar:menu-history:v1')).events.length),count);
  await page.goto(base+'index.html');await page.waitForFunction(()=>typeof RecipeImports!=='undefined'&&document.querySelectorAll('.dish').length>0);
  await page.goto(base+'databaze.html');await page.waitForFunction(()=>typeof RecipeImports!=='undefined'&&document.querySelectorAll('a[href*="recipe-detail"]').length>0);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(missing,[]);
  console.log(JSON.stringify({passed:true,menus:registry.length,events:stored.events.length,popupEditPersists:true,replacementPersists:true,staticSubpath:true,externalWrites:0}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
