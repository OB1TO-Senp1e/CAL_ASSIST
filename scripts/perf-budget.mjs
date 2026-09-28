import { analyzeBundle } from './perf-bundle.mjs';
import {
  assertShellJavaScriptWithinBudget,
  SHELL_JS_GZIP_BUDGET_BYTES,
} from './perf-budget-check.mjs';

const report = await analyzeBundle();
assertShellJavaScriptWithinBudget(report.authenticatedHomeJavaScriptGzipBytes);

console.log(JSON.stringify({
  route: 'authenticated home (entry + DashboardLayout + TodayPage)',
  gzipBytes: report.authenticatedHomeJavaScriptGzipBytes,
  budgetBytes: SHELL_JS_GZIP_BUDGET_BYTES,
}, null, 2));
