import assert from 'node:assert/strict';
import { formatCurrency } from './formatters.js';

assert.equal(formatCurrency(1234), '$1,234.00');
assert.equal(formatCurrency(1234.5), '$1,234.50');
assert.equal(formatCurrency(1234.567), '$1,234.57');

console.log('formatters test passed');
