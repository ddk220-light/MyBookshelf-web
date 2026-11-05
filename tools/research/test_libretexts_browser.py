import unittest

from browser_publications import output_hash
from libretexts_browser import ENDPOINT, assess, normalize


class LibreTextsBrowserTests(unittest.TestCase):
    def test_native_library_identity_and_versions_not_invented(self):
        rows = normalize([{'title':'Calculus','url':ENDPOINT+'book/math-2417'},
                          {'title':'Calculus','url':ENDPOINT+'book/math-4149'}])
        self.assertNotEqual(rows[0]['id'], rows[1]['id'])
        self.assertEqual(normalize([{'title':'Calculus','url':ENDPOINT+'book/k12-177'}])[0]['id'], 'k12-177')
        self.assertIsNone(rows[0]['edition_or_version'])
        self.assertFalse(rows[0]['reading_access_verified'])

    def test_foreign_and_duplicate_ids_are_rejected(self):
        for url in ('https://other.org/book/math-2417', ENDPOINT+'book/math-2417?version=2', ENDPOINT+'projects/2417'):
            with self.assertRaises(ValueError):
                normalize([{'title':'Calculus','url':url}])
        row = {'title':'Calculus','url':ENDPOINT+'book/math-2417'}
        with self.assertRaises(ValueError):
            normalize([row,row])

    def test_integrity_scope_and_stale_dom_checks(self):
        records = [{'title':'Calculus','url':ENDPOINT+'book/math-2417'}]
        row = {'source_id':'libretexts','endpoint':ENDPOINT,'outcome':'observed',
               'observed_at':'2026-11-05T00:00:00Z','initial_http':{'status':200},
               'visible_query':'calculus','selected_tab':'Books173','final_url':ENDPOINT+'?search=calculus',
               'records':records,'observed_output_sha256':output_hash(records)}
        source = {'id':'libretexts','query':{'adapter':'libretexts-ui'}}
        case = {'id':'calculus','expected_ids':['math-2417'],
                'request':{'url':ENDPOINT,'method':'GET','ui_query':{'text':'calculus'}}}
        self.assertEqual(assess(source,case,row)['verdict'], 'verified')
        for change in ({'selected_tab':'Assets'}, {'observed_output_sha256':'bad'},
                       {'final_url':'https://other.org/?search=calculus'}, {'visible_query':'biology'}):
            self.assertEqual(assess(source,case,{**row,**change})['verdict'], 'unverified')
        # Matching native ID does not prove query relevance when UI failed to refresh.
        records[0]['title'] = 'Biology'
        row['observed_output_sha256'] = output_hash(records)
        self.assertIn('relevance', assess(source,case,row)['error'])


if __name__ == '__main__':
    unittest.main()
