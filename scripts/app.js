/* Library, Deploy and Wrangle tabs. */
import { MODULE_ID, L, F, CATS, FILLS, DICE, DIR, library, mutate, blank, clean, norm, nodes, deploy, sweep, audit, adopt, importTokens, migrate } from './store.js';
import { scan, merge, sweepActors, deleteBroken } from './wrangle.js';

const { ApplicationV2, DialogV2 } = foundry.applications.api;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const on = (root, evt, sel, fn) => root.addEventListener(evt, (ev) => {
  const t = ev.target.closest(sel); /* nearest match */

  if (t && root.contains(t)) fn(t, ev); /* entry: match inside root, exit: handler called */
}); /* delegated listener */
const btn = (act, inner, extra = '') => `<button type="button" data-act="${act}" ${extra}>${inner}</button>`;
const opt = (list, cur, label = (v) => v) => list.map((v) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${label(v)}</option>`).join('');
const thumb = (src) => src ? `<img class="thumb" src="${esc(src)}">` : '<span class="thumb none"><i class="fas fa-image"></i></span>';
const confirm = (title, content) => DialogV2.confirm({ window: { title }, content: `<p>${content}</p>`, rejectClose: false });

export class WranglerApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'vaw-app', classes: ['vaw'], window: { title: 'VAW.Title', resizable: true, minimizable: true }, position: { width: 560, height: 600 } };

  constructor(...args) {
    super(...args);
    this.tab = 'library';
    this.work = null; /* line being edited, live copy */
    this.ask = null; /* id awaiting delete confirm */
    this.pick = { cat: 'resource', id: '', count: 1, die: '1' };
    this.report = null; /* last scan */
    this.libOnly = false;
    this.checked = new Set(); /* unused actors ticked */
  }

  async _renderHTML() { return this.html(); }
  _replaceHTML(html, content) { const top = content.querySelector('[data-keep]')?.scrollTop ?? 0; content.innerHTML = html; const el = content.querySelector('[data-keep]'); if (el) el.scrollTop = top; } /* entry: keep node present, exit: scroll restored */
  _onFirstRender() { this.bind(this.element); }

  html() {
    const tabs = ['library', 'deploy', 'wrangle'].map((t) => `<a class="vtab ${this.tab === t ? 'on' : ''}" data-act="tab" data-tab="${t}">${L(`Tab.${t}`)}</a>`).join('');
    const body = { library: () => this.libraryTab(), deploy: () => this.deployTab(), wrangle: () => this.wrangleTab() }[this.tab]();
    return `<nav class="vtabs">${tabs}</nav><div class="body" data-keep="body">${body}</div>`;
  }

  /* Library */
  libraryTab() {
    const list = library(), rows = list.map((d) => this.work?.id === d.id ? this.editor() : this.card(d)).join('');
    const add = this.work && !list.some((d) => d.id === this.work.id) ? this.editor() : '';
    return `<div class="head">${btn('add', `<i class="fas fa-plus"></i> ${L('Add')}`)}${btn('import', `<i class="fas fa-file-import"></i> ${L('Import')}`, `title="${L('ImportHint')}"`)}${btn('vre', `<i class="fas fa-history"></i> ${L('ImportVRE')}`, `title="${L('ImportVREHint')}"`)}</div>
      <div class="list">${add}${rows || `<p class="empty">${L('Empty')}</p>`}</div>`;
  }

  card(d) {
    const ask = this.ask === d.id ? `<div class="ask">${L('DeleteAsk')} ${btn('remove', L('Delete'), `class="red" data-id="${d.id}"`)}${btn('cancel', L('Cancel'))}</div>` : '';
    return `<div class="card" data-id="${d.id}">${thumb(d.token)}<div class="meta"><div class="name">${esc(d.name)} <span class="cat">${L(`Cat.${d.cat}`)}</span></div>
      <div class="sub">${d.fill === 'gold' ? `${L('Fill.gold')}: ${d.gmin} to ${d.gmax} gp${d.joke ? ` (${d.joke}% ${L('Joke')})` : ''}` : d.fill === 'none' ? L('Fill.none') : `${L('Loot')}: ${esc(d.item?.name ?? L('LootMade'))} &middot; ${L('Base')} ${d.base}`}${d.cap ? ` &middot; ${L('Cap')} ${d.cap}` : ''}</div></div>
      <span class="tools">${btn('pen', '<i class="fas fa-pen"></i>', `class="ic" data-id="${d.id}"`)}${btn('trash', '<i class="fas fa-trash"></i>', `class="ic" data-id="${d.id}"`)}</span>${ask}</div>`; /* entry: fill kind, exit: subtitle text */
  }

  /* Name, art, loot by drop, yield. */
  editor() {
    const w = this.work, named = !!w.name.trim();
    return `<div class="card edit" data-edit="${w.id}">
      <div class="row"><label>${L('Name')}<input type="text" name="name" maxlength="60" value="${esc(w.name)}"></label>
        <label>${L('Category')}<select name="cat">${opt(CATS, w.cat, (c) => L(`Cat.${c}`))}</select></label></div>
      <div class="row art">${thumb(w.token)}<label>${L('Token')}<input type="text" name="token" value="${esc(w.token)}"></label>
        ${btn('browse', `<i class="fas fa-folder-open"></i> ${L('Browse')}`)}${btn('tokenize', `<i class="fas fa-user-circle"></i> ${L('Tokenize')}`, named ? '' : 'disabled')}</div>
      <div class="row"><label>${L('FillWith')}<select name="fill">${opt(FILLS, w.fill, (f) => L(`Fill.${f}`))}</select></label>
        ${w.fill === 'gold' ? `<label>${L('GoldMin')}<input type="number" name="gmin" min="0" value="${w.gmin}"></label><label>${L('GoldMax')}<input type="number" name="gmax" min="0" value="${w.gmax}"></label><label>${L('Joke')} <span class="hint">${L('JokeHint')}</span><input type="number" name="joke" min="0" max="100" value="${w.joke}"></label>` : ''}</div>
      ${w.fill === 'item' ? `<div class="row loot" data-drop><i class="fas fa-box-open"></i> ${L('Loot')}: <b>${esc(w.item?.name ?? L('LootMade'))}</b> <span class="hint">${L('LootDrop')}</span>${w.item ? btn('unloot', '<i class="fas fa-times"></i>', 'class="ic"') : ''}</div>` : ''}
      <div class="row">${w.fill === 'item' ? `<label>${L('Base')}<input type="number" name="base" min="1" max="999" value="${w.base}"></label>` : ''}
        <label>${L('Cap')} <span class="hint">${L('CapNone')}</span><input type="number" name="cap" min="0" max="99" value="${w.cap}"></label>
        <label class="check"><input type="checkbox" name="rotate" ${w.rotate ? 'checked' : ''}> ${L('Rotate')}</label></div>
      <div class="row foot">${btn('save', `<i class="fas fa-save"></i> ${L('Save')}`, 'class="gold"')}${btn('cancel', L('Cancel'))}</div></div>`;
  }

  /* Deploy */
  deployTab() {
    const p = this.pick, list = library().filter((d) => d.cat === p.cat);
    if (!list.some((d) => d.id === p.id)) p.id = list[0]?.id ?? ''; /* entry: stale pick, exit: first entry */
    const cats = CATS.map((c) => `<a class="ctab ${p.cat === c ? 'on' : ''}" data-act="cat" data-cat="${c}">${L(`Cat.${c}`)}</a>`).join('');
    const cur = list.find((d) => d.id === p.id), flat = cur?.cat === 'treasure' || cur?.fill !== 'item'; /* flat: treasure, non item */
    return `<nav class="ctabs">${cats}</nav>
      <div class="deploy">
        <div class="row pickrow">${thumb(cur?.token)}<label>${L('Tab.deploy')}<select name="id">${opt(list.map((d) => d.id), p.id, (id) => esc(list.find((d) => d.id === id).name))}</select></label></div>
        <div class="row"><label>${L('Count')}<input type="number" name="count" min="1" max="99" step="1" value="${p.count}"></label>
          <label>${L('Rich')} <span class="hint">${L('RichHint')}</span><select name="die" ${flat ? 'disabled' : ''}>${opt(DICE, flat ? '1' : p.die)}</select></label></div>
        <div class="row foot">${btn('place', `<i class="fas fa-map-marker-alt"></i> ${L('Place')}`, `class="gold" ${cur ? '' : 'disabled'}`)}${btn('close', L('Cancel'))}</div>
        <div class="row tools2">${btn('sweep', `<i class="fas fa-broom"></i> ${L('Sweep')}`)}${btn('audit', `<i class="fas fa-clipboard-list"></i> ${L('Audit')}`)}${btn('adopt', `<i class="fas fa-hands-helping"></i> ${L('Adopt')}`)}</div>
      </div>`;
  }

  /* Wrangle: scan, then three sections. */
  wrangleTab() {
    const r = this.report, head = `<div class="head">${btn('scan', `<i class="fas fa-search"></i> ${L('Scan')}`, `class="gold" title="${L('ScanHint')}"`)}<label class="check"><input type="checkbox" data-act="libonly" ${this.libOnly ? 'checked' : ''}> ${L('LibraryOnly')}</label></div>`;
    if (!r) return `${head}<p class="empty">${L('ScanEmpty')}</p>`; /* entry: no scan yet, exit: empty note */
    if (!r.broken.length && !r.dupes.length && !r.unused.length) return `${head}<p class="empty">${L('ScanClean')}</p>`; /* entry: nothing found, exit: clean note */
    const broken = r.broken.length ? `<h3>${L('Broken')} <span class="hint">${L('BrokenHint')}</span></h3>${r.broken.map((b) => `<div class="card slim"><div class="meta"><b>${esc(b.scene)}</b> <span class="sub">${b.tokens.map((t) => esc(t.name)).join(', ')}</span></div><span class="tools">${btn('broken', F('BrokenDelete', { n: b.tokens.length }), `class="red" data-scene="${b.sceneId}"`)}</span></div>`).join('')}` : '';
    const dupes = r.dupes.length ? `<h3>${L('Dupes')} <span class="hint">${L('DupesHint')}</span></h3>${r.dupes.map((g, gi) => `<div class="card slim col" data-group="${gi}"><div class="meta"><b>${esc(g.name)}</b> <span class="cat ${g.identical ? '' : 'warn'}">${L(g.identical ? 'Identical' : 'Divergent')}</span></div>
      ${g.rows.map((a) => `<label class="drow"><input type="radio" name="keep-${gi}" value="${a.id}" ${g.keeper === a.id ? 'checked' : ''}> <img class="mini" src="${esc(game.actors.get(a.id)?.img ?? '')}"> ${esc(a.folder || '/')} &middot; ${F('Tokens', { n: a.tokens })}${a.owned ? ` &middot; ${L('Owned')}` : ''}${a.src ? ` &middot; <span class="hint">${esc(a.src.split('.').slice(0, 2).join('.'))}</span>` : ''}</label>`).join('')}
      <div class="row foot">${btn('merge', `<i class="fas fa-compress-alt"></i> ${L('Merge')}`, `class="${g.identical ? 'gold' : ''}" data-group="${gi}"`)}</div></div>`).join('')}` : '';
    const n = this.checked.size, unused = r.unused.length ? `<h3>${L('Unused')} <span class="hint">${L('UnusedHint')}</span><span class="tools">${btn('checkall', L('All'), 'class="ic wide"')}${btn('checknone', L('None'), 'class="ic wide"')}</span></h3>
      <div class="ulist">${r.unused.map((a) => `<label class="urow"><input type="checkbox" data-act="tick" data-id="${a.id}" ${this.checked.has(a.id) ? 'checked' : ''}> <img class="mini" src="${esc(a.img)}"> ${esc(a.name)} <span class="hint">${esc(a.type)}${a.folder ? ` &middot; ${esc(a.folder)}` : ''}</span></label>`).join('')}</div>
      <div class="row foot">${btn('sweepside', `<i class="fas fa-broom"></i> ${F('SweepSidebar', { n })}`, `class="red" ${n ? '' : 'disabled'}`)}</div>` : '';
    return `${head}<div class="list">${broken}${dupes}${unused}</div>`;
  }

  bind(root) {
    on(root, 'click', '[data-act]:not(input)', (el) => this.act(el.dataset.act, el.dataset));
    on(root, 'change', 'input[data-act="tick"]', (el) => { el.checked ? this.checked.add(el.dataset.id) : this.checked.delete(el.dataset.id); this.render(); }); /* entry: tick toggled, exit: set updated, redraw */
    on(root, 'change', 'input[data-act="libonly"]', (el) => { this.libOnly = el.checked; if (this.report) this.act('scan'); }); /* entry: report shown, exit: rescan */
    on(root, 'change', '[data-group] input[type=radio]', (el) => { const g = this.report?.dupes[el.closest('[data-group]').dataset.group]; if (g) g.keeper = el.value; }); /* entry: group found, exit: keeper set */
    on(root, 'input', '[data-edit] [name]', (el) => { if (this.work) this.work[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); /* entry: editing, exit: field stored */
    on(root, 'change', '[data-edit] [name="fill"]', () => this.render()); /* redraw on fill change */
    on(root, 'change', '.deploy [name]', (el) => { this.pick[el.name] = el.value; this.render(); });
    root.addEventListener('dragover', (ev) => { if (ev.target.closest('[data-drop]')) ev.preventDefault(); }); /* entry: over drop zone, exit: drop allowed */
    root.addEventListener('drop', (ev) => { if (ev.target.closest('[data-drop]')) this.dropItem(ev); }); /* entry: dropped on zone, exit: item taken */
    root.addEventListener('keydown', (ev) => { if (!ev.target.closest('[data-edit]')) return; if (ev.key === 'Enter' && ev.target.name === 'name') this.act('save'); if (ev.key === 'Escape') this.act('cancel'); }); /* entry: Enter on name or Escape, exit: save or cancel */
  }

  async act(act, ds = {}) {
    if (!game.user.isGM) return; /* entry: non GM, exit: return */

    const map = {
      tab: () => { this.tab = ds.tab; this.ask = null; },
      cat: () => { this.pick.cat = ds.cat; },
      add: () => { this.work = blank(); this.ask = null; },
      pen: () => { this.work = foundry.utils.deepClone(library().find((d) => d.id === ds.id)); this.ask = null; },
      trash: () => { this.ask = ds.id; },
      cancel: () => { if (this.ask) this.ask = null; else this.work = null; }, /* entry: cancel, exit: ask closed, else edit dropped */
      remove: () => this.remove(ds.id),
      save: () => this.save(),
      unloot: () => { if (this.work) this.work.item = null; }, /* entry: editing, exit: loot cleared */
      browse: () => this.browse(),
      tokenize: () => this.tokenize(),
      import: () => this.import(),
      vre: async () => { /* force migrate, then notify */ const n = await migrate(true); ui.notifications[n < 0 ? 'warn' : 'info'](n < 0 ? L('ImportVRENone') : F('ImportVREDone', { n })); },
      place: () => this.place(),
      close: () => this.close(),
      sweep: () => this.sweep(),
      audit: () => this.audit(),
      adopt: () => this.adopt(),
      scan: () => { this.report = scan({ libraryOnly: this.libOnly, names: new Set(library().map((d) => norm(d.name))) }); this.checked.clear(); },
      checkall: () => { for (const a of this.report?.unused ?? []) this.checked.add(a.id); }, /* entry: each unused actor, exit: ticked */
      checknone: () => this.checked.clear(),
      broken: () => this.broken(ds.scene),
      merge: () => this.merge(ds.group),
      sweepside: () => this.sweepSidebar(),
    };
    if (!map[act]) return; /* entry: unknown action, exit: return */

    await map[act]();
    if (this.rendered) this.render(); /* entry: window open, exit: redraw */
  }

  async save() {
    const w = clean(this.work);
    if (!w.name) return ui.notifications.warn(L('NeedName')); /* entry: no name, exit: warned */
    if (!w.token) return ui.notifications.warn(L('NeedToken')); /* entry: no token, exit: warned */
    await mutate((l) => { const d = l.find((d) => d.id === w.id); if (d) Object.assign(d, w); else l.push(w); }); /* entry: line exists, exit: updated, else added */
    this.work = null;
  }

  async remove(id) { await mutate((l) => l.findSplice((d) => d.id === id)); this.ask = null; if (this.work?.id === id) this.work = null; } /* entry: editing removed line, exit: dropped */

  browse() {
    new FilePicker({ type: 'image', current: this.work.token || DIR, callback: (p) => { this.work.token = p; this.work.avatar ||= p; this.render(); } }).render(true);
  }

  /* Tokenizer names files, so name first. */
  tokenize() {
    if (!globalThis.Tokenizer?.launch) return ui.notifications.warn(L('NoTokenizer')); /* entry: no Tokenizer, exit: warned */
    const w = this.work, img = w.token || w.avatar || CONST.DEFAULT_TOKEN;
    Tokenizer.launch({ name: w.name, type: 'npc', disposition: 0, avatarFilename: w.avatar || img, tokenFilename: img, tokenUploadDirectory: DIR, avatarUploadDirectory: DIR }, (r) => { w.token = r.tokenFilename ?? w.token; w.avatar = r.avatarFilename ?? w.avatar; this.render(); });
  }

  async dropItem(ev) {
    ev.preventDefault();
    const data = TextEditor.getDragEventData(ev);
    if (data?.type !== 'Item' || !this.work) return; /* entry: non item or no work, exit: return */

    let item = null; /* dropped item */
    try { item = await fromUuid(data.uuid); } catch (e) { console.warn(`${MODULE_ID} | dropped uuid failed`, e); } /* entry: bad uuid, exit: logged */

    if (!item) return; /* entry: unresolved uuid, exit: return */

    const o = item.toObject(); delete o._id; o.system.quantity = 1;
    this.work.item = o; this.work.avatar ||= o.img;
    this.render();
  }

  /* Selection wins, else plain piles after confirm. */
  async import() {
    const API = game.itempiles.API, sel = canvas.tokens.controlled.map((t) => t.document);
    const all = canvas.scene.tokens.filter((t) => API.isValidItemPile(t) && API.getActorFlagData(t)?.type === 'pile' && !t.flags?.[MODULE_ID]?.res && !t.actor?.flags?.[MODULE_ID]?.template);
    if (!sel.length && !await confirm(L('Import'), F('ImportAll', { n: all.length }))) return; /* entry: none picked, declined, exit: return */
    ui.notifications.info(F('Imported', { n: await importTokens(sel.length ? sel : all) })); /* selection, else piles */
  }

  async place() {
    const d = library().find((x) => x.id === this.pick.id); /* picked line */

    if (!d) return ui.notifications.warn(L('NoPick')); /* entry: nothing picked, exit: warned */

    const count = Math.max(1, parseInt(this.pick.count) || 1), die = d.cat === 'treasure' || d.fill !== 'item' ? '1' : (DICE.includes(this.pick.die) ? this.pick.die : '1'); /* flat or valid die */
    this.minimize(); await deploy(d, count, die); this.maximize();
  }

  async sweep() {
    const n = nodes().length; /* node count */

    if (!n) return ui.notifications.info(L('AuditEmpty')); /* entry: no nodes, exit: info */
    if (!await confirm(L('Sweep'), F('SweepAsk', { n }))) return; /* entry: declined, exit: return */
    ui.notifications.info(F('Swept', { n: await sweep() }));
  }

  async audit() {
    const rows = audit(); /* per type rows */

    if (!rows.length) return ui.notifications.info(L('AuditEmpty')); /* entry: no rows, exit: info */

    const tr = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.n}</td><td>${r.total}</td><td>${r.min}${r.min !== r.max ? ` to ${r.max}` : ''}</td><td>${r.gold || ''}</td></tr>`).join('');
    const tot = rows.reduce((a, r) => ({ n: a.n + r.n, total: a.total + r.total, gold: a.gold + r.gold }), { n: 0, total: 0, gold: 0 });
    const table = `<table class="vaw-audit"><thead><tr><th>${L('Name')}</th><th>${L('Nodes')}</th><th>${L('Total')}</th><th>${L('Range')}</th><th>${L('Gold')}</th></tr></thead><tbody>${tr}<tr class="tot"><td>${L('Total')}</td><td>${tot.n}</td><td>${tot.total}</td><td></td><td>${tot.gold || ''}</td></tr></tbody></table>`;
    await DialogV2.wait({ window: { title: F('AuditTitle', { scene: canvas.scene.name }) }, content: table, rejectClose: false, buttons: [
      { action: 'export', label: L('Export'), icon: 'fas fa-comment', callback: () => ChatMessage.create({ content: `<b>${F('AuditTitle', { scene: canvas.scene.name })}</b>${table}`, whisper: ChatMessage.getWhisperRecipients('GM') }) },
      { action: 'close', label: L('Close'), icon: 'fas fa-times', default: true }] });
  }

  async adopt() {
    if (!await confirm(L('Adopt'), L('AdoptAsk'))) return; /* entry: declined, exit: return */
    ui.notifications.info(F('Adopted', { n: await adopt() }));
  }

  /* Wrangle actions rescan after. */
  async broken(sceneId) {
    const b = this.report?.broken.find((x) => x.sceneId === sceneId); /* broken scene row */

    if (!b) return; /* entry: stale report, exit: return */
    if (!await confirm(L('Broken'), F('BrokenAsk', { n: b.tokens.length, scene: b.scene }))) return; /* entry: declined, exit: return */
    await deleteBroken(sceneId, b.tokens.map((t) => t.id)); this.act('scan');
  }

  async merge(gi) {
    const g = this.report?.dupes[gi]; /* duplicate group */

    if (!g) return; /* entry: stale report, exit: return */
    const others = g.rows.filter((a) => a.id !== g.keeper).map((a) => a.id);
    if (!await confirm(L('Merge'), F('MergeAsk', { n: others.length, name: g.name }))) return; /* entry: declined, exit: return */
    const r = await merge(g.keeper, others);
    ui.notifications.info(F('Merged', { name: g.name, tokens: r.tokens, actors: r.actors })); this.act('scan');
  }

  async sweepSidebar() {
    const ids = [...this.checked]; /* ticked actor ids */

    if (!ids.length) return; /* entry: none ticked, exit: return */
    if (!await confirm(L('Unused'), F('SweepSidebarAsk', { n: ids.length }))) return; /* entry: declined, exit: return */
    ui.notifications.info(F('SweptSidebar', { n: await sweepActors(ids) })); this.act('scan');
  }
}
