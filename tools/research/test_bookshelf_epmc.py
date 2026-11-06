import copy
import hashlib
import json
import unittest
from urllib.parse import urlencode
from bookshelf_epmc import ENDPOINT, PREFIX, assess, parse, title_query


class BookshelfMetadataTests(unittest.TestCase):
    def setUp(self):
        self.row = {'source': 'MED', 'id': '30000273', 'bookid': 'NBK501214',
                    'title': 'Diazepam', 'hasBook': 'Y', 'isOpenAccess': 'Y',
                    'bookOrReportDetails': {'comprisingTitle': 'LactMed', 'yearOfPublication': 2006}}
        self.url = ENDPOINT + '?' + urlencode({'query': PREFIX + '"Diazepam"', 'format': 'json', 'pageSize': 3, 'resultType': 'core'})

    def body(self, rows=None, **extra):
        return json.dumps({'hitCount': 1, 'resultList': {'result': rows if rows is not None else [self.row]}, **extra}).encode()

    def test_contract_rejects_unfiltered_other_host_and_duplicates(self):
        self.assertEqual(title_query(self.url), 'Diazepam')
        for url in [self.url.replace('www.ebi.ac.uk', 'www.ncbi.nlm.nih.gov'), self.url + '&pageSize=100',
                    self.url.replace('HAS_BOOK', 'HAS_FT'), self.url.replace('pageSize=3', 'pageSize=100')]:
            with self.assertRaises(ValueError): title_query(url)

    def test_chapter_identity_does_not_infer_parent_or_reading(self):
        rows, summary = parse(self.body(), 'Diazepam')
        self.assertEqual(rows[0]['id'], 'NBK501214')
        self.assertEqual(rows[0]['index_record_id'], 'MED:30000273')
        self.assertEqual(rows[0]['record_kind'], 'chapter-or-entry')
        self.assertIsNone(rows[0]['parent_id'])
        self.assertFalse(rows[0]['reading_access_verified'])
        self.assertEqual(rows[0]['publication_details']['yearOfPublication'], 2006)
        self.assertEqual(summary['provider_hit_count'], 1)

    def test_nbk_book_identity(self):
        row = {**self.row, 'source': 'NBK', 'id': 'NBK501214', 'bookOrReportDetails': {}}
        self.assertEqual(parse(self.body([row]), 'Diazepam')[0][0]['record_kind'], 'book-or-report')

    def test_missing_native_ids_and_nonbook_open_flags_fail(self):
        for change in [{'bookid': ''}, {'bookid': '123'}, {'hasBook': 'N'}, {'isOpenAccess': 'N'},
                       {'id': 'bad-id'}, {'source': 'NBK'}, {'title': ''}]:
            with self.assertRaises(ValueError): parse(self.body([{**self.row, **change}]), 'Diazepam')

    def test_provider_broadening_is_filtered_without_changing_provider_total(self):
        rows, summary = parse(self.body(), 'Diazepams')
        self.assertEqual(rows, [])
        self.assertEqual(summary['provider_hit_count'], 1)
        self.assertEqual(summary['provider_page_count'], 1)

    def test_duplicates_and_unbounded_pages_fail(self):
        for rows in [[self.row, self.row], [self.row] * 4]:
            with self.assertRaises(ValueError): parse(self.body(rows), 'Diazepam')

    def test_empty_is_valid_not_a_verified_example(self):
        rows, summary = parse(self.body([], hitCount=0), 'Diazepam')
        self.assertEqual(rows, [])
        self.assertEqual(summary['provider_hit_count'], 0)

    def test_assess_requires_complete_hash_matched_response(self):
        case = {'id': 'test', 'request': {'method': 'GET', 'url': self.url}, 'expected_ids': ['NBK501214']}
        body = self.body()
        cap = {'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()}, 'observed_at': '2026-11-06'}
        source = {'id': 'ncbi-bookshelf', 'query': {'adapter': 'bookshelf-epmc'}}
        self.assertEqual(assess(source, case, cap, body)['verdict'], 'verified')
        for patch in [{'status': 403}, {'truncated': True}, {'sampled_bytes_sha256': '0' * 64}]:
            changed = copy.deepcopy(cap); changed['http'].update(patch)
            self.assertEqual(assess(source, case, changed, body)['verdict'], 'unverified')


if __name__ == '__main__':
    unittest.main()
