const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('rotation images and quick-info links resolve for imported and built-in recipes', async () => {
  const context = {
    window: {}, location: {hostname: 'example.test'}, navigator: {},
    localStorage: {getItem: () => null},
    fetch: async file => ({ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))})
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'recipe-imports.js'), 'utf8'), context);
  const api = context.window.RecipeImports;
  await api.ready;
  context.RecipeImports = api;
  const code = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const render = code.split('\n').find(line => line.includes('repeat.innerHTML=visible.length'));
  const imported = ['Čaj', 'Kakao', 'Káva bílá'].map(name => {
    const recipe = api.list().find(item => item.name === name);
    assert.ok(recipe, name);
    return recipe;
  });
  const builtin = JSON.parse(fs.readFileSync(path.join(root, 'Recepty/bramborova-kase/bramborova-kase.json'), 'utf8'));
  builtin._folder = 'bramborova-kase';
  for (const recipe of [...imported, builtin, {...imported[0], image: null}]) {
    context.visible = [{item: recipe, state: {label: 'Bez historie', detail: ''}}];
    context.repeat = {};
    vm.runInContext(render, context);
    const html = context.repeat.innerHTML;
    assert.ok(!html.includes('undefined'), recipe.name);
    const image = html.match(/<img src="([^"]+)"/);
    if (recipe.image) {
      assert.ok(image, recipe.name);
      assert.ok(fs.existsSync(path.join(root, image[1])), image[1]);
    } else {
      assert.equal(image, null);
    }
  }
  let click;
  context.document = {querySelector: () => ({addEventListener: (_name, handler) => {click = handler;}})};
  context.window.location = {};
  vm.runInContext(code.split('\n').find(line => line.startsWith("document.querySelector('#openRecipeFromInfo')")), context);
  for (const recipe of [...imported, builtin]) {
    context.selectedQuickRecipe = recipe;
    click();
    const target = context.window.location.href.split('?')[0];
    assert.ok(fs.existsSync(path.join(root, target)), target);
  }
});
