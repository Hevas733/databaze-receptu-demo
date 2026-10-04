/* Shared rules for parsing a menu and validating its proposed recipe. */
globalThis.MenuImportRules = (() => {
  'use strict';
  const VERSION = 3;
  const key = value => String(value || '').toLocaleLowerCase('cs-CZ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\bl00\b/g, '100').replace(/[^a-z0-9]+/g, ' ').trim();
  const size = value => (key(value).match(/\b(mala|velka)\b/) || [])[1] || '';
  function quantities(value) {
    return [...String(value || '').toLowerCase().replace(/\bl00\b/g, '100').matchAll(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|ks)\b/g)].map(match => {
      const unit = match[2], amount = Number(match[1].replace(',', '.'));
      return `${amount * (unit === 'kg' || unit === 'l' ? 1000 : 1)}${unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit}`;
    }).sort().join('|');
  }
  function portionWarning(source, target) {
    const a = size(source), b = size(target);
    if (a !== b && (a || b)) return a && b ? 'Jiná velikost porce.' : 'Velikost porce není ověřená na obou stranách.';
    const aq = quantities(source), bq = quantities(target);
    if (aq !== bq) return aq && bq ? `Jiné množství: ${aq} → ${bq}.` : 'Množství nebo gramáž není ověřená na obou stranách.';
    return '';
  }
  function consistencyWarning(recipe) {
    if (recipe.ingredients?.length !== 1 || !(recipe.servings > 0)) return '';
    const declared = quantities(recipe.name);
    const ingredient = recipe.ingredients[0];
    if (!declared || !['kg', 'g', 'l', 'ml'].includes(ingredient.unit) || !(ingredient.amount > 0)) return '';
    const unit = ingredient.unit === 'kg' ? 'g' : ingredient.unit === 'l' ? 'ml' : ingredient.unit;
    const actual = ingredient.amount * (['kg', 'l'].includes(ingredient.unit) ? 1000 : 1) / recipe.servings;
    const expected = declared.match(/^(\d+(?:\.\d+)?)(g|ml)$/);
    if (expected && expected[2] === unit && Math.abs(Number(expected[1]) - actual) > .01) return `Rozpor v normě: název uvádí ${expected[1]} ${unit}, suroviny odpovídají ${actual.toLocaleString('cs-CZ')} ${unit} na porci. Ověřte normu před potvrzením.`;
    return '';
  }
  const families = [
    [/\bveprov/, /\bkurec|\bkure\b/, /\bhovez/, /\bkruti/, /\bdrubez/],
    [/\bhermelin\b/, /\bcihla\b/, /\btaven/, /\blucina\b/, /\bgervais\b/],
    [/\btatarsk/, /\bkoprov/, /\brajsk/],
    [/\bokurkov/, /\bmrkvov/, /\bledov/, /\bcoleslaw\b/],
    [/\bpomazankov/, /\brostlinn/, /\bcerstve\b/],
    [/\bkrupicov/, /\bkminov/],
    [/\bmakovka\b/, /\bzavin\b/, /\bcroissant\b/],
    [/\btlacenka\b/, /\bpastika\b/],
    [/\brizoto\b/, /\bsendvic\b/],
    [/\bsunkovy knedlik\b/, /\balpsky knedlik\b/]
  ];
  function incompatible(source, target) {
    const a = key(source), b = key(target);
    return families.some(family => { const aa = family.map((pattern, i) => pattern.test(a) ? i : -1).filter(i => i >= 0), bb = family.map((pattern, i) => pattern.test(b) ? i : -1).filter(i => i >= 0); return aa.length && bb.length && !aa.some(i => bb.includes(i)); });
  }
  function variantWarning(source, target) {
    const bare = value => key(String(value).replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ks)\b/gi, ''));
    const a = bare(source), b = bare(target);
    const numbered = value => (value.match(/\b\d+\b/g) || []).join('|');
    if (numbered(a) !== numbered(b)) return 'Číslo varianty normy se liší nebo chybí.';
    for (const marker of ['mastene', 'mr', 'smazene', 'zapecene', 'svickova', 's houb', 's brokolici', 's nudlemi', 's ryzi', 's kapanim']) {
      if (new RegExp('\\b' + marker + '\\b').test(a) !== new RegExp('\\b' + marker + '\\b').test(b)) return 'Úprava nebo varianta jídla není shodná; ověřte přiřazení.';
    }
    return '';
  }
  function assignmentWarning(source, recipe) {
    return consistencyWarning(recipe) || (incompatible(source, recipe.name) ? 'Jiný druh jídla nebo suroviny; vyberte odpovídající normu.' : '') || portionWarning(source, recipe.name) || variantWarning(source, recipe.name);
  }
  function blockingWarning(source, recipe) {
    const a = quantities(source), b = quantities(recipe.name), sa = size(source), sb = size(recipe.name);
    return consistencyWarning(recipe) || (incompatible(source, recipe.name) ? 'Jiný druh jídla nebo suroviny.' : '') || (a && b && a !== b ? 'Množství v jídelníčku a normě se liší.' : '') || (sa && sb && sa !== sb ? 'Malá a velká porce nejsou stejná norma.' : '');
  }
  const content = value => key(String(value).replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|ks)\b/gi, '')).split(' ').filter(word => word.length > 1 && !['se', 's', 'a', 'na', 've', 'porce', 'mala', 'velka'].includes(word) && !/^\d+$/.test(word));
  function similarity(source, target) {
    const a = new Set(content(source)), b = new Set(content(target));
    return [...a].filter(word => b.has(word)).length / Math.max(a.size, b.size, 1);
  }
  function bestMatch(source, catalog, aliases = {}) {
    const empty = (warning = '', candidates = []) => ({ recipe: null, recipeId: '', score: 0, kind: 'unmatched', warning, candidates });
    const exact = catalog.filter(recipe => key(recipe.name) === key(source));
    if (exact.length > 1) return empty('Stejný název má více norem; vyberte konkrétní normu.', exact);
    const explicit = exact.length ? exact : catalog.filter(recipe => recipe.id === aliases[key(source)] || (recipe.alternativeNames || []).some(label => key(label) === key(source)));
    if (explicit.length > 1) return empty('Alternativní název patří více normám; vyberte konkrétní normu.', explicit);
    if (explicit.length === 1) {
      const recipe = explicit[0], warning = assignmentWarning(source, recipe);
      if (blockingWarning(source, recipe)) return empty(blockingWarning(source, recipe));
      return { recipe, recipeId: recipe.id, score: 1, kind: warning ? 'possible' : 'strong', warning, candidates: explicit };
    }
    const ranked = catalog.filter(recipe => !blockingWarning(source, recipe)).map(recipe => ({ recipe, score: Math.max(...[recipe.name, ...(recipe.alternativeNames || [])].map(label => similarity(source, label))) })).sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, 'cs'));
    const first = ranked[0], second = ranked[1];
    if (!first || first.score < .86) return empty('Nenalezena dostatečně přesná shoda. Vyberte normu ručně.');
    if (second && first.score - second.score < .09) return empty('Více podobných norem; vyberte konkrétní normu.', ranked.slice(0, 5).map(item => item.recipe));
    return { ...first, recipeId: first.recipe.id, kind: 'possible', warning: assignmentWarning(source, first.recipe) || 'Podobný název není potvrzená shoda; ověřte normu.', candidates: [first.recipe] };
  }
  function splitItems(value, catalog = []) {
    const text = String(value || ''), parts = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (![',', ';', '\n', '\r'].includes(text[i])) continue;
      if (text[i] === ',' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '')) continue;
      const part = text.slice(start, i).trim(); if (part) parts.push(part); start = i + 1;
    }
    const last = text.slice(start).trim(); if (last) parts.push(last);
    const result = [];
    for (let i = 0; i < parts.length; i++) {
      let item = parts[i];
      for (let end = parts.length - 1; end > i; end--) {
        const combined = parts.slice(i, end + 1).join(', ');
        if (catalog.some(recipe => [recipe.name, ...(recipe.alternativeNames || [])].some(label => key(label) === key(combined)))) { item = combined; i = end; break; }
      }
      if (result.length && /^(?:zeleninou|syrem|masem|brokolici|houbami|zampiony|porkem|cibulkou|ryzi|bramborami)\b/.test(key(item)) && /\bs\b/.test(key(result.at(-1)))) result[result.length - 1] += ', ' + item;
      else if (key(item).length > 1) result.push(item);
    }
    return result;
  }
  function repairRecords(records, sourceFile, repairs) {
    const mappings = repairs?.files?.[sourceFile] || [];
    const seen = new Map(), result = [];
    for (const record of records) {
      const match = mappings.find(item => item.date === record.date && item.meal === record.meal && item.from === record.originalName);
      const updated = match ? { ...record, originalName: match.to, sourceRepaired: true } : record;
      const signature = JSON.stringify([updated.date, updated.meal, updated.dietCode || '', updated.originalName]);
      if (!seen.has(signature)) { seen.set(signature, result.length); result.push(updated); }
      else if (updated.needsReview) result[seen.get(signature)] = { ...result[seen.get(signature)], needsReview: true, reviewWarning: updated.reviewWarning, recipeId: updated.recipeId };
    }
    return result;
  }
  function sourceRecords(sourceFile, repairs, catalog = []) {
    const source = repairs?.sources?.[sourceFile];
    return source ? source.cells.flatMap(cell => splitItems(cell.text, catalog).map(originalName => ({ date: cell.date, meal: cell.meal, dietCode: cell.dietCode, originalName, sourceCell: cell.text }))) : [];
  }
  return { VERSION, key, quantities, portionWarning, consistencyWarning, incompatible, assignmentWarning, blockingWarning, bestMatch, splitItems, repairRecords, sourceRecords };
})();
