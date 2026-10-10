// ============================================================================
// 1. CDLaTeX Multi-Level Semicolon Symbols Configuration
// ============================================================================
const semicolon_symbols = {
	a: ["\\alpha"],
	b: ["\\beta"],
	d: ["\\delta", "\\partial"],
	e: ["\\epsilon", "\\varepsilon"],
	f: ["\\phi", "\\varphi"],
	g: ["\\gamma"],
	h: ["\\eta", "\\hbar"],
	i: ["\\iota", "\\imath"],
	k: ["\\kappa"],
	l: ["\\lambda", "\\ell"],
	m: ["\\mu"],
	n: ["\\nu", "\\nabla"],
	o: ["\\omega"],
	w: ["\\omega"],
	p: ["\\pi", "\\varpi"],
	q: ["\\theta", "\\vartheta"],
	r: ["\\rho", "\\varrho"],
	s: ["\\sigma", "\\varsigma"],
	t: ["\\tau"],
	u: ["\\upsilon"],
	v: ["\\vee"],
	x: ["\\xi"],
	c: ["\\chi"],
	y: ["\\psi"],
	z: ["\\zeta"],

	A: ["\\forall"],
	I: ["\\in"],
	D: ["\\Delta"],
	E: ["\\exists"],
	F: ["\\Phi"],
	G: ["\\Gamma"],
	L: ["\\Lambda"],
	O: ["\\Omega"],
	W: ["\\Omega"],
	P: ["\\Pi"],
	Q: ["\\Theta"],
	S: ["\\Sigma"],
	U: ["\\Upsilon"],
	X: ["\\Xi"],
	Y: ["\\Psi"],

	0: ["\\emptyset"],
	8: ["\\infty"],
	"!": ["\\neg"],
	"^": ["\\uparrow"],
	"&": ["\\wedge"],
	"~": ["\\approx", "\\simeq"],
	_: ["\\downarrow"],
	"+": ["\\cup"],
	"-": ["\\leftrightarrow", "\\longleftrightarrow"],
	"*": ["\\times"],
	"/": ["\\not"],
	"|": ["\\mapsto", "\\longmapsto"],
	"\\": ["\\setminus"],
	"=": ["\\Leftrightarrow", "\\Longleftrightarrow"],
	"(": ["\\langle"],
	")": ["\\rangle"],
	"[": ["\\Leftarrow", "\\Longleftarrow"],
	"]": ["\\Rightarrow", "\\Longrightarrow"],
	"{": ["\\subset"],
	"}": ["\\supset"],
	"<": ["\\langle"],
	">": ["\\rangle"],
	"'": ["\\prime"],
	".": ["\\cdot"],
};

const semicolon_snippets = [];
for (const [key, list] of Object.entries(semicolon_symbols)) {
	list.forEach((cmd, index) => {
		if (!cmd) return;
		const prefix = ";".repeat(index + 1);
		const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

		semicolon_snippets.push({
			trigger: new RegExp(`(?<!;)${prefix}${escapedKey}`),
			replacement: cmd,
			options: "rmA",
			description: `Semicolon symbol: ${prefix}${key} -> ${cmd}`,
		});
	});
}

// ============================================================================
// 2. Modifiers Lookup (Accents & Fonts)
// ============================================================================
const modifiers = {
	"~": "\\tilde",
	T: "\\widetilde",
	"^": "\\hat",
	H: "\\widehat",
	"-": "\\bar",
	O: "\\overline",
	".": "\\dot",
	":": "\\ddot",
	_: "\\underline",
	v: "\\vec",
	"}": "\\underbrace",
	"]": "\\boxed",
	o: "\\mathring",
	c: "\\mathcal",
	b: "\\mathbf",
	r: "\\mathrm",
	t: "\\text",
	s: "\\mathscr",
	a: "\\mathbb",
	f: "\\mathfrak",
	m: "\\bm",
};

export default [
	// Math-mode bypasses to block Obsidian auto-pairing conflicts
	{ trigger: /(?<!')'/, replacement: "'", options: "rmA" },
	{ trigger: /(?<!\*)\*/, replacement: "*", options: "rmA" },
	{ trigger: /(?<!`)`/, replacement: "`", options: "rmA" },
	{ trigger: /(?<!")"/, replacement: '"', options: "rmA" },

	// Math mode entry triggers
	{ trigger: "mk", replacement: "$$0$", options: "tA" },
	// Inline math inside \text{...}: stays in the current equation node.
	{ trigger: "mk", replacement: (_match, api) => (api?.algorithmText ? "$$0$$1" : "\\($0\\)$1"), options: "TA" },
	{ trigger: "dm", replacement: "$$ $0 $$", options: "tAw" },
	{ trigger: /(?<=\S.*)dm/, replacement: "\n$$\n\t$0\n$$", options: "tAw", priority: 1 },

	// Default Superscripts & Subscripts
	{ trigger: "^", replacement: "^{$0}$1", options: "mA" },
	{ trigger: "_", replacement: "_{$0}$1", options: "mA" },

	// Math-Mode Auto-Pairing for Delimiters (Guarded from "'" conflict)
	{ trigger: /(?<!')\(/, replacement: "($0)$1", options: "rmA" },
	{ trigger: /(?<!')\[/, replacement: "[$0]$1", options: "rmA" },
	{ trigger: /(?<!')\{/, replacement: "{$0}$1", options: "rmA" },

	// Postfix Modifications (e.g., x'~ -> \tilde{x}, \alpha'm -> \bm{\alpha})
	{
		trigger: /([a-zA-Z0-9\\]+)'([~T\^H\-O\.:_v\}\]ocbrtsafm])/,
		replacement: match => {
			const target = match[1];
			const mod = match[2];
			return `${modifiers[mod]}{${target}}`;
		},
		options: "rmA",
	},

	// Prefix Modifiers (e.g., '~ -> \tilde{$0}$1)
	{
		trigger: /(?<![\w\\])'([~T\^H\-O\.:_v\}\]ocbrtsafm])/,
		replacement: match => {
			const mod = match[1];
			return `${modifiers[mod]}{$0}$1`;
		},
		options: "rmA",
	},

	// Prefix Modifier Pairs (e.g., '( -> \left( $0 \right) $1)
	{ trigger: /(?<![\w\\])'\(/, replacement: "\\left( $0 \\right) $1", options: "rmA" },
	{ trigger: /(?<![\w\\])'\[/, replacement: "\\left[ $0 \\right] $1", options: "rmA" },
	{ trigger: /(?<![\w\\])'\{/, replacement: "\\left\\{ $0 \\right\\} $1", options: "rmA" },
	{ trigger: /(?<![\w\\])'</, replacement: "\\left\\langle $0 \\right\\rangle $1", options: "rmA" },
	{ trigger: /(?<![\w\\])'\|/, replacement: "\\left| $0 \\right| $1", options: "rmA" },
	{ trigger: /(?<![\w\\])'\\\|/, replacement: "\\left\\| $0 \\right\\| $1", options: "rmA" },

	// Dynamic Semicolon Symbols
	...semicolon_snippets,
];
