// Offline directory/configuration snapshot. Imports never contact providers.
import {getAllLibraries} from '../../server/services/directory.js';
import {inventory} from '../../server/services/catalog-connectors/inventory.js';
import {readFileSync} from 'node:fs';
const entries=getAllLibraries();
const aliases=JSON.parse(readFileSync(new URL('../../server/data/discovered-catalogs.json',import.meta.url))).aliases||{};
for(const e of entries)for(const c of [e,...(e.alternateCatalogs||[])])for(const k of ['sourceConnectionId','networkConnectionId','researchId'])if(c[k])aliases[c[k]]=e.id;
console.log(JSON.stringify({inventory:inventory({country:'*'}),entries,aliases}));
