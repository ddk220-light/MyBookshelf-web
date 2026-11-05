import hashlib
import unittest

from learning_catalogs import ENDPOINTS, assess, parse, search


def course(native='101101079', title='Aerospace Engineering'):
    return (f'<div class="course-card"><a href="/courses/{native}">Course</a>'
            f'<div class="name">{title}</div><div class="discipline">Engineering</div>'
            '<div class="meta-data"><span>Instructor</span><span>IIT</span></div></div>')


def catalog(*cards):
    return ('<div class="course-list">'+''.join(cards)+'</div>').encode()


class LearningCatalogTests(unittest.TestCase):
    def test_same_title_distinct_ids_and_exact_duplicates(self):
        p = parse(catalog(course(), course('101101080'), course()), 'nptel-catalog')
        self.assertEqual(p['visible_catalog_rows'], 3)
        self.assertEqual(len(p['results']), 2)
        self.assertEqual(len(search(p['results'], {'mode': 'title_tokens', 'text': 'engineering aerospace'})), 2)
        self.assertIsNone(p['results'][0]['semester_or_version'])

    def test_conflicting_id_is_quarantined_not_arbitrarily_selected(self):
        p = parse(catalog(course(), course(title='Different title'), course('101101080')), 'nptel-catalog')
        self.assertEqual([r['id'] for r in p['results']], ['101101080'])
        self.assertEqual(len(p['conflicting_native_ids']['101101079']), 2)

    def test_title_only_search_and_empty_queries(self):
        rows = parse(catalog(course()), 'nptel-catalog')['results']
        for q in ('', 'Instructor', 'engineeringzzz', 'गणित'):
            self.assertEqual(search(rows, {'mode': 'title_tokens', 'text': q}), [])
        self.assertEqual(search(rows, {'mode': 'native_id', 'text': '101101079'})[0]['id'], '101101079')
        with self.assertRaises(ValueError):
            search(rows, {'mode': 'full_text', 'text': 'Engineering'})

    def test_schema_changes_and_foreign_ids_fail(self):
        for body in (catalog(course()).replace(b'/courses/101101079', b'https://other.org/courses/101101079'),
                     catalog(course()).replace(b'class="name"', b'class="renamed"'),
                     catalog()):
            with self.assertRaises(ValueError):
                parse(body, 'nptel-catalog')

    def test_book_catalog_preserves_project_identity_not_access_claim(self):
        body = b'<ul class="all-books__list"><li class="all-books__list-item" data-book-type="technical"><h3><a href="/book/native-project/">Cloud Native</a></h3><div class="book__organization">Publisher</div><span class="book__look-inside">Look inside</span></li></ul>'
        row = parse(body, 'booksprints-catalog')['results'][0]
        self.assertEqual(row['id'], 'https://www.booksprints.net/book/native-project/')
        self.assertTrue(row['look_inside_badge'])
        self.assertFalse(row['reading_access_verified'])
        with self.assertRaises(ValueError):
            parse(body.replace(b'/book/native-project/', b'/book/native-project/?edition=2'), 'booksprints-catalog')

    def test_capture_integrity_and_conflict_not_an_absence(self):
        body = catalog(course(), course(title='Different title'))
        url = ENDPOINTS['nptel-catalog']
        source = {'id': 'nptel', 'query': {'adapter': 'nptel-catalog'}}
        case = {'id': 'test', 'expected_ids': ['101101079'], 'request': {'method': 'GET', 'url': url,
                'local_query': {'mode': 'native_id', 'text': '101101079'}}}
        cap = {'observed_at': '2026-11-05T00:00:00Z', 'robots_evidence': {},
               'http': {'url': url, 'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()}}
        obs = assess(source, case, cap, body)
        self.assertIn('conflicting catalog records', obs['error'])
        self.assertEqual(obs['verdict'], 'unverified')
        for change in ({'truncated': True}, {'sampled_bytes_sha256': 'wrong'}, {'url': 'https://other.org'}):
            bad = {**cap, 'http': {**cap['http'], **change}}
            self.assertIn('complete catalog capture', assess(source, case, bad, body)['error'])


if __name__ == '__main__':
    unittest.main()
