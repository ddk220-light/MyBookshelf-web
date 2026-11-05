import hashlib
import unittest

from publication_catalogs import OSHA, FAA, parse_osha, parse_faa, search_faa, observed


def osha(query='asbestos', empty=False):
    head = f'<div class="view-publication-products"><form method="get" action="/publications/publication-products"><input name="publication_title" value="{query}"></form>'
    if empty:
        return (head + '<div class="view-empty">No results</div></div>').encode()
    return (head + '<div class="view-content"><div><strong>Asbestos Fact Sheet</strong>'
        '<span class="views-field-field-publication-id">(OSHA FS 3507 - <time datetime="2014-01-01">2014</time>)</span>'
        '<span class="views-field-field-language"><b>English:</b><a href="/pubs/3507.pdf">PDF</a></span>'
        '<span class="views-field-field-publication-id">(OSHA FS 3737 - <time datetime="2014-06-01">2014</time>)</span>'
        '<span class="views-field-field-language"><b>Español:</b><a href="/pubs/3737.pdf">PDF</a></span></div></div>'
        '<nav><a href="?publication_title=asbestos&amp;page=1">Next</a></nav></div>').encode()


def faa():
    return ('<table><caption>Reference Handbooks</caption><tr><th>Title</th><th>Publication Date</th>'
        '<th>Change/Add. Date</th></tr><tr><td><a href="/handbook">Airplane Flying Handbook (FAA-H-8083-3C)</a>'
        '<a href="/addendum.pdf">Airplane Flying Handbook Addendum</a></td><td>2021</td><td>October 2025</td></tr>'
        '<tr><td><a href="/weather">Aviation Weather Handbook</a></td><td>2026</td><td></td></tr></table>').encode()


class PublicationTests(unittest.TestCase):
    def test_osha_language_versions_keep_separate_ids_and_dates(self):
        data = parse_osha(osha(), 'asbestos')
        self.assertEqual(len(data['results']), 2)
        self.assertEqual([r['language'] for r in data['results']], ['English', 'Español'])
        self.assertEqual([r['publication_date'] for r in data['results']], ['2014-01-01', '2014-06-01'])
        self.assertEqual(data['published_page_links'], [OSHA + '?publication_title=asbestos&page=1'])
        self.assertFalse(any(r['reading_access_verified'] for r in data['results']))

    def test_osha_wrong_query_or_challenge_cannot_look_like_empty(self):
        for body in [b'<html>Please sign in</html>', osha('other'), osha().replace(b'view-content', b'changed-content')]:
            with self.assertRaises(ValueError):
                parse_osha(body, 'asbestos')
        self.assertEqual(parse_osha(osha(empty=True), 'asbestos')['results'], [])

    def test_pdf_language_page_anchor_is_preserved(self):
        body = osha().replace(b'/pubs/3737.pdf', b'/pubs/3507.pdf#page=2')
        rows = parse_osha(body, 'asbestos')['results']
        self.assertEqual(len(rows), 2)
        self.assertTrue(rows[1]['id'].endswith('#page=2'))

    def test_external_link_or_missing_identity_rejected(self):
        for body in [osha().replace(b'/pubs/3507.pdf', b'https://other.example/p.pdf'),
                     osha().replace(b'views-field-field-publication-id', b'changed-field')]:
            with self.assertRaises(ValueError):
                parse_osha(body, 'asbestos')

    def test_faa_addenda_not_merged_and_shared_dates_not_invented(self):
        rows = parse_faa(faa())
        self.assertEqual(len(rows), 3)
        hits = search_faa(rows, {'mode': 'title_tokens', 'text': 'AIRPLANE flying'})
        self.assertEqual(len(hits), 2)
        self.assertEqual(hits[0]['publication_number_in_title'], ['FAA-H-8083-3C'])
        self.assertIn('shared listing row', hits[1]['date_scope'])
        self.assertEqual(rows[2]['listing_change_date'], None)

    def test_faa_schema_drift_duplicates_and_foreign_links_fail_closed(self):
        for body in [faa().replace(b'Change/Add. Date', b'Revision'),
                     faa().replace(b'/addendum.pdf', b'/handbook'),
                     faa().replace(b'/handbook', b'https://example.org/book')]:
            with self.assertRaises(ValueError):
                parse_faa(body)

    def test_faa_titles_are_not_body_search(self):
        rows = parse_faa(faa())
        for term in ['', 'zzznobook481276', 'turbulence']:
            self.assertEqual(search_faa(rows, {'mode': 'title_tokens', 'text': term}), [])
        self.assertEqual(len(search_faa(rows, {'mode': 'native_id', 'text': FAA.split('/regulations')[0] + '/weather'})), 1)
        with self.assertRaises(ValueError):
            search_faa(rows, {'mode': 'fulltext', 'text': 'weather'})

    def test_failed_truncated_wrong_hash_or_wrong_request_never_verifies(self):
        body = osha()
        case = {'id': 'test', 'expected_ids': ['https://www.osha.gov/pubs/3507.pdf'],
                'request': {'method': 'GET', 'url': OSHA, 'params': {'publication_title': 'asbestos'}}}
        source = {'id': 'osha-publications', 'query': {'adapter': 'osha-publications'}}
        http = {'url': OSHA + '?publication_title=asbestos', 'status': 200, 'truncated': False,
                'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()}
        self.assertEqual(observed(source, case, {'http': http, 'robots_evidence': {}}, body)['verdict'], 'verified')
        for change in [{'status': 403}, {'truncated': True}, {'sampled_bytes_sha256': '0' * 64},
                       {'url': OSHA + '?publication_title=other'}]:
            row = observed(source, case, {'http': {**http, **change}, 'robots_evidence': {}}, body)
            self.assertEqual(row['verdict'], 'unverified')
            self.assertTrue(row['error'])


if __name__ == '__main__':
    unittest.main()
