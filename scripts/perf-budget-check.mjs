export const SHELL_JS_GZIP_BASELINE_BYTES = 182251;
export const SHELL_JS_GZIP_BUDGET_BYTES = Math.ceil(SHELL_JS_GZIP_BASELINE_BYTES * 1.1);

export function assertShellJavaScriptWithinBudget(gzipBytes, budgetBytes = SHELL_JS_GZIP_BUDGET_BYTES) {
  if (gzipBytes > budgetBytes) {
    throw new Error(
      `Authenticated home JS is ${gzipBytes} gzip bytes; budget is ${budgetBytes} bytes.`,
    );
  }
}
