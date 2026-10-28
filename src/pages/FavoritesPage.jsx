import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiUrl } from '../config/api.js';
import { buildProductsQuery } from '../utils/catalogQuery.js';
import { Header } from '../components/Header.jsx';
import { SupermarketLogo } from '../components/SupermarketLogo.jsx';
import { fetchCachedCatalogResponse, readCachedCatalogResponse } from '../services/catalogResponseCache.js';
import { useSelectedCity } from '../contexts/SelectedCityContext.jsx';
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx';
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx';
import brandLogo from '../../assents/Ar-Price/Logo_final.svg';
import brandLogoDark from '../../assents/Ar-Price/Logo_final_Negativo.svg';

export default function FavoritesPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { selectedCity } = useSelectedCity();
  const { user, loading: authLoading, favorites, favoritesLoading, toggleFavorite, favoritesError } = useCustomerAuth();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('arprice_theme') === 'dark');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [supermarkets, setSupermarkets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const favoriteIdsKey = favorites.join(',');
  const translateProductName = useProductNameTranslator(products.map((product) => product.name));

  useEffect(() => {
    let cancelled = false;

    fetchCachedCatalogResponse(apiUrl('/categories'), { ttlMs: 300_000 })
      .then((result) => {
        if (!cancelled) setCategories(Array.isArray(result) ? result : []);
      })
      .catch((categoryError) => {
        console.error('Categories could not be loaded on the favorites page', categoryError);
      });

    fetchCachedCatalogResponse(apiUrl('/supermarkets'), { ttlMs: 300_000 })
      .then((result) => {
        if (!cancelled) setSupermarkets(Array.isArray(result) ? result : []);
      })
      .catch((supermarketError) => {
        console.error('Supermarkets could not be loaded on the favorites page', supermarketError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('arprice_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;
    if (authLoading || favoritesLoading || !user || !favoriteIdsKey) {
      setProducts([]);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const query = buildProductsQuery({ limit: 100, favoritesOnly: true, favoriteIds: favoriteIdsKey.split(',') });
    const productsUrl = apiUrl(`/products?${query.toString()}`);
    const cachedPayload = readCachedCatalogResponse(productsUrl);
    const cachedProducts = Array.isArray(cachedPayload) ? cachedPayload : cachedPayload?.data || [];
    if (cachedPayload !== null) {
      setProducts(cachedProducts);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setError('');
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setError('La carga del catálogo tomó demasiado tiempo');
        setIsLoading(false);
      }
    }, 10000);

    async function loadProducts() {
      try {
        const payload = await fetchCachedCatalogResponse(productsUrl);
        const catalog = Array.isArray(payload) ? payload : payload?.data || [];
        if (!cancelled) setProducts(catalog);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'No se pudieron cargar los productos');
      } finally {
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setIsLoading(false);
        }
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [authLoading, favoriteIdsKey, favoritesLoading, user]);

  const favoriteProducts = useMemo(
    () => products.filter((product) => favorites.includes(String(product.id))),
    [favorites, products]
  );

  const removeFavorite = async (productId) => {
    try {
      await toggleFavorite(productId);
      setError('');
    } catch (toggleError) {
      setError(toggleError.message || 'No se pudo actualizar el favorito.');
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100 transition-colors duration-200">
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        selectedCity={selectedCity}
        basketCount={0}
        onOpenBasket={() => navigate('/')}
        favoritesCount={favorites.length}
        onOpenFavorites={() => navigate('/favoritos', { replace: true })}
        onResetView={() => navigate('/')}
        categories={categories}
        selectedCategory="todos"
        onSelectCategory={(categoryId) => {
          navigate(categoryId === 'todos' ? '/buscar' : `/buscar?category=${encodeURIComponent(categoryId)}`);
        }}
      />

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-stone-800 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                <Heart className="h-6 w-6 fill-current" />
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">{t('Tu selección')}</p>
                <h1 className="text-2xl font-black sm:text-3xl">{t('Favoritos')}</h1>
              </div>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('Volver a Categorías')}
            </Link>
          </div>
        </section>

        {authLoading ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800" role="status">{t('Cargando cuenta…')}</section>
        ) : !user ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800">
            <h2 className="text-xl font-bold">{t('Inicia sesión para ver tus favoritos')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-500 dark:text-stone-400">{t('Tus productos favoritos se guardan en tu cuenta y no se comparten con otras cuentas.')}</p>
            <Link to="/ingresar?next=%2Ffavoritos" className="mt-5 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white">{t('Iniciar sesión')}</Link>
          </section>
        ) : favoritesLoading || isLoading ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800" role="status" aria-live="polite">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
            <h2 className="mt-4 text-xl font-bold">{t('Cargando favoritos')}</h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t('Recuperando tu lista de productos.')}</p>
          </section>
        ) : error || favoritesError ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800">
            <h2 className="text-xl font-bold text-rose-600">{t('No se pudo abrir la página')}</h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t(error || favoritesError)}</p>
            <Link to="/" className="mt-4 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white">{t('Volver al inicio')}</Link>
          </section>
        ) : favoriteProducts.length === 0 ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
              <Heart className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-xl font-bold">{t('No hay favoritos agregados')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-500 dark:text-stone-400">{t('Agrega productos a tu lista para verlos aquí.')}</p>
            <Link to="/" className="mt-5 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white">{t('Explorar productos')}</Link>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favoriteProducts.map((product) => {
              const displayName = translateProductName(product.name);
              const cheapestOffer = (product.offers || [])
                .map((offer) => ({
                  ...offer,
                  price: Number(offer.cash_price ?? offer.cashPrice ?? offer.price ?? 0),
                  supermarket: offer.supermarket || offer.supermarket_name || offer.storeName || '',
                }))
                .filter((offer) => Number.isFinite(offer.price) && offer.price > 0 && offer.supermarket)
                .sort((first, second) => first.price - second.price)[0];
              const supermarket = supermarkets.find((store) => store.name === cheapestOffer?.supermarket);
              return (
                <article key={product.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-800">
                  <div className="aspect-square bg-stone-100 p-4 dark:bg-stone-900">
                    <img src={product.image || product.image_url || ''} alt={displayName || t('Producto')} className="h-full w-full object-contain" />
                  </div>
                  <div className="space-y-4 p-4">
                    <div>
                      <p className="text-xs font-bold text-sky-600 dark:text-sky-400">{product.brand || product.brands?.name || t('Marca no disponible')}</p>
                      <h3 className="mt-1 line-clamp-2 text-sm font-bold">{displayName}</h3>
                    </div>
                    {cheapestOffer && (
                      <div className="flex items-center gap-2 border-t border-stone-100 pt-3 dark:border-stone-700">
                        <SupermarketLogo
                          name={cheapestOffer.supermarket}
                          image={supermarket?.image || cheapestOffer.image}
                          className="h-8 w-12"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-600 dark:text-stone-300">{cheapestOffer.supermarket}</span>
                        <span className="text-sm font-black text-stone-900 dark:text-stone-100">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(cheapestOffer.price)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => removeFavorite(product.id)}
                        className="ml-auto rounded-full bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300"
                        aria-label={t('Eliminar de favoritos')}
                      >
                        <Heart className="h-4 w-4 fill-current" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
        </div>
      </main>

      <footer className="mt-16 border-t border-stone-200/80 bg-white py-12 dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 border-b border-stone-100 pb-8 dark:border-stone-800 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <img
                src={darkMode ? brandLogoDark : brandLogo}
                alt="AR-PRICE"
                className={`h-16 w-auto max-w-[160px] shrink-0 object-contain transition-transform duration-200 hover:scale-[1.03] ${
                  darkMode ? 'mix-blend-screen' : ''
                }`}
              />
              <span className="h-12 w-px shrink-0 bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
              <p className="max-w-md text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                {t('Plataforma colaborativa e independiente para comparar precios y encontrar mejores opciones.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/" className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500">{t('Reportar precio')}</Link>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-4 text-xs font-medium text-stone-400 sm:flex-row">
            <p>© {new Date().getFullYear()} Ar-Price Argentina</p>
            <p>{t('Ubicación activa:')} <strong className="text-sky-600 dark:text-sky-400">{selectedCity}</strong></p>
          </div>
        </div>
      </footer>

    </div>
  );
}
