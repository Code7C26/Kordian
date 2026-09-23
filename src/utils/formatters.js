export function formatCurrency(value) {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'ARS',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function formatPercentage(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}
