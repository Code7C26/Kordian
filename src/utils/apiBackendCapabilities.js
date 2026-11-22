const REVIEW_GROUPING_ROUTES = [
  '/analysis/cross-source-matches',
  '/review/cross-source-decisions',
  '/review/product-match-decisions',
]

export function requiresReviewGroupingBackend(path) {
  const pathname = String(path).split(/[?#]/, 1)[0]
  return REVIEW_GROUPING_ROUTES.some((route) => (
    pathname === route || pathname.startsWith(`${route}/`)
  ))
}
