const productTermTranslations = [
  ['aceite de oliva extra virgen', 'extra virgin olive oil'],
  ['aceite de oliva', 'olive oil'],
  ['aceite vegetal', 'vegetable oil'],
  ['leche descremada', 'skim milk'],
  ['leche entera', 'whole milk'],
  ['queso crema', 'cream cheese'],
  ['queso rallado', 'grated cheese'],
  ['jabon liquido', 'liquid soap'],
  ['jabón líquido', 'liquid soap'],
  ['papel higienico', 'toilet paper'],
  ['papel higiénico', 'toilet paper'],
  ['toallas de papel', 'paper towels'],
  ['harina de trigo', 'wheat flour'],
  ['agua mineral', 'mineral water'],
  ['sin azucar', 'sugar-free'],
  ['sin azúcar', 'sugar-free'],
  ['con palo', 'with stems'],
  ['comprimidos', 'tablets'],
  ['comprimido', 'tablet'],
  ['capsulas', 'capsules'],
  ['cápsulas', 'capsules'],
  ['tabletas', 'tablets'],
  ['galletitas', 'cookies'],
  ['galletas', 'cookies'],
  ['detergente', 'detergent'],
  ['descremada', 'skim'],
  ['integral', 'whole grain'],
  ['azucar', 'sugar'],
  ['azúcar', 'sugar'],
  ['harina', 'flour'],
  ['fideos', 'pasta'],
  ['arroz', 'rice'],
  ['leche', 'milk'],
  ['queso', 'cheese'],
  ['manteca', 'butter'],
  ['yogur', 'yogurt'],
  ['carnes', 'meat'],
  ['pollo', 'chicken'],
  ['carne', 'meat'],
  ['frutillas', 'strawberries'],
  ['frutilla', 'strawberry'],
  ['manzanas', 'apples'],
  ['manzana', 'apple'],
  ['naranjas', 'oranges'],
  ['naranja', 'orange'],
  ['tomates', 'tomatoes'],
  ['tomate', 'tomato'],
  ['cebollas', 'onions'],
  ['cebolla', 'onion'],
  ['papas', 'potatoes'],
  ['papa', 'potato'],
  ['zanahorias', 'carrots'],
  ['zanahoria', 'carrot'],
  ['banana', 'banana'],
  ['bananas', 'bananas'],
  ['agua', 'water'],
  ['gaseosa', 'soft drink'],
  ['jugos', 'juices'],
  ['jugo', 'juice'],
  ['cafe', 'coffee'],
  ['café', 'coffee'],
  ['te', 'tea'],
  ['té', 'tea'],
  ['chocolate', 'chocolate'],
  ['galletita', 'cookie'],
  ['congelados', 'frozen'],
  ['congelado', 'frozen'],
  ['limpieza', 'cleaning'],
  ['shampoo', 'shampoo'],
  ['acondicionador', 'conditioner'],
  ['jabon', 'soap'],
  ['jabón', 'soap'],
  ['crema', 'cream'],
  ['desodorante', 'deodorant'],
  ['pañales', 'diapers'],
  ['panales', 'diapers'],
  ['toallitas', 'wipes'],
  ['lavandina', 'bleach'],
];

export function translateProductName(name, language) {
  if (language !== 'en' || typeof name !== 'string') return name;

  return productTermTranslations.reduce((translatedName, [spanish, english]) => {
    const escapedTerm = spanish.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const termPattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapedTerm})(?=$|[^\\p{L}\\p{N}])`, 'giu');
    return translatedName.replace(termPattern, (...[, prefix, term]) => {
      const replacement = term === term.toLocaleUpperCase()
        ? english.toLocaleUpperCase()
        : term[0] === term[0].toLocaleUpperCase()
          ? `${english[0].toLocaleUpperCase()}${english.slice(1)}`
          : english;
      return `${prefix}${replacement}`;
    });
  }, name);
}
