                No se pudo abrir la página
              </h2>
              <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                {error || favoritesError}
              </p>
              <Link
                to="/"
                className="mt-4 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white"
              >
                Volver al inicio
              </Link>
            </section>
          ) : favoriteProducts.length === 0 ? (
            <section className="rounded-3xl bg-white p-12 text-center dark:bg-stone-800">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                <Heart className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-xl font-bold">
                No hay favoritos agregados
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-stone-500 dark:text-stone-400">
                Agrega productos a tu lista para verlos aquí.
              </p>
              <Link
                to="/"
                className="mt-5 inline-flex rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white"
              >
                Explorar productos
              </Link>
            </section>
          ) : (
            <>
              {(error || favoritesError) && (
                <section
                  className="rounded-2xl bg-white p-4 text-sm text-rose-600 dark:bg-stone-800"
                  role="alert"
                >
                  {error || favoritesError}
                </section>
              )}

              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {favoriteProducts.map((product) => (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-800"
                  >
                    <div className="aspect-square bg-stone-100 p-4 dark:bg-stone-900">
                      <img
                        src={product.image || product.image_url || ''}
                        alt={product.name || 'Producto'}
                        className="h-full w-full object-contain"
                      />
                    </div>

                    <div className="space-y-4 p-4">
                      <div>
                        <p className="text-xs font-bold text-sky-600 dark:text-sky-400">
                          {product.brand || 'Marca no disponible'}
                        </p>
                        <h3 className="mt-1 line-clamp-2 text-sm font-bold">
                          {product.name}
                        </h3>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1 rounded-lg bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                          <Tag className="h-3.5 w-3.5" />
                          {product.currentPrice ?? product.price ?? 0}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFavorite(product.id)}
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
            </>
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
                <span className="text-xl font-black text-stone-900 dark:text-white">
                  Ar-Price
                </span>
              </div>
              <p className="max-w-md text-xs text-stone-500 dark:text-stone-400">
                Plataforma colaborativa e independiente para la comparación de
                precios en tiempo real.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/"
                className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500"
              >
                Reportar precio
              </Link>
              <Link
                to="/"
                className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500"
              >
                Ver Mi Canasta Ahorro
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-4 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Ar-Price Argentina</p>
            <p>
              Ubicación activa:{' '}
              <strong className="text-sky-600 dark:text-sky-400">

