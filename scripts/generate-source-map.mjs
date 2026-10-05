// Typechecking must also work before the first build in a fresh checkout.
import { buildKatexSourceMap } from './katex-source-map.mjs';
await buildKatexSourceMap();
