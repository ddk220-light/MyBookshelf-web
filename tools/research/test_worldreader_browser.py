import copy
import hashlib
import json
import unittest
from urllib.parse import urlencode
from urllib.robotparser import RobotFileParser

from worldreader_browser import ENDPOINT, API, APP_SHELL_HASH, checked_case, parse, reviewed_policy, assess


class BookSmartMetadataTests(unittest.TestCase):
    def capture(self, query='cat'):
        data = {'totalCount': 3, 'count': 3, 'offset': 0, 'limit': 20, 'books': [
            {'uuid': '50c2fd60-05f6-4f01-a165-522ec16e8742', 'version': 1, 'title': 'A Cat Nap'},
            {'uuid': 'f9fe2849-5ddc-4709-8060-2d6878a1f870', 'version': 1, 'title': 'A Big Fan'},
            {'uuid': '67e98ce1-83ed-41a2-ab11-0d16ca2abe55', 'version': 2, 'title': 'Catalina'}]}
        return self.rehash({'api_url': API + '?' + urlencode({'project_id': '760', 'book_schema': 'bookShelf',
            'limit': 20, 'search': query, 'country': 'US', 'language': 'eng'}), 'metadata': data})

    def rehash(self, capture):
        capture['metadata_sha256'] = hashlib.sha256(json.dumps(capture['metadata'], ensure_ascii=False,
            separators=(',', ':')).encode()).hexdigest()
        return capture

    def test_native_identity_version_and_literal_relevance(self):
        rows = parse(self.capture(), 'cat')
        self.assertEqual([r['id'] for r in rows], ['50c2fd60-05f6-4f01-a165-522ec16e8742'])
        self.assertEqual(rows[0]['version'], 1)
        self.assertFalse(rows[0]['reading_access_verified'])
        self.assertNotIn('landing_page', rows[0])  # No invented book/reader URL.

    def test_tampered_metadata_fails(self):
        c = self.capture(); c['metadata']['books'][0]['title'] = 'Different title'
        with self.assertRaisesRegex(ValueError, 'hash'): parse(c, 'cat')

    def test_saved_sorted_jsonl_retains_verifiable_metadata(self):
        c = json.loads(json.dumps(self.capture(), sort_keys=True))
        self.assertEqual(len(parse(c, 'cat')), 1)

    def test_changed_query_country_language_or_project_fails(self):
        for before, after in [('search=cat','search=dog'), ('country=US','country=IN'),
                              ('language=eng','language=hin'), ('project_id=760','project_id=999'),
                              ('limit=20','limit=100')]:
            c = self.capture(); c['api_url'] = c['api_url'].replace(before, after)
            with self.subTest(after=after), self.assertRaises(ValueError): parse(c, 'cat')

    def test_duplicate_and_invalid_uuid_or_version_fail(self):
        for key, value in [('uuid','not-a-native-id'), ('uuid','f9fe2849-5ddc-4709-8060-2d6878a1f870'),
                           ('version',True), ('version',-1), ('title','')]:
            c = self.capture(); c['metadata']['books'][0][key] = value
            with self.subTest(key=key,value=value), self.assertRaises(ValueError): parse(self.rehash(c), 'cat')

    def test_paging_counts_and_empty_are_distinct(self):
        for key,value in [('count', 0), ('totalCount', 2), ('offset', 20), ('limit', 100)]:
            c=self.capture();c['metadata'][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):parse(self.rehash(c),'cat')
        c=self.capture();c['metadata'].update(books=[],count=0,totalCount=0)
        self.assertEqual(parse(self.rehash(c),'cat'),[])

    def test_policy_exception_is_exact_and_cannot_override_denials(self):
        proof={'status':200,'sampled_bytes_sha256':APP_SHELL_HASH,'truncated':False}
        self.assertTrue(reviewed_policy(False,proof,ENDPOINT))
        self.assertFalse(reviewed_policy(False,proof,API))
        for changed in [{'status':403},{'sampled_bytes_sha256':'0'*64},{'truncated':True}]:
            self.assertFalse(reviewed_policy(False,{**proof,**changed},ENDPOINT))
        p=RobotFileParser();p.parse(['User-agent: *','Disallow: /'])
        self.assertFalse(reviewed_policy(p,proof,ENDPOINT))

    def test_only_visible_form_shape_is_replayable(self):
        case={'query_text':'cat','request':{'method':'GET','url':ENDPOINT,'execution':'public-browser','form_query':'cat'}}
        self.assertEqual(checked_case(case),'cat')
        for key,value in [('method','POST'),('url',API),('execution','direct-api'),('form_query','dog')]:
            c=copy.deepcopy(case);c['request'][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):checked_case(c)


if __name__ == '__main__': unittest.main()
