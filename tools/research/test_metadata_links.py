import hashlib
import json
import unittest

from metadata_links import parse_madurai, parse_sugamya, parse_thoth, local_search, ENDPOINTS
from openstax_catalog import parse as parse_openstax, CATALOG as OPENSTAX


class MetadataLinkTests(unittest.TestCase):
    def test_tamil_components_share_native_work_and_bad_links_are_preserved(self):
        html = '''<html><table id="sortabletable"><tr><th>Work no.</th><th>Title</th><th>Author</th><th>Genre</th><th>PDF</th><th>Unicode</th></tr>
        <tr><td>2</td><td>ஆத்திசூடி<td>ஒளவையார்</td><td>poetry</td><td><a href="/pm_etexts/pdf/pm0002.pdf">pdf</a></td><td></td></tr>
        <tr><td>2</td><td>மூதுரை</td><td>ஒளவையார்</td><td>poetry</td><td><a href="/pm_etexts/pdf/pm0002pdf">bad</a></td><td></td></tr></table></html>'''
        rows = parse_madurai(html.encode())
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], '2')
        self.assertEqual(len(rows[0]['listed_formats']), 1)
        self.assertEqual(len(rows[0]['unresolved_format_links']), 1)
        self.assertEqual(local_search(rows, {'field': 'title', 'value': 'மூதுரை'}), rows)
        with self.assertRaises(ValueError):
            parse_madurai(html.replace('</html>', '').encode())

    def test_public_search_has_no_fabricated_native_id_or_book_link(self):
        url = ENDPOINTS['sugamya-public'] + '?txtboxSearch=science'
        body = b'''<input name="txtboxSearch" value="science"><table class="search-result-table"><tr><th scope="row">Science 1</th><td>Author</td><td>Publisher</td><td>Library</td><td><table><tr><td>DAISY</td></tr></table></td><td>English</td></tr></table>'''
        row = parse_sugamya(body, url)[0]
        self.assertIsNone(row['native_id'])
        self.assertTrue(row['id'].startswith('anonymous-metadata:'))
        self.assertEqual(row['landing_page'], url)
        other = parse_sugamya(body.replace(b'Library', b'Other Library'), url)[0]
        self.assertNotEqual(row['id'], other['id'])
        with self.assertRaises(ValueError):
            parse_sugamya(body, url.replace('science', 'math'))
        with self.assertRaises(ValueError):
            parse_sugamya(b'<html>Please log in</html>', url)
        empty = b'<input name="txtboxSearch" value="science">Total 0 books found'
        self.assertEqual(parse_sugamya(empty, url), [])

    def test_publisher_metadata_needs_correct_identity_but_not_pdf_access(self):
        row = {'workId': 'a28326e3-e86b-4e6c-8538-4ed0306d4259', 'workType': 'MONOGRAPH',
               'titles': [{'fullTitle': 'Test title'}], 'imprint': {'publisherId': 'publisher'},
               'landingPage': None, 'doi': 'https://doi.org/10.1234/test'}
        self.assertEqual(parse_thoth({'data': {'works': [row]}}, 'publisher')[0]['landing_page'], row['doi'])
        with self.assertRaises(ValueError):
            parse_thoth({'data': {'works': [row]}}, 'other')
        with self.assertRaises(ValueError):
            parse_thoth({'data': {'works': [{**row, 'doi': 'javascript:alert(1)'}]}}, 'publisher')
        with self.assertRaises(ValueError):
            parse_thoth({'errors': [{'message': 'bad request'}], 'data': {'works': []}}, 'publisher')

    def test_browser_links_preserve_edition_and_reject_corruption(self):
        links = [{'title': 'Calculus Volume 1', 'url': 'https://openstax.org/details/books/calculus-volume-1'},
                 {'title': 'Calculus Volume 2', 'url': 'https://openstax.org/details/books/calculus-volume-2'},
                 {'title': 'View online', 'url': 'https://openstax.org/books/calculus-volume-1/pages/1-introduction'},
                 {'title': 'Instructor resources', 'url': 'https://openstax.org/details/books/calculus-volume-1?Instructor'}]
        cap = {'outcome': 'observed', 'catalog_url': OPENSTAX, 'http_status': 200, 'links': links,
               'observed_output_sha256': hashlib.sha256(json.dumps(links, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()}
        rows = parse_openstax(cap)
        self.assertEqual([r['id'] for r in rows], ['calculus-volume-1', 'calculus-volume-2'])
        self.assertEqual(local_search(rows, {'field': 'title', 'value': 'absent'}), [])
        with self.assertRaises(ValueError):
            local_search(rows, {'field': 'full_text', 'value': 'calculus'})
        with self.assertRaises(ValueError):
            parse_openstax({**cap, 'observed_output_sha256': '0' * 64})


if __name__ == '__main__':
    unittest.main()
