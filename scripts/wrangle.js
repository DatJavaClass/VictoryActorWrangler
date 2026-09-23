/* Scan every scene: broken tokens, duplicate actors, unused actors. Merge and sweep. */
import { MODULE_ID, norm, isTemplate } from './store.js';

const tokensOf = (id) => game.scenes.map((s) => s.tokens.filter((t) => t.actorId === id).map((t) => ({ scene: s, token: t }))).flat();
const playerOwned = (a) => game.users.some((u) => !u.isGM && (a.testUserPermission(u, 'OWNER') || u.character?.id === a.id));

/* Stat block fingerprint; live hp and volatile bits stripped. */
export function fingerprint(a) {
  const sys = foundry.utils.deepClone(a.system ?? {});
  for (const p of ['attributes.hp.value', 'attributes.hp.temp', 'attributes.hp.nonlethal', 'attributes.wounds.value', 'attributes.vigor.value', 'currency']) foundry.utils.setProperty(sys, p, undefined);
  const items = a.items.map((i) => `${i.type}|${i.name}|${i.system?.quantity ?? ''}`).sort();
  const str = JSON.stringify({ t: a.type, sys, items }); let h = 0; for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; return h; /* djb style, good enough */
}

/* One report object; nothing is changed. */
export function scan({ libraryOnly = false, names = new Set() } = {}) {
  const broken = game.scenes.map((s) => ({ scene: s.name, sceneId: s.id, tokens: s.tokens.filter((t) => !t.actor).map((t) => ({ id: t.id, name: t.name })) })).filter((r) => r.tokens.length);
  const use = {}; for (const s of game.scenes) for (const t of s.tokens) use[t.actorId] = (use[t.actorId] ?? 0) + 1;
  const pool = game.actors.filter((a) => !isTemplate(a) && (!libraryOnly || names.has(norm(a.name))));
  const unused = pool.filter((a) => !use[a.id] && !playerOwned(a)).map((a) => ({ id: a.id, name: a.name, type: a.type, folder: a.folder?.name ?? '', img: a.img })).sort((x, y) => x.name.localeCompare(y.name) || x.folder.localeCompare(y.folder));
  const groups = {}; for (const a of pool) (groups[norm(a.name)] ??= []).push(a);
  const dupes = Object.values(groups).filter((g) => g.length > 1).map((g) => {
    const fps = new Set(g.map(fingerprint)), rows = g.map((a) => ({ id: a.id, name: a.name, type: a.type, folder: a.folder?.name ?? '', tokens: use[a.id] ?? 0, owned: playerOwned(a), src: a._stats?.compendiumSource ?? a.flags?.core?.sourceId ?? '' })).sort((x, y) => y.tokens - x.tokens);
    return { name: g[0].name, identical: fps.size === 1, keeper: rows[0].id, rows };
  }).sort((x, y) => x.name.localeCompare(y.name));
  return { broken, unused, dupes, at: Date.now() };
}

export async function deleteBroken(sceneId, ids) { const s = game.scenes.get(sceneId); if (s && ids.length) await s.deleteEmbeddedDocuments('Token', ids); return ids.length; }

/* Every token of the others is rebuilt on the keeper, delta and all; then the others go. */
export async function merge(keeperId, otherIds) {
  const keeper = game.actors.get(keeperId); if (!keeper) return { tokens: 0, actors: 0 };
  let moved = 0;
  for (const oid of otherIds) {
    if (oid === keeperId) continue;
    for (const { scene, token } of tokensOf(oid)) {
      const data = token.toObject(); delete data._id; data.actorId = keeperId;
      if (data.actorLink) { data.actorLink = false; data.delta = { ...(data.delta ?? {}), img: token.actor?.img ?? data.delta?.img, system: token.actor?.system ? { attributes: { hp: token.actor.system.attributes?.hp } } : undefined }; } /* linked token keeps its hp as a delta */
      await scene.createEmbeddedDocuments('Token', [data]); await token.delete(); moved++;
    }
  }
  const gone = otherIds.filter((id) => id !== keeperId && game.actors.get(id));
  if (gone.length) await Actor.deleteDocuments(gone);
  return { tokens: moved, actors: gone.length };
}

export async function sweepActors(ids) { const ok = ids.filter((id) => { const a = game.actors.get(id); return a && !isTemplate(a) && !playerOwned(a) && !tokensOf(id).length; }); if (ok.length) await Actor.deleteDocuments(ok); return ok.length; }
