import clothesHangerIcon from '../assets/flaticon/clothes-hanger.png';
import drillIcon from '../assets/flaticon/drill.png';
import freshProduceIcon from '../assets/flaticon/fresh-produce.png';
import houseIcon from '../assets/flaticon/house.png';
import petIcon from '../assets/flaticon/pet.png';
import pharmacyIcon from '../assets/flaticon/pharmacy.png';
import personalHygieneIcon from '../assets/flaticon/personal-hygiene.png';
import shoppingCartIcon from '../assets/flaticon/shopping-cart.png';
import televisionIcon from '../assets/flaticon/television.png';
import warehouseBoxesIcon from '../assets/flaticon/warehouse-boxes.png';

export function getCategoryIconAsset(category) {
  const categoryName = `${category?.id || ''} ${category?.name || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/almacen|deposito/.test(categoryName)) return warehouseBoxesIcon;
  if (/ropa|calzado|indument/.test(categoryName)) return clothesHangerIcon;
  if (/hogar|mueble|decoracion/.test(categoryName)) return houseIcon;
  if (/fresco|refrigerad|fruta|verdura|alimento|comida/.test(categoryName)) return freshProduceIcon;
  if (/farmacia|salud|medic|cuidado|belleza/.test(categoryName)) return pharmacyIcon;
  if (/electro|tecnolog|electron|tv|comput|celular/.test(categoryName)) return televisionIcon;
  if (/ferreter|herramient|construccion|jardin/.test(categoryName)) return drillIcon;
  if (/mascota|animal|veterin/.test(categoryName)) return petIcon;
  if (/limpieza/.test(categoryName)) return personalHygieneIcon;
  return shoppingCartIcon;
}

export function CategoryIconImage({ src, className }) {
  const maskStyle = {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  };

  return <span className={`inline-block shrink-0 bg-current ${className}`} style={maskStyle} aria-hidden="true" />;
}
