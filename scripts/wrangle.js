/* Scan scenes, merge duplicates, sweep unused actors. */
import { MODULE_ID, norm, isTemplate } from './store.js';

const tokensOf = (id) => game.scenes.map((s) => s.tokens.filter((t) => t.actorId === id).map((t) => ({ scene: s, token: t }))).flat();
const playerOwned = (a) => game.users.some((u) => !u.isGM && (a.testUserPermission(u, 'OWNER') || u.character?.id === a.id));

/* Stat block hash, volatile bits stripped. */
export function fingerprint(a) {
  const sys = foundry.utils.deepClone(a.system ?? {});
  for (const p of ['attributes.hp.value', 'attributes.hp.temp', 'attributes.hp.nonlethal', 'attributes.wounds.value', 'attributes.vigor.value', 'currency']) foundry.utils.setProperty(sys, p, undefined); /* entry: each volatile path, exit: cleared */
  const items = a.items.map((i) => `${i.type}|${i.name}|${i.system?.quantity ?? ''}`).sort();
  const str = JSON.stringify({ t: a.type, sys, items });
  let h = 0;

  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; /* entry: each char, exit: djb style hash */
  return h;
}

/* One report object; nothing is changed. */
export function scan({ libraryOnly = false, names = new Set() } = {}) {
  const broken = game.scenes.map((s) => ({ scene: s.name, sceneId: s.id, tokens: s.tokens.filter((t) => !t.actor).map((t) => ({ id: t.id, name: t.name })) })).filter((r) => r.tokens.length);
  const use = {};
  for (const s of game.scenes) for (const t of s.tokens) use[t.actorId] = (use[t.actorId] ?? 0) + 1; /* entry: each token, exit: per actor count */

  const pool = game.actors.filter((a) => !isTemplate(a) && (!libraryOnly || names.has(norm(a.name))));
  const unused = pool.filter((a) => !use[a.id] && !playerOwned(a)).map((a) => ({ id: a.id, name: a.name, type: a.type, folder: a.folder?.name ?? '', img: a.img })).sort((x, y) => x.name.localeCompare(y.name) || x.folder.localeCompare(y.folder));
  const groups = {};
  for (const a of pool) (groups[norm(a.name)] ??= []).push(a); /* entry: each actor, exit: grouped by name */

  const dupes = Object.values(groups).filter((g) => g.length > 1).map((g) => {
    const fps = new Set(g.map(fingerprint)), rows = g.map((a) => ({ id: a.id, name: a.name, type: a.type, folder: a.folder?.name ?? '', tokens: use[a.id] ?? 0, owned: playerOwned(a), src: a._stats?.compendiumSource ?? a.flags?.core?.sourceId ?? '' })).sort((x, y) => y.tokens - x.tokens);
    return { name: g[0].name, identical: fps.size === 1, keeper: rows[0].id, rows }; /* report row per name group */
  }).sort((x, y) => x.name.localeCompare(y.name));
  return { broken, unused, dupes, at: Date.now() };
}

export async function deleteBroken(sceneId, ids) { const s = game.scenes.get(sceneId); if (s && ids.length) await s.deleteEmbeddedDocuments('Token', ids); return ids.length; } /* entry: scene and ids present, exit: deleted */

/* Others' tokens rebuilt on keeper, then others deleted. */
export async function merge(keeperId, otherIds) {
  const keeper = game.actors.get(keeperId);
  let moved = 0; /* tokens recreated */

  if (!keeper) return { tokens: 0, actors: 0 }; /* entry: no keeper, exit: zeros */

  for (const oid of otherIds) { /* entry: each other actor, exit: its tokens moved */
    if (oid === keeperId) continue; /* entry: keeper itself, exit: skipped */
    for (const { scene, token } of tokensOf(oid)) { /* entry: each token, exit: recreated and deleted */
      const data = token.toObject(); delete data._id; data.actorId = keeperId;
      if (data.actorLink) { /* entry: linked, exit: unlinked with hp delta */ data.actorLink = false; data.delta = { ...(data.delta ?? {}), img: token.actor?.img ?? data.delta?.img, system: token.actor?.system ? { attributes: { hp: token.actor.system.attributes?.hp } } : undefined }; }
      await scene.createEmbeddedDocuments('Token', [data]); await token.delete(); moved++;
    }
  }
  const gone = otherIds.filter((id) => id !== keeperId && game.actors.get(id));
  if (gone.length) await Actor.deleteDocuments(gone); /* entry: actors remain, exit: deleted */
  return { tokens: moved, actors: gone.length };
}

export async function sweepActors(ids) { const ok = ids.filter((id) => { /* entry: each id, exit: deletable ids pass */ const a = game.actors.get(id); return a && !isTemplate(a) && !playerOwned(a) && !tokensOf(id).length; }); if (ok.length) await Actor.deleteDocuments(ok); return ok.length; } /* entry: eligible ids, exit: deleted */
