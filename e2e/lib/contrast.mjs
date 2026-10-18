/* global document, getComputedStyle, NodeFilter, innerHeight, innerWidth */
/**
 * Contrastul WCAG al fiecărui text vizibil față de fundalul lui efectiv (straturile semitransparente
 * se compun peste fundalul paginii). Întoarce textele sub prag, cu raportul și culorile.
 */
export const contrastOffenders = (page, root = "body", min = 4.5) => page.evaluate(({ root, min }) => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
  const over = (top, bottom) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1); };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pageBg = parse(getComputedStyle(document.documentElement).getPropertyValue("--bn-bg").trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`)) || [255, 255, 255, 1];
  const bgOf = (el) => { const layers = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); const c = parse(s.backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } } return layers.reverse().reduce((acc, c) => over(c, acc), pageBg); };
  const out = [];
  const scope = document.querySelector(root) || document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement; if (!el || seen.has(el) || !t.textContent.trim()) continue; seen.add(el);
    const r = el.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const s = getComputedStyle(el); if (s.visibility === "hidden" || Number(s.opacity) === 0 || el.closest("[aria-hidden=true]")) continue;
    if (el.closest(".bf-skip-link, .sr-only, .skip-link")) continue;
    const bg = bgOf(el); // gradientele de pe carduri sunt nuanțe ale culorii de fundal; se ia culoarea de sub ele
    let fg = parse(s.color); if (!fg) continue;
    let op = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const value = ratio(fg, bg);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
    if (value < (large ? 3 : min)) out.push(`${value.toFixed(2)} „${t.textContent.trim().slice(0, 40)}” ${s.color}`);
  }
  return out;
}, { root, min });
