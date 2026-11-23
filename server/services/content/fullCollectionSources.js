// Explicit production integrations. No runtime research-registry imports or sample catalogs.
export const FULL_COLLECTION_SOURCES = {
  onet:{name:'O*NET occupation profiles',scope:'Complete O*NET 31.0 occupation catalog · title search · CC BY 4.0',kinds:['learning_resource'],method:'complete-catalog',mode:'snapshot'},
  'national-gallery-art':{name:'National Gallery of Art',scope:'Complete published artwork metadata export · title and artist search · snapshot 6 Nov 2026',kinds:['other'],method:'complete-catalog',mode:'snapshot'},
  'art-institute-chicago':{name:'Art Institute of Chicago',scope:'Complete published artwork metadata export · title and artist search · snapshot 6 Nov 2026',kinds:['other'],method:'complete-catalog',mode:'snapshot'},
  core:{name:'CORE',scope:'Search research titles across CORE · anonymous daily request limit applies',kinds:['article','report','thesis','other'],method:'core'},
  metmuseum:{name:'The Metropolitan Museum of Art',scope:'Search the museum collection · individual image rights apply',kinds:['other'],method:'met'},
  'free-kids-books':{name:'Free Kids Books',scope:'Search published books and posts across the site',kinds:['article'],method:'wordpress',host:'freekidsbooks.org'},
  'google-books':{name:'Google Books',scope:'Search the book catalog · previews, prices and reading access vary',kinds:['book'],method:'google'},
  appropedia:{name:'Appropedia',scope:'Search practical-knowledge articles across the wiki',kinds:['learning_resource'],method:'appropedia'},
  crossref:{name:'Crossref',scope:'Search registered scholarly titles · full text may require access',kinds:['article','book','chapter','report','preprint','other'],method:'crossref'},
  osti:{name:'OSTI',scope:'Search the scientific and technical research catalog',kinds:['report'],method:'osti'},
  'cleveland-museum-art':{name:'Cleveland Museum of Art',scope:'Search the museum collection · individual image rights apply',kinds:['other'],method:'cleveland'},
  'nasa-image-video-library':{name:'NASA Image and Video Library',scope:'Search image, video and audio metadata across the library',kinds:['other'],method:'nasa'},
  'federal-register':{name:'Federal Register',scope:'Search published rules, notices and presidential documents · check current legal status',kinds:['report'],method:'federal'},
  'internet-archive':{name:'Internet Archive',scope:'Search unrestricted text items across the archive · item rights vary',kinds:['book','article','other'],method:'archive'},
  'fao-publications':{name:'FAO publications',scope:'Search publication titles across the FAO repository',kinds:['report'],method:'fao'},
  'lever-press':{name:'Lever Press',scope:'Search the publisher’s full Fulcrum book catalog',kinds:['book'],method:'lever'},
  nalibali:{name:'Nal’ibali',scope:'Search the published story collection',kinds:['book'],method:'nalibali'},
  'la-referencia':{name:'LA Referencia',scope:'Search titles across the research repository network',kinds:['article','thesis','report','other'],method:'lareferencia'},
};
for(const config of Object.values(FULL_COLLECTION_SOURCES))Object.assign(config,{adapter:'full-collection',metadataDiscovery:true,mode:config.mode||'live'});
