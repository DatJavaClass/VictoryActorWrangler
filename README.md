# Victory Actor Wrangler

Open your Actors tab. Count the Wild Experia. I had five, and I only ever made one.

# What is Victory Actor Wrangler?

Victory Actor Wrangler is a Foundry VTT module with two jobs, and the second one exists because of the first.

Job one is resource and treasure nodes. You keep a library of node types, ore, herbs, a gold stash, a locked box, each with its token art, what it holds, and how much. Then you click them onto a map. Every node on every scene is an unlinked token of one world actor, wearing the face and carrying the loot in its own pocket. Twenty node types, one actor in the sidebar. Players on weak machines will thank you, quietly, by not complaining.

Job two is the wrangling. It scans every scene and the whole Actors tab, then shows you three lists: tokens whose actor is gone, actors that share a name, and actors nothing on any map uses. Merge the duplicates onto one keeper. Sweep the rest.

It started as five macros in a folder called Resources. The one that placed nodes had a register once check, so it would import a resource actor from the compendium a single time and reuse it forever. Foundry 12 stopped writing the flag that check looked at. Every placement imported a fresh copy. Why a module? Because the fix was obvious and the cleanup was not, and I wanted the cleanup to be a button.

## Install

Paste this into Foundry's Install Module manifest field:

https://github.com/DatJavaClass/VictoryActorWrangler/releases/latest/download/module.json

Item Piles is required. Tokenizer is optional and worth having. Enable the module and a Wrangle button appears in the Actors tab header, a gem appears in the token tools, and a macro named Victory Actor Wrangler lands in your world. All three open the same window.

## Library

A line per node type. Name comes first, because Tokenizer names the file after it. Then the art: Browse picks an image you already have, Tokenize opens Tokenizer with the name filled in and takes the token it makes, using whatever frame you set as your default. Save needs a name and a token image, so a node can never come out blank.

| Field | What it does |
| --- | --- |
| Category | Resources or Treasures. Sets which tab the line lives on in Deploy |
| Fills with | A loot item, gold, or nothing (for things you fill by hand) |
| Loot | Drag an Item from the sidebar onto the box, or leave it and one is made from the name and art |
| Base yield | How many of the item a node holds before any roll |
| Gold min, max, joke % | Gold nodes roll flat between min and max. Joke is the chance it holds one copper instead |
| Cap per scene | Refuses to place past this count. 0 means no cap |
| Random rotation | On for rocks and plants, off for anything with an up |

Import Tokens reads selected tokens on the map into lines, art and loot included. Put one of everything on a sandbox scene, select them all, one click.

## Deploy

Pick a tab, pick a line, say how many, say how rich. How rich is 1, or a die from d4 to d12 that is rolled per node and added to base. Click Place, then click the map once per node. Right click or Escape stops early and keeps what is down.

Sweep Scene deletes every node the module placed on the current scene. Audit lists them by type with counts, yield and gold. Adopt Scene rebuilds nodes that were placed the old way, before the module, as proper stamped nodes with their contents and positions kept.

## Wrangle

Scan World reads everything and changes nothing. Then:

Broken tokens, per scene, with a delete button each. These are tokens whose actor was deleted out from under them. They cannot be opened, looted, or fought.

Duplicate actors, grouped by name. Each group is badged identical or divergent from a fingerprint of the stat block, ignoring current HP and coin. Pick the keeper, click Merge, and every token of the others is rebuilt on the keeper with its HP and inventory intact before the others are deleted. Identical groups get a gold button. Divergent ones still merge if you say so, but the button is not gold, and that is the module telling you to look first.

Unused actors, with no token on any scene and no player owner. Tick what goes, or tick All, and Sweep. The node actor, anything a player owns, and anything with a token somewhere are never on the list.

Library names only narrows the whole report to your resource names. Run that one first.

## API

`game.modules.get("victory-actor-wrangler").api` exposes `open(tab)`, `close()`, `library()`, `mutate(fn)`, `deploy(line, count, die)`, `sweep(scene)`, `audit(scene)`, `adopt(scene)`, `importTokens(tokens)`, `template()`, `scan(options)`, `merge(keeperId, otherIds)`, `sweepActors(ids)`, and `deleteBroken(sceneId, ids)`. The library is one world setting, an array of lines.

Built and Vibed with AI.
