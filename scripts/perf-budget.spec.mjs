import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertShellJavaScriptWithinBudget,
  SHELL_JS_GZIP_BUDGET_BYTES,
} from './perf-budget-check.mjs';

test('accepts the exact shell JavaScript budget', () => {
  assert.doesNotThrow(() => assertShellJavaScriptWithinBudget(SHELL_JS_GZIP_BUDGET_BYTES));
});

test('fails when shell JavaScript exceeds the budget', () => {
  assert.throws(
    () => assertShellJavaScriptWithinBudget(SHELL_JS_GZIP_BUDGET_BYTES + 1),
    /exceeds|budget is/,
  );
});
