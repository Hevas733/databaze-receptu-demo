window.RecipeFilters=(()=>{
 'use strict';
 const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
 function bound(value){const text=String(value).trim();if(!text)return null;return /^\d+(?:[.,]\d+)?$/.test(text)?Number(text.replace(',','.')):NaN}
 function energy(recipe,unit){const n=recipe.nutritionPerServing||{};const kj=valid(n.energyKj)?n.energyKj:valid(n.energyKcalApprox)?n.energyKcalApprox*4.184:null;return kj===null?null:unit==='kJ'?kj:kj/4.184}
 function within(value,min,max){if(min===null&&max===null)return true;return valid(value)&&(min===null||value>=min-0.000001)&&(max===null||value<=max+0.000001)}
 function error(min,max,label){if([min,max].some(v=>v!==null&&!valid(v)))return label+': zadejte nezáporné číslo (např. 25,50).';if(min!==null&&max!==null&&min>max)return label+': minimum nesmí být vyšší než maximum.';return ''}
 function matches(recipe,filters){return within(recipe.pricePerServingCzk,filters.priceMin,filters.priceMax)&&within(energy(recipe,filters.unit),filters.energyMin,filters.energyMax)}
 return {bound,energy,error,matches};
})();
