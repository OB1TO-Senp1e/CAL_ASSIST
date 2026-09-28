import { gzipSync } from 'node:zlib';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'dist', 'client');
const htmlPath = path.join(outputDir, 'index.html');

try {
  await stat(htmlPath);
} catch {
  throw new Error('Built client not found; run "npm --prefix client run build" first.');
}

const html = await readFile(htmlPath, 'utf8');
const entries = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]);
const stylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)]
  .map((match) => match[1]);
const initialFiles = new Set();

async function visitJavaScript(url) {
  const relativePath = url.replace(/^\/+/, '');
  const absolutePath = path.join(outputDir, relativePath);
  if (initialFiles.has(absolutePath)) return;
  initialFiles.add(absolutePath);

  const source = await readFile(absolutePath, 'utf8');
  const staticImports = [...source.matchAll(/\bfrom\s*["']([^"']+\.js)["']/g)];
  for (const match of staticImports) {
    const importedPath = path.resolve(path.dirname(absolutePath), match[1]);
    await visitJavaScript(path.relative(outputDir, importedPath));
  }
}

for (const entry of entries) {
  await visitJavaScript(entry);
}

async function measure(absolutePath) {
  const bytes = await readFile(absolutePath);
  return {
    file: path.relative(outputDir, absolutePath).replaceAll(path.sep, '/'),
    bytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes).byteLength,
  };
}

const allAssets = (await readdir(path.join(outputDir, 'assets')))
  .filter((file) => /\.(js|css)$/i.test(file))
  .map((file) => path.join(outputDir, 'assets', file));
const initialJavaScript = await Promise.all([...initialFiles].map(measure));
const initialCss = await Promise.all(stylesheets.map((url) => measure(path.join(outputDir, url.replace(/^\/+/, '')))));
const emittedAssets = await Promise.all(allAssets.map(measure));

console.log(JSON.stringify({
  initialJavaScript,
  initialJavaScriptBytes: initialJavaScript.reduce((sum, asset) => sum + asset.bytes, 0),
  initialJavaScriptGzipBytes: initialJavaScript.reduce((sum, asset) => sum + asset.gzipBytes, 0),
  initialCss,
  emittedAssets: emittedAssets.sort((a, b) => b.bytes - a.bytes),
}, null, 2));
