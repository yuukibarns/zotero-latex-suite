import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'acorn';

// Select methods from the pinned upstream source, rather than maintaining a
// second handwritten implementation of Quiver's geometry or arrow semantics.
export async function extract() {
  const base = new URL('../vendor/quiver/', import.meta.url);
  const out = new URL('../build/quiver/', import.meta.url);
  await mkdir(out, { recursive: true });
  const read = name => readFile(new URL(name, base), 'utf8');
  const save = (name, text) => writeFile(new URL(name, out), '// Derived from Quiver; see vendor/quiver/LICENSE.\n' + text);
  const ui = await read('ui.mjs');
  const ast = parse(ui, { ecmaVersion: 'latest', sourceType: 'module' });
  const classes = new Map(ast.body.map(n => n.declaration || n).filter(n => n.type === 'ClassDeclaration').map(n => [n.id.name, n]));
  function method(cls, name) {
    const matches = classes.get(cls).body.body.filter(n => n.key.name === name);
    if (matches.length !== 1) throw new Error(`Upstream method changed: ${cls}.${name}`);
    return ui.slice(matches[0].start, matches[0].end);
  }
  function replaceOnce(source, from, to) {
    if (source.split(from).length !== 2) throw new Error(`Upstream structure changed: ${from}`);
    return source.replace(from, to);
  }
  const imports = ui.slice(0, ast.body[3].end); // Arrow, geometry, DOM, data only.
  const constants = ui.slice(ast.body[6].start, ast.body[6].end); // Object.assign(CONSTANTS, ...)
  if (!constants.includes('Object.assign(CONSTANTS')) throw new Error('Upstream constants changed');
  const cell = `class Cell {
    constructor(quiver, level, label = '', label_colour = Colour.black()) {
      if (quiver.all_cells().length >= 200) throw new Error('Diagram exceeds 200 cells.');
      this.level = level; this.label = label; this.label_colour = label_colour;
      this.element = null; this.code = ''; quiver.add(this);
    }
    initialise(ui) {
      this.element.class_list.add('cell');
      const label = this.element.query_selector('.label');
      if (label && this.label_colour.is_not_black()) label.set_style({color:this.label_colour.css()});
      ui.add_cell(this);
    }
    ${['content_element', 'is_vertex', 'is_edge', 'is_loop'].map(n => method('Cell', n)).join('\n')}
  }`;
  // Vertex uses the upstream layout/rendering methods, without shortcuts or kbd.
  let vertexRender = method('Vertex', 'render');
  vertexRender = replaceOnce(vertexRender, 'ui.codes.set(this.code, this);', '');
  vertexRender = replaceOnce(vertexRender, `.add(new DOM.Element("kbd", {
                    "data-code": this.code,
                    class: "hint queue",
                }))`, '');
  const vertex = `export class Vertex extends Cell {
    ${method('Vertex', 'constructor')}
    ${method('Vertex', 'content_element')}
    ${vertexRender}
    ${['recalculate_size','content_size','resize_content'].map(n => method('Vertex', n)).join('\n')}
  }`;
  let reconnect = method('Edge', 'reconnect');
  reconnect = replaceOnce(reconnect, 'ui.panel.update(ui);', '');
  const edge = `export class Edge extends Cell {
    ${['constructor','default_options','render','angle','flip','reverse'].map(n => method('Edge', n)).join('\n')}
    ${reconnect}
    initialise(ui) { super.initialise(ui); ui.panel.render_maths(ui, this); }
  }`;
  const layout = `export class UI {
    ${['cell_size','cell_centre_at_position','centre_offset_from_position','offset_from_position','arrow_style_for_options','update_style'].map(n => method('UI', n)).join('\n')}
  }`;
  await save('ui.mjs', imports + '\n' + constants + '\n' + cell + '\n' + vertex + '\n' + edge + '\n' + layout);

  const graph = await read('quiver.mjs');
  const graphAST = parse(graph, { ecmaVersion: 'latest', sourceType: 'module' });
  const graphNode = graphAST.body.find(n => n.declaration?.id?.name === 'Quiver');
  const constantsNode = graphAST.body.find(n => n.type === 'ExpressionStatement' && graph.slice(n.start, n.end).startsWith('QuiverExport.CONSTANTS ='));
  if (!graphNode || !constantsNode) throw new Error('Upstream graph changed');
  const graphMethods = graphNode.declaration.body.body
    .filter(n => !['export', 'import'].includes(n.key.name))
    .map(n => graph.slice(n.start, n.end)).join('\n');
  await save('quiver.mjs', `export class Quiver {\n${graphMethods}\n}\nexport class QuiverExport {}\n${graph.slice(constantsNode.start, constantsNode.end)}`);

  let parser = await read('parser.mjs');
  parser = replaceOnce(parser, 'this.ui = ui;', 'this.ui = ui; this.post_layout = () => {};');
  parser = replaceOnce(parser, 'delay(() => {', 'this.post_layout = () => {');
  parser = replaceOnce(parser, '            });\n\n            if (!this.eat("\\\\end{tikzcd}"))', '            };\n\n            if (!this.eat("\\\\end{tikzcd}"))');
  parser = replaceOnce(parser, '// We simply ignore these options.', `this.log(this.warn('Diagram spacing is not preserved by Quiver.', this.range_here()));`);
  parser = replaceOnce(parser, '// We simply ignore this option.', `this.log(this.warn('The cramped option is not preserved by Quiver.', this.range_here()));`);
  // Upstream consumes the comma even when the next marking option is `text`
  // rather than `pos`, breaking two of its own valid parser fixtures. Look
  // ahead for the complete option name before consuming anything.
  parser = replaceOnce(parser,
    'if (this.eat(",") && this.eat_whitespace() && this.eat("pos")) {',
    'if (this.eat(/^,\\s*pos(?=\\s*=)/)) {');
  // Prevent an enormous direction string/coordinate from creating a huge layout.
  let vertexConstructor = method('Vertex', 'constructor');
  const boundedConstructor = vertexConstructor.replace('super(ui.quiver,', `if (![position.x, position.y].every(v => Number.isInteger(v) && Math.abs(v) <= 100)) throw new Error('Grid coordinates must be integers between -100 and 100.');\n        super(ui.quiver,`);
  const generatedUI = await readFile(new URL('ui.mjs', out), 'utf8');
  await writeFile(new URL('ui.mjs', out), replaceOnce(generatedUI, vertexConstructor, boundedConstructor));
  await save('parser.mjs', parser);
  for (const name of ['arrow.mjs','curve.mjs','ds.mjs']) {
    let source = await read(name);
    if (name === 'arrow.mjs') {
      // Remove an unreachable duplicate case without changing arrow geometry.
      source = replaceOnce(source, 'case "mono":\n                    case "multimap":', 'case "mono":');
    }
    await save(name, source);
  }
  // Only basic DOM helpers are needed. Multislider installs global listeners.
  const dom = await read('dom.mjs');
  const slider = dom.indexOf('DOM.Multislider =');
  if (slider < 0) throw new Error('Upstream DOM helpers changed');
  await save('dom.mjs', dom.slice(0, slider));
}
