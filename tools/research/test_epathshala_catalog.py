import unittest
from epathshala_catalog import literal_array,parse,search

class EpathshalaMetadataTest(unittest.TestCase):
    def test_comments_are_history_and_not_executed(self):
        array,comments=literal_array('const books = [["Title /* literal */", "a"] /* ["inactive"] */]; next();','books')
        self.assertEqual(array,[["Title /* literal */","a"]]);self.assertEqual(comments,[' ["inactive"] '])
        with self.assertRaises(ValueError):literal_array('const books = [execute()];','books')
        with self.assertRaises(ValueError):literal_array('const books = [] + other;','books')
        with self.assertRaises(ValueError):literal_array('const books = [/*unclosed','books')

    def test_native_contexts_conflicts_and_inactive_rows(self):
        body=b'''<html><select id="class"></select><select id="book"></select><script>const subjects = [[["C1S1","English"]],[["C2S1","English"]]];
        const books = [[["C1S1","Title","a101"],["C2S1","Title","a101"],["C1S1","Other","b101"],["C2S1","Different","b101"],["C2S9e","Unmapped","c101"]] /* [["C1S1","Old","old101"]] */];
        x="/wp-content/doc/book/flipbook/"+pre+".html";</script></html>'''
        out=parse(body);self.assertEqual([r['id'] for r in out['records']],['a101'])
        self.assertEqual(len(out['records'][0]['contexts']),2);self.assertIn('b101',out['conflicting_native_ids']);self.assertEqual(out['unresolved_context_rows'][0]['native_id'],'c101')
        self.assertEqual(search(out['records'],{'field':'title','value':'Title','class_selector':2})[0]['id'],'a101')
        self.assertEqual(search(out['records'],{'field':'title','value':'Title','class_selector':3}),[])
        self.assertEqual(search(out['records'],{'field':'title','value':'Old','class_selector':None}),[])
        with self.assertRaises(ValueError):parse(body.replace(b'</html>',b''))
