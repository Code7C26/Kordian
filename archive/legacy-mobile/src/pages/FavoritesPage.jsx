import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, Loader2, TrendingDown, Tag } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiUrl } from '../config/api.js';
import { Header } from '../components/Header.jsx';
import { useSelectedCity } from '../contexts/SelectedCityContext.jsx';

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem('arprice_favorites') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function FavoritesPage() {
  const navigate = useNavigate();
  const { selectedCity } = useSelectedCity();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('arprice_theme') === 'dark');
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [favorites, setFavorites] = useState(readFavorites);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('arprice_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setError('La carga del catálogo tomó demasiado tiempo');
        setIsLoading(false);
      }
    }, 10000);

    async function loadProducts() {
      try {
        const response = await fetch(apiUrl('/products?limit=2000'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
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
  }, []);

  const favoriteProducts = useMemo(
    () => products.filter((product) => favorites.includes(String(product.id))),
    [favorites, products]
  );

  const toggleFavorite = (productId) => {
    const nextFavorites = favorites.includes(String(productId))
      ? favorites.filter((id) => id !== String(productId))
      : [...favorites, String(productId)];
    setFavorites(nextFavorites);
    localStorage.setItem('arprice_favorites', JSON.stringify(nextFavorites));
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
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">Tu selección</p>
                <h1 className="text-2xl font-black sm:text-3xl">Favoritos</h1>
              </div>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a Categorías
            </Link>
          </div>
        </section>

        {isLoading ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800" role="status" aria-live="polite">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
            <h2 className="mt-4 text-xl font-bold">Cargando favoritos</h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Recuperando tu lista de productos.</p>
          </section>
        ) : error ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800">
            <h2 className="text-xl font-bold text-rose-600">No se pudo abrir la página</h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{error}</p>
            <Link to="/" className="mt-4 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white">Volver al inicio</Link>
          </section>
        ) : favoriteProducts.length === 0 ? (
          <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
              <Heart className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-xl font-bold">No hay favoritos agregados</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-500 dark:text-stone-400">Agrega productos a tu lista para verlos aquí.</p>
            <Link to="/" className="mt-5 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white">Explorar productos</Link>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favoriteProducts.map((product) => (
              <article key={product.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-800">
                <div className="aspect-square bg-stone-100 p-4 dark:bg-stone-900">
                  <img src={product.image || product.image_url || ''} alt={product.name || 'Producto'} className="h-full w-full object-contain" />
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <p className="text-xs font-bold text-sky-600 dark:text-sky-400">{product.brand || 'Marca no disponible'}</p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold">{product.name}</h3>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-lg bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                      <Tag className="h-3.5 w-3.5" />
                      {product.currentPrice ?? product.price ?? 0}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(product.id)}
                      className="rounded-full bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300"
                      aria-label="Eliminar de favoritos"
                    >
                      <Heart className="h-4 w-4 fill-current" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
        </div>
      </main>

      <footer className="mt-16 border-t border-stone-200 bg-white py-12 dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 border-b border-stone-100 pb-8 dark:border-stone-800 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 via-blue-600 to-emerald-500 text-white">
                  <TrendingDown className="h-4 w-4" />
                </div>
                <span className="text-xl font-black text-stone-900 dark:text-white">Ar-Price</span>
              </div>
              <p className="max-w-md text-xs text-stone-500 dark:text-stone-400">Plataforma colaborativa e independiente para la comparación de precios en tiempo real.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/" className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500">Reportar precio</Link>
              <Link to="/" className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500">Ver Mi Canasta Ahorro</Link>
            </div>
          </div>
          <div className="flex flex-col gap-4 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Ar-Price Argentina</p>
            <p>Ubicación activa: <strong className="text-sky-600 dark:text-sky-400">{selectedCity}</strong></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
