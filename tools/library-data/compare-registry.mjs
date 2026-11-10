import {directorySnapshot} from './directory-snapshot.mjs';
import {loadLibraryRegistry,compareDirectory} from '../../server/services/library-registry.js';
const path=process.argv[2]||'/workspace/library-data/current/registry/library-registry.json';
const snapshot=directorySnapshot();
console.log(JSON.stringify(compareDirectory(loadLibraryRegistry(path),snapshot),null,2));
