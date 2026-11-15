from probe import *
C=[('abuja2','University of Abuja alternate official indexed catalog','https://koha.uniabuja.edu.ng/'),('adeleke','Adeleke University','https://opac.adelekeuniversity.edu.ng/'),('minna','Federal University of Technology Minna','https://library.futminna.edu.ng/'),('futo','Federal University of Technology Owerri','https://library.futo.edu.ng/'),('fudutsinma','Federal University Dutsin Ma','http://elibrary.fudutsinma.edu.ng/'),('udusok','Usmanu Danfodiyo University','http://opac.udusok.edu.ng/'),('uniosun','Osun State University','http://opac.uniosun.edu.ng/'),('anchor','Anchor University','https://library.aul.edu.ng/')]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for d in ex.map(run,C):
  (ROOT/(d['id']+'.json')).write_text(json.dumps(d,indent=2)); print(json.dumps({k:v for k,v in d.items() if k not in ['robots_text','search_excerpt','catalog_links']}),flush=True)
