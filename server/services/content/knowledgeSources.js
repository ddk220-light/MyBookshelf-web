import {isContentSourceRetired} from '../../../shared/content-source-availability.mjs';
import {FULL_COLLECTION_SOURCES} from './fullCollectionSources.js';
// Explicitly reviewed integrations, never runtime imports of research candidates.
export const KNOWLEDGE_SOURCES = {
  ...FULL_COLLECTION_SOURCES,
  'open-book-publishers': {name:'Open Book Publishers',scope:'Scholarly book titles · open publisher metadata and links',kinds:['book'],adapter:'thoth',publisherId:'85fd969a-a16c-480b-b641-cb9adf979c3b',hosts:['www.openbookpublishers.com'],metadataDiscovery:true},
  'helsinki-university-press': {name:'Helsinki University Press',scope:'Scholarly book titles · publisher metadata and DOI links',kinds:['book'],adapter:'thoth',publisherId:'7c0b2d93-3264-4d83-beb5-7c18898d995a',hosts:['hup.fi'],metadataDiscovery:true},
  'project-madurai': {name:'Project Madurai',scope:'Tamil title catalog · 1,149 published work labels · snapshot 6 Nov 2026',kinds:['book'],adapter:'metadata-catalog',mode:'snapshot',metadataDiscovery:true},
  openstax: {name:'OpenStax',scope:'16 Math textbooks · titles and edition links · snapshot 6 Nov 2026',kinds:['book'],adapter:'metadata-catalog',mode:'snapshot',metadataDiscovery:true},
  'sugamya-pustakalaya': {name:'Sugamya Pustakalaya',scope:'Public book search · first 5 matches · eligible membership needed to read',kinds:['book'],adapter:'sugamya',metadataDiscovery:true},
  wikipedia: {name:'Wikipedia',scope:'Reference articles · English, Hindi and Tamil',kinds:['article'],languages:['en','hi','ta'],blocked:'The reviewed search route is excluded by robots policy; integration awaits a permitted contract.',adapter:'wiki',project:'wikipedia'},
  wikibooks: {name:'Wikibooks',scope:'Collaborative textbooks and chapters · may be incomplete',kinds:['learning_resource','chapter'],languages:['en','hi','ta'],blocked:'The reviewed search route is excluded by robots policy; integration awaits a permitted contract.',adapter:'wiki',project:'wikibooks'},
  wikisource: {name:'Wikisource',scope:'Historical texts and transcriptions · check edition and completeness',kinds:['learning_resource','chapter'],languages:['en','hi','ta'],blocked:'The reviewed search route is excluded by robots policy; integration awaits a permitted contract.',adapter:'wiki',project:'wikisource'},
  gdl: {name:'Global Digital Library',scope:'Children’s reading · title search',kinds:['book'],languages:['en','hi','ta'],adapter:'gdl'},
  librivox: {name:'LibriVox',scope:'Volunteer audiobooks · title search · US public-domain recordings',kinds:['audiobook'],adapter:'librivox'},
  loc: {name:'Library of Congress',scope:'Digitized books · item rights and access vary',kinds:['book'],adapter:'loc'},
  bhl: {name:'Biodiversity Heritage Library',scope:'Natural history books in the Internet Archive biodiversity collection',kinds:['book'],adapter:'bhl'},
  'african-minds': {name:'African Minds',scope:'Open scholarly books · metadata via Thoth',kinds:['book'],adapter:'thoth',publisherId:'b61217e4-3134-4bfe-8695-30e047ed3f57',hosts:['books.africanminds.co.za']},
  'lse-press': {name:'LSE Press',scope:'Open social-science books · metadata via Thoth',kinds:['book'],adapter:'thoth',publisherId:'5da5617c-306b-4f68-b60b-abc74faf49f8',hosts:['books.press.lse.ac.uk','press.lse.ac.uk']},
  'mattering-press': {name:'Mattering Press',scope:'Open social-science books · metadata via Thoth',kinds:['book'],adapter:'thoth',publisherId:'17d701c1-307e-4228-83ca-d8e90d7b87a6',hosts:['books.matteringpress.org','www.matteringpress.org']},
  'mediastudies-press': {name:'mediastudies.press',scope:'Open media scholarship · metadata via Thoth',kinds:['book'],adapter:'thoth',publisherId:'4ab3bec2-c491-46d4-8731-47a5d9b33cc5',hosts:['books.mediastudies.press','www.mediastudies.press']},
  'punctum-books': {name:'punctum books',scope:'Open humanities books · metadata via Thoth',kinds:['book'],adapter:'thoth',publisherId:'9c41b13c-cecc-4f6a-a151-be4682915ef5',hosts:['books.punctumbooks.com']},
  'python-docs': {name:'Python documentation',scope:'Python 3.15 · names of documented functions, classes and modules',kinds:['learning_resource'],languages:['en'],adapter:'python'},
};
export const LOCAL_CONTENT_SOURCES=['gutenberg','open-textbook-library','bookdash','storyweaver'];
export const PAPER_CONTENT_SOURCES=['europepmc','openalex','arxiv','doaj'];
export const ALL_CONTENT_SOURCES=[...LOCAL_CONTENT_SOURCES,...PAPER_CONTENT_SOURCES,...Object.keys(KNOWLEDGE_SOURCES)];
export function publicKnowledgeSources(enabled) {
  return Object.entries(KNOWLEDGE_SOURCES).filter(([id])=>!isContentSourceRetired(id)).map(([id,{name,scope,kinds,languages,blocked,mode}])=>({id,name,scope,kinds,languages:languages||[],mode:mode||'live',enabled:enabled&&!blocked,...blocked?{reason:blocked}:{}}));
}
