import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;
const { renderTikzcd } = await import('../build/renderer.mjs');
const host = document.getElementById('host');
const basic = String.raw`\begin{tikzcd} A \arrow[r,"f"] & B \end{tikzcd}`;

test('basic arrow, KaTeX labels and disposal', async () => {
  const result = await renderTikzcd(host, basic);
  assert.equal(result.vertices, 2); assert.equal(result.edges, 1);
  assert.ok(result.element.querySelector('svg path'));
  assert.equal(result.element.querySelectorAll('.katex').length, 3);
  assert.equal(result.element.querySelectorAll('kbd,input,button').length, 0);
  result.dispose(); assert.equal(host.children.length, 0);
});
test('parser errors remove the partial render', async () => {
  await assert.rejects(renderTikzcd(host, '\\begin{tikzcd} A'), /end/);
  await assert.rejects(renderTikzcd(host, 'not a diagram'), /start/);
  assert.equal(host.children.length, 0);
});
test('ignored layout options and unknown options are reported', async () => {
  const result = await renderTikzcd(host, String.raw`\begin{tikzcd}[row sep=huge,cramped,unsupported] A \end{tikzcd}`);
  assert.equal(result.diagnostics.length, 3);
  assert.match(result.diagnostics[0].message, /spacing/); result.dispose();
});
test('untrusted labels cannot inject HTML, links or images', async () => {
  const result = await renderTikzcd(host, String.raw`\begin{tikzcd} \href{https://example.com}{A} & \includegraphics{https://example.com/a.png} \end{tikzcd}`);
  assert.equal(result.element.querySelectorAll('a,img,script,iframe').length, 0);
  result.dispose();
});
test('limits bound the source, grid and number of cells', async () => {
  await assert.rejects(renderTikzcd(host, 'x'.repeat(20001)), /20,000/);
  await assert.rejects(renderTikzcd(host, '\\begin{tikzcd}' + 'A & '.repeat(102) + 'B\\end{tikzcd}'), /coordinates/);
  const row = Array(21).fill('A').join(' & ');
  await assert.rejects(renderTikzcd(host, '\\begin{tikzcd} ' + Array(10).fill(row).join(' \\\\ ') + ' \\end{tikzcd}'), /200 cells/);
  assert.equal(host.children.length, 0);
});
test('cancellation during font loading removes only its own root', async () => {
  let ready;
  document.fonts = { ready: new Promise(resolve => ready = resolve) };
  const controller = new AbortController();
  const first = renderTikzcd(host, basic, { signal: controller.signal });
  const second = renderTikzcd(host, basic);
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  ready(); const result = await second;
  assert.equal(host.children.length, 1); result.dispose(); delete document.fonts;
});
test('multiple diagrams have distinct SVG IDs', async () => {
  const one = await renderTikzcd(host, basic), two = await renderTikzcd(host, basic);
  const ids = [...host.querySelectorAll('[id]')].map(n => n.id);
  assert.equal(new Set(ids).size, ids.length);
  one.dispose(); two.dispose();
});
test('bundle has no upstream application startup, CDN loading or global pointer handlers', async () => {
  const source = await readFile(new URL('../build/renderer.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['cdn.jsdelivr.net','DOMContentLoaded','active_thumb','class Toolbar','class Shortcuts','localStorage']) assert.ok(!source.includes(forbidden), forbidden);
});
const fixtures = await readFile(new URL('../vendor/quiver/parser-fixtures.tex', import.meta.url), 'utf8');
const validFixtures = fixtures.split('%%% Invalid diagrams %%%')[0].match(/\\begin\{tikzcd\}[\s\S]*?\\end\{tikzcd\}/g);
for (const [index, source] of validFixtures.entries()) {
  test(`upstream valid parser fixture ${index + 1}`, async () => {
    const result = await renderTikzcd(host, source);
    assert.ok(result.vertices > 0);
    assert.ok(!/NaN|Infinity/.test(result.element.innerHTML));
    result.dispose(); assert.equal(host.children.length, 0);
  });
}
