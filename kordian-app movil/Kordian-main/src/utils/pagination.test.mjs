import assert from 'node:assert/strict';
import { getTotalPages, getVisiblePageNumbers } from './pagination.js';

assert.equal(getTotalPages(0, 20), 1);
assert.equal(getTotalPages(45, 20), 3);
assert.deepEqual(getVisiblePageNumbers(2, 5), [1, 2, 3, 4, 5]);
assert.deepEqual(getVisiblePageNumbers(5, 10, 2), [3, 4, 5, 6, 7]);

console.log('pagination test passed');
