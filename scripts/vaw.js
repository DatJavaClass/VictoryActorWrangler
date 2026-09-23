/* Settings, Actors tab button, scene control, hotbar macro, module API. */
import { MODULE_ID, L, library, mutate, deploy, sweep, audit, adopt, importTokens, template, migrate } from './store.js';
import { scan, merge, sweepActors, deleteBroken } from './wrangle.js';
import { WranglerApp } from './app.js';

let app = null;
const open = (tab) => { app ??= new WranglerApp(); if (tab) app.tab = tab; return app.render(true); };
const close = () => app?.rendered && app.close();

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'library', { scope: 'world', config: false, type: Array, default: [] });
  game.settings.register(MODULE_ID, 'template', { scope: 'world', config: false, type: String, default: '' });
});

/* Lasso button in the Actors tab header, GM only. */
Hooks.on('renderActorDirectory', (dir, html) => {
  if (!game.user.isGM) return;
  const el = html instanceof HTMLElement ? html : html[0], host = el.querySelector('.directory-header .header-actions') ?? el.querySelector('.directory-header .action-buttons') ?? el.querySelector('.directory-header') ?? el; /* v12 jQuery, v13 element */
  if (host.querySelector('.vaw-open')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'vaw-open'; b.innerHTML = `<i class="fas fa-hat-cowboy"></i> ${L('Open')}`;
  b.addEventListener('click', () => open('wrangle'));
  host.append(b);
});

/* Gem in the token tools opens straight to Deploy. */
Hooks.on('getSceneControlButtons', (controls) => {
  if (!game.user.isGM) return;
  controls.find((c) => c.name === 'token')?.tools.push({ name: 'vaw', title: L('Deploy'), icon: 'fas fa-gem', button: true, onClick: () => open('deploy') });
});

Hooks.on('updateSetting', (s) => { if (s.key === `${MODULE_ID}.library` && app?.rendered && !app.work) app.render(); });

/* Module API, migration, the one hotbar macro. */
Hooks.once('ready', async () => {
  game.modules.get(MODULE_ID).api = { open, close, library, mutate, deploy, sweep, audit, adopt, importTokens, template, scan, merge, sweepActors, deleteBroken };
  if (game.user.isGM) {
    await migrate();
    if (!game.macros.find((m) => m.flags?.[MODULE_ID]?.macro)) await Macro.create({ name: 'Victory Actor Wrangler', type: 'script', img: 'icons/svg/item-bag.svg', command: `game.modules.get('${MODULE_ID}').api.open();`, flags: { [MODULE_ID]: { macro: true } } });
  }
  Hooks.callAll('vaw.ready', game.modules.get(MODULE_ID).api);
});
