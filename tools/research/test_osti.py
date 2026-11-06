import unittest
from source_registry import normalize


class OstiEvidence(unittest.TestCase):
    source = {'query': {'adapter': 'osti'}}

    def test_reported_fulltext_is_not_an_access_or_reuse_grant(self):
        rows = normalize(self.source, [{'osti_id': '123', 'title': 'Energy report',
                         'links': [{'rel': 'fulltext', 'href': 'https://www.osti.gov/servlets/purl/123'}]}])
        self.assertEqual(len(rows[0]['reported_fulltext_links']), 1)
        self.assertFalse(rows[0]['reading_access_verified'])
        self.assertIsNone(rows[0]['reuse_license'])

    def test_error_and_duplicate_identity_fail(self):
        record = {'osti_id': '123', 'title': 'Report'}
        for data in [{'statusCode': 404}, [record, record], [{'osti_id': '123x', 'title': 'Report'}]]:
            with self.assertRaises(ValueError):
                normalize(self.source, data)

    def test_version_and_dates_are_distinct_fields(self):
        rows = normalize(self.source, [{'osti_id': '123', 'title': 'Report', 'article_type': 'Accepted Manuscript',
                         'publication_date': '2020-01-01', 'entry_date': '2026-01-01'}])
        self.assertEqual(rows[0]['article_type'], 'Accepted Manuscript')
        self.assertNotEqual(rows[0]['publication_date'], rows[0]['entry_date'])
