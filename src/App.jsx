              <button
                onClick={() => {
                  updateFilters({
                    category: 'todos',
                    searchQuery: '',
                    store: 'todos',
                    subcategory: 'todos',
                    sortBy: 'discount-desc',
                    maxPrice: 1000000,
                  });
                  setFavoritesOnlyView(false);
                }}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {paginatedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onCompare={(p) => setSelectedProductForComparison(p)}
                    onExplain={(p) => setSelectedProductForExplanation(p)}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={favorites.includes(String(product.id))}
                    onAddToBasket={addToBasket}
                    isInBasket={basket.some((i) => i.product.id === product.id)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setProductsPage((page) => Math.max(1, page - 1))}
                    disabled={productsPage === 1}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  >
                    Anterior
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setProductsPage(page)}
                      className={`min-w-10 rounded-lg border px-3 py-2 text-xs font-bold ${productsPage === page ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'}`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setProductsPage((page) => Math.min(totalPages, page + 1))}
                    disabled={productsPage === totalPages}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}

      <footer className="mt-16 bg-white dark:bg-stone-900 border-t border-stone-200/80 dark:border-stone-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-stone-100 dark:border-stone-800 pb-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 via-blue-600 to-emerald-500 flex items-center justify-center text-white">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <span className="text-xl font-black text-stone-900 dark:text-white">Ar-Price</span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md">Plataforma colaborativa e independiente para la comparación de precios en tiempo real.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setReportModalOpen(true)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer">
                Reportar precio
              </button>
              <button onClick={() => setBasketOpen(true)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer">
                Ver Mi Canasta Ahorro
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-400 font-medium">
            <p>© {new Date().getFullYear()} Ar-Price Argentina</p>
            <p>Ubicación activa: <strong className="text-sky-600 dark:text-sky-400">{selectedCity}</strong></p>
          </div>
        </div>
      </footer>

      {selectedProductForComparison && (
        <ComparisonModal
          product={selectedProductForComparison}
          onClose={() => setSelectedProductForComparison(null)}
          onAddToBasket={addToBasket}
          isInBasket={basket.some((i) => i.product.id === selectedProductForComparison.id)}
          onExplain={(p) => setSelectedProductForExplanation(p)}
        />
      )}

      <PriceExplanationModal
        product={selectedProductForExplanation}
        onClose={() => setSelectedProductForExplanation(null)}
      />

      {basketOpen && (
        <SmartBasketModal
          basket={basket}
          onClose={() => setBasketOpen(false)}
          onUpdateQuantity={updateBasketQuantity}
          onRemoveItem={removeFromBasket}
          onClearBasket={clearBasket}
        />
      )}

      {reportModalOpen && (
        <ReportPriceModal onClose={() => setReportModalOpen(false)} selectedCity={selectedCity} />
      )}
    </div>

  );
