export function getTotalPages(totalItems, pageSize) {
  const safeTotal = Number.isFinite(totalItems) ? Math.max(0, Number(totalItems)) : 0;
  const safePageSize = Number.isFinite(pageSize) && Number(pageSize) > 0 ? Number(pageSize) : 20;

  if (safeTotal === 0) return 1;
  return Math.ceil(safeTotal / safePageSize);
}

export function getVisiblePageNumbers(currentPage, totalPages, siblings = 1) {
  const safeCurrent = Number.isFinite(currentPage) ? Math.max(1, Number(currentPage)) : 1;
  const safeTotalPages = Number.isFinite(totalPages) ? Math.max(1, Number(totalPages)) : 1;
  const safeSiblings = Number.isFinite(siblings) ? Math.max(0, Number(siblings)) : 1;

  if (safeTotalPages <= 5) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const pages = new Set();
  const start = Math.max(1, safeCurrent - safeSiblings);
  const end = Math.min(safeTotalPages, safeCurrent + safeSiblings);

  for (let page = start; page <= end; page += 1) {
    pages.add(page);
  }

  if (pages.size < 5) {
    const addFromStart = Array.from({ length: safeTotalPages }, (_, index) => index + 1)
      .filter((page) => !pages.has(page));

    for (const page of addFromStart) {
      if (pages.size >= 5) break;
      pages.add(page);
    }
  }

  return [...pages].sort((a, b) => a - b).slice(0, 5);
}
