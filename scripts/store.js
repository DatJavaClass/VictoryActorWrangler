/* Constants, settings, node actor, deploy, audit, migration. */
export const MODULE_ID = 'victory-actor-wrangler', LEGACY = 'victory-resources';
export const L = (k) => game.i18n.localize(`VAW.${k}`);
export const F = (k, d) => game.i18n.format(`VAW.${k}`, d);
export const CATS = ['resource', 'treasure'], FILLS = ['item', 'gold', 'none'], DICE = ['1', 'd4', 'd6', 'd8', 'd10', 'd12'], DIR = '[data] tokenizer/resource-nodes', NODE = 'Resource Node';
const GOLD = [[/small gold/i, 50, 500, 0], [/large gold/i, 5001, 10000, 1], [/gold stash/i, 501, 5000, 0]]; /* import presets */
const API = () => game.itempiles?.API;

export const library = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'library'));
export const save = (list) => game.settings.set(MODULE_ID, 'library', list);
export async function mutate(fn) { const l = library(); fn(l); await save(l); return l; }
export const blank = () => ({ id: foundry.utils.randomID(8), name: '', cat: 'resource', token: '', avatar: '', fill: 'item', item: null, base: 1, gmin: 50, gmax: 500, joke: 0, cap: 0, rotate: true });
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[!\s]+/g, '');
export const find = (name, list = library()) => list.find((d) => norm(d.name) === norm(name));
const int = (v, lo, dflt) => Math.max(lo, parseInt(v) || dflt);

export const clean = (d) => {
  const o = { ...d, name: String(d.name ?? '').replace(/!/g, '').trim().slice(0, 60), cat: CATS.includes(d.cat) ? d.cat : 'resource', fill: FILLS.includes(d.fill) ? d.fill : 'item', base: int(d.base, 1, 1), gmin: int(d.gmin, 0, 0), gmax: int(d.gmax, 0, 0), joke: Math.min(100, int(d.joke, 0, 0)), cap: int(d.cap, 0, 0), rotate: !!d.rotate }; /* sanitized copy */

  if (o.gmax < o.gmin) o.gmax = o.gmin; /* entry: max below min, exit: raised */
  return o;
};

export const stamp = (t) => t.flags?.[MODULE_ID]?.res ?? t.flags?.[LEGACY]?.res; /* old stamps count */
export const isTemplate = (a) => !!(a?.flags?.[MODULE_ID]?.template ?? a?.flags?.[LEGACY]?.template);
export const nodes = (scene = canvas.scene) => scene.tokens.filter((t) => stamp(t));
export const qty = (t) => t.actor?.items.reduce((a, i) => a + (Number(i.system?.quantity) || 0), 0) ?? 0;
export const gp = (t) => Number(t.actor?.system?.currency?.gp) || 0;

/* One actor, nodes are unlinked tokens. */
export async function template() {
  let a = game.actors.get(game.settings.get(MODULE_ID, 'template')) ?? game.actors.find(isTemplate);

  a ??= await Actor.create({ name: NODE, type: 'npc', img: 'icons/svg/item-bag.svg', prototypeToken: { actorLink: false, disposition: 0, displayName: CONST.TOKEN_DISPLAY_MODES.HOVER }, flags: { [MODULE_ID]: { template: true }, 'item-piles': { data: { enabled: true, type: 'pile' }, version: game.modules.get('item-piles')?.version } } }); /* entry: no actor, exit: created */
  if (game.settings.get(MODULE_ID, 'template') !== a.id) await game.settings.set(MODULE_ID, 'template', a.id); /* entry: stored id differs, exit: id saved */
  return a;
}

/* Fallback loot from name and art. */
export const makeItem = (d) => ({ name: d.name, type: 'loot', img: d.avatar || d.token || 'icons/svg/item-bag.svg', system: { subType: d.cat === 'treasure' ? 'treasure' : 'tradeGoods', quantity: 1, weight: { value: 1 }, price: 0, identified: true } });
export const stack = (d, n) => { const i = foundry.utils.deepClone(d.item ?? makeItem(d)); delete i._id; i.system.quantity = n; return i; };
export const strip = (i) => { const o = i.toObject(); delete o._id; return o; };

/* Snapped left click, null on cancel. */
export function click() {
  return new Promise((res) => {
    const done = (v) => { canvas.stage.off('pointerdown', h); document.removeEventListener('keydown', k); res(v); };
    const h = (ev) => {
      const b = ev.data?.button ?? ev.button; /* mouse button */

      if (b === 2) return done(null); /* entry: right click, exit: null */
      if (b === 0) done(canvas.grid.getTopLeftPoint(ev.data?.getLocalPosition?.(canvas.stage) ?? canvas.stage.toLocal(ev.global))); /* entry: left click, exit: snapped point */
    };
    const k = (ev) => {
      if (ev.key === 'Escape') done(null); /* entry: Escape key, exit: null */
    };

    canvas.stage.on('pointerdown', h); document.addEventListener('keydown', k);
  });
}

/* Gold roll for one stash. */
export const gold = (d) => Math.random() * 100 < d.joke ? '1cp' : `${d.gmin + Math.floor(Math.random() * (d.gmax - d.gmin + 1))}gp`; /* joke or range */

/* One node: token of the template, stamped, filled. */
export async function drop(d, pos, items, extra = {}, coin = '', scene = canvas.scene) {
  const base = await template();
  const data = (await base.getTokenDocument({ ...pos, name: d.name, rotation: d.rotate ? Math.floor(Math.random() * 360) : 0, texture: { src: d.token }, delta: { img: d.avatar || d.token }, flags: { [MODULE_ID]: { res: d.name } }, ...extra })).toObject();
  const [tok] = await scene.createEmbeddedDocuments('Token', [data]);

  if (items.length) await API().addItems(tok, items); /* entry: items given, exit: added */
  if (coin) await API().addCurrencies(tok, coin); /* entry: coin given, exit: added */
  return tok;
}

/* Click loop; cap counts stamped tokens already down. */
export async function deploy(d, count, die) {
  const left = d.cap ? d.cap - nodes().filter((t) => stamp(t) === d.name).length : Infinity; /* slots under cap */

  if (left <= 0) { ui.notifications.warn(F('CapHit', { name: d.name, cap: d.cap })); return 0; } /* entry: cap full, exit: zero placed */
  if (count > left) ui.notifications.warn(F('CapClamp', { name: d.name, n: left })); /* entry: count over cap, exit: warned */
  count = Math.min(count, left);

  let placed = 0; /* nodes dropped */

  for (let i = 0; i < count; i++) { /* entry: each click, exit: break on cancel */
    ui.notifications.info(F('Click', { i: i + 1, n: count, name: d.name }));

    const pos = await click(); /* snapped click */

    if (!pos) break; /* entry: click cancelled, exit: loop ends */

    const n = d.base + (die === '1' ? 0 : (await new Roll(`1${die}`).evaluate()).total); /* base plus die */

    await drop(d, pos, d.fill === 'item' ? [stack(d, n)] : [], {}, d.fill === 'gold' ? gold(d) : ''); placed++;
  }

  ui.notifications.info(F('Placed', { n: placed, name: d.name }));
  return placed;
}

export async function sweep(scene = canvas.scene) { const ids = nodes(scene).map((t) => t.id); if (ids.length) await scene.deleteEmbeddedDocuments('Token', ids); return ids.length; } /* entry: nodes found, exit: deleted */

/* Per type: count, yield, range, gold. */
export function audit(scene = canvas.scene) {
  const by = {};

  for (const t of nodes(scene)) { /* entry: each node, exit: folded into its type */
    const r = (by[stamp(t)] ??= { name: stamp(t), n: 0, total: 0, gold: 0, min: Infinity, max: 0 }), q = qty(t);

    r.n++; r.total += q; r.gold += gp(t); r.min = Math.min(r.min, q); r.max = Math.max(r.max, q);
  }

  return Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
}

/* Tokens in, library lines out. */
export async function importTokens(tokens) {
  const list = library(); /* working copy */
  let n = 0; /* lines touched */

  for (const t of tokens) { /* entry: each token, exit: line updated or added */
    if (!t.actor) continue; /* entry: no actor, exit: skipped */

    const first = t.actor.items.contents[0], item = first ? strip(first) : null, d = find(t.name, list);

    if (item) item.system.quantity = 1; /* entry: loot found, exit: quantity one */

    const g = GOLD.find(([re]) => re.test(t.name)), preset = g ? { fill: 'gold', gmin: g[1], gmax: g[2], joke: g[3] } : { fill: item ? 'item' : 'none' }; /* gold, item, or none */

    if (d) Object.assign(d, { token: t.texture.src, avatar: t.actor.img, item: item ?? d.item }); /* entry: known name, exit: refreshed, else added */
    else list.push(clean({ ...blank(), ...preset, name: t.name, cat: g || !item ? 'treasure' : 'resource', token: t.texture.src, avatar: t.actor.img, item, base: Number(first?.system?.quantity) || 1 }));
    n++;
  }

  await save(list); return n;
}

/* Old nodes become stamped tokens. */
export async function adopt(scene = canvas.scene) {
  let n = 0; /* nodes adopted */

  for (const t of [...scene.tokens]) { /* entry: each token, exit: replaced by stamped node */
    const d = !stamp(t) && t.actor && find(t.name); /* known unstamped line */

    if (!d) continue; /* entry: stamped or unknown, exit: skipped */

    const items = t.actor.items.map(strip), keep = { rotation: t.rotation, width: t.width, height: t.height, hidden: t.hidden, elevation: t.elevation };
    const c = t.actor.system?.currency ?? {}, coin = ['pp', 'gp', 'sp', 'cp'].filter((k) => c[k] > 0).map((k) => `${c[k]}${k}`).join(' ');

    await t.delete(); await drop(d, { x: t.x, y: t.y }, items, keep, coin, scene); n++;
  }

  return n;
}

/* Legacy settings and macro carry over. */
export async function migrate(force = false) {
  const doc = (k) => game.settings.storage.get('world').find((s) => s.key === `${LEGACY}.${k}`);
  const old = game.macros.find((m) => m.flags?.[LEGACY]?.macro);

  if (old) await old.update({ name: 'Victory Actor Wrangler', command: `game.modules.get('${MODULE_ID}').api.open();`, [`flags.${MODULE_ID}.macro`]: true, [`flags.${LEGACY}.-=macro`]: null }); /* entry: legacy macro, exit: converted */
  if (!doc('library') || (library().length && !force)) return -1; /* entry: nothing to pull or have, exit: -1 */

  let lines; try { const v = doc('library').value; lines = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { console.warn(`${MODULE_ID} | library migration failed`, e); return -1; } /* v12: already parsed */

  if (!Array.isArray(lines)) return -1; /* entry: not a list, exit: -1 */

  const tpl = doc('template')?.value; /* legacy template id */

  if (tpl && game.actors.get(tpl) && !game.settings.get(MODULE_ID, 'template')) await game.settings.set(MODULE_ID, 'template', tpl); /* entry: usable old template, exit: adopted */

  const list = library(); /* working copy */
  let n = 0; /* lines merged */

  for (const d of lines) { /* entry: each line, exit: merged or added */
    const cur = find(d.name, list); /* existing line */

    if (cur) Object.assign(cur, clean({ ...cur, ...d, id: cur.id })); else list.push(clean(d)); /* entry: exists, exit: merged, else added */
    n++;
  }

  await save(list); return n;
}
