import copy
import unittest

from browser_publications import FDA, normalize_fda, normalize_epa, output_hash, assess


def record():
    return {'cells':['Medical gases','PDF','11/28/2025','CDER','CGMP','Draft','Yes','','FDA-2025-D-0001'],
            'links':[{'title':'Medical gases','url':FDA+'/medical-gases'},
                     {'title':'PDF','url':'https://www.fda.gov/media/123/download'},
                     {'title':'Docket','url':'https://www.regulations.gov/docket/FDA-2025-D-0001'}]}


class BrowserPublicationTests(unittest.TestCase):
    def test_guidance_is_not_merged_by_shared_docket_or_draft_title(self):
        a=record();b=copy.deepcopy(a);b['cells'][5]='Final';b['links'][0]['url']=FDA+'/medical-gases-final'
        rows=normalize_fda([a,b]);self.assertEqual(len(rows),2)
        self.assertEqual([r['guidance_status'] for r in rows],['Draft','Final'])
        self.assertEqual(rows[0]['docket_number'],rows[1]['docket_number'])
        self.assertFalse(rows[0]['reading_access_verified'])

    def test_empty_table_is_distinct_from_changed_or_invalid_table(self):
        self.assertEqual(normalize_fda([{'cells':['No matching records found'],'links':[]}]),[])
        for r in [dict(cells=['Access denied'],links=[]), {**record(),'links':[]}, {**record(),'cells':record()['cells'][:-1]}]:
            with self.assertRaises(ValueError):normalize_fda([r])

    def test_epa_native_key_is_not_query_or_display_rank(self):
        url='/Exe/ZyNET.exe/P101C1KZ.txt?Query=wastewater'
        row={'text':'1 832F21094 Wastewater brief 2021 1 Pages', 'links':[
            {'title':'832F21094','url':url}, {'title':'Wastewater brief','url':url}]}
        result=normalize_epa([row])[0]
        self.assertEqual(result['id'],'EPA-NEPIS:P101C1KZ')
        self.assertEqual(result['publication_year'],'2021')
        self.assertEqual(result['listed_pages'],1)
        changed=copy.deepcopy(row);changed['links'][1]['url']=url.replace('P101C1KZ','P101OTHER')
        with self.assertRaises(ValueError):normalize_epa([changed])
        with self.assertRaises(ValueError):normalize_epa([row,row])

    def test_browser_query_and_rendered_hash_are_required(self):
        rows=[record()];source={'id':'fda-guidance','query':{'adapter':'fda-guidance-ui'}}
        case={'id':'gases','expected_ids':[FDA+'/medical-gases'],'request':{'method':'GET','url':FDA,'ui_query':{'text':'gases'}}}
        observation={'source_id':'fda-guidance','outcome':'observed','initial_http':{'status':200},'endpoint':FDA,'visible_query':'gases','records':rows,'observed_output_sha256':output_hash(rows)}
        self.assertEqual(assess(source,case,observation)['verdict'],'verified')
        for change in [{'visible_query':'other'}, {'outcome':'failed'}, {'observed_output_sha256':'0'*64}, {'initial_http':{'status':403}}, {'endpoint':FDA+'/other'}]:
            self.assertEqual(assess(source,case,{**observation,**change})['verdict'],'unverified')
