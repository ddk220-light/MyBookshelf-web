import retiredSources from './retired-content-sources.json' with {type:'json'};
export const retiredContentSources = retiredSources;
export const isContentSourceRetired = id => Object.hasOwn(retiredSources, id);
export const localFreeSearchEnabled = ['gutenberg','open-textbook-library','bookdash','storyweaver'].some(id=>!isContentSourceRetired(id));
