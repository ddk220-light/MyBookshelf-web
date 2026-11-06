import hashlib
import unittest
from unittest.mock import patch

from nhm_nuhm_catalog import ENDPOINT, parse, search, assess, probe


def link(title='ANM_Guidebook_under_NUHM', path='/sites/default/files/2021-06/8.ANM_Guidebook_under_NUHM.pdf '):
    return f'<tr><td><a href="{path}">{title}</a>(100 KB)</td></tr>'


def page(content=None):
    return ('<html><h3>NUHM Notification</h3><table>'+link('not guidelines')+'</table>'
            '<h3><a href="#guidelines">NUHM Guidelines</a></h3><div><table>'+(content if content is not None else link())+
            '</table></div><h3>NUHM Brochures</h3><table>'+link('brochure')+'</table></html>').encode()


class NUHMCatalogTests(unittest.TestCase):
    def test_only_named_guideline_section_and_provider_identity(self):
        data = parse(page())
        self.assertEqual(len(data['records']), 1)
        item = data['records'][0]
        self.assertEqual(item['title'], 'ANM_Guidebook_under_NUHM')
        self.assertEqual(item['id'], 'https://nhsrcindia.org/sites/default/files/2021-06/8.ANM_Guidebook_under_NUHM.pdf')
        self.assertFalse(item['reading_access_verified'])
        self.assertEqual(data['excluded'], [])

    def test_literal_tokens_underscores_and_empty_control(self):
        rows = parse(page())['records']
        self.assertEqual(search(rows, {'field': 'title', 'value': 'ANM guidebook'}), rows)
        self.assertEqual(search(rows, {'field': 'title', 'value': 'guide'}), [])
        self.assertEqual(search(rows, {'field': 'title', 'value': 'qzxnevermatch2026'}), [])
        self.assertEqual(search(rows, {'field': 'id', 'value': rows[0]['id']}), rows)

    def test_duplicate_file_identity_is_quarantined_without_edition_merge(self):
        data = parse(page(link()+link('different edition')+link('Good edition', '/sites/default/files/2026-10/version%202.pdf')))
        self.assertEqual([r['title'] for r in data['records']], ['Good edition'])
        self.assertTrue(data['records'][0]['id'].endswith('version%202.pdf'))
        self.assertEqual(len(data['excluded']), 2)

    def test_unsafe_or_unpublished_identity_rejected(self):
        for bad in ['https://other.example/book.pdf', '//other.example/book.pdf',
                    '/search/node?keys=books', '/sites/default/files/2021-06/book.pdf?x=1',
                    '/sites/default/files/2021-06/book%2Fsecret.pdf',
                    '/sites/default/files/2021-06/book%0A.pdf', 'http://nhsrcindia.org/sites/default/files/2021-06/x.pdf']:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse(page(link(path=bad)))

    def test_incomplete_and_duplicate_section_fail(self):
        for body in [page()[:-7], page().replace(b'NUHM Guidelines', b'Other publications'),
                     page().replace(b'NUHM Brochures', b'NUHM Guidelines'),
                     page().replace(b'</table></div>', b'</div>')]:
            with self.assertRaises(ValueError):
                parse(body)

    def test_hash_mismatch_failure_is_not_a_passing_example(self):
        body = page()
        item = parse(body)['records'][0]
        case = {'id': 'anm', 'request': {'method': 'GET', 'url': ENDPOINT, 'local_query': {'field': 'title', 'value': 'ANM'}}, 'expected_ids': [item['id']]}
        source = {'id': 'nhm-guidelines', 'query': {'adapter': 'nhm-nuhm-catalog'}}
        cap = {'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()}}
        self.assertEqual(assess(source, case, cap, body)['verdict'], 'verified')
        cap['http']['sampled_bytes_sha256'] = 'mismatch'
        result = assess(source, case, cap, body)
        self.assertEqual(result['verdict'], 'unverified')
        self.assertIn('Mismatched', result['error'])

    def test_disallowing_policy_prevents_catalog_request(self):
        with patch('nhm_nuhm_catalog.robots', return_value=(False, {})), patch('nhm_nuhm_catalog.request') as fetch:
            probe({'id': 'nhm-guidelines', 'query': {'endpoint': ENDPOINT, 'cases': []}})
            fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
