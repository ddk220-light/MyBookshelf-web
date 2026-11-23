import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from import_bookdash import map_record, import_catalog
from import_gutenberg import activate


class BookDashTests(unittest.TestCase):
    row = {'id': 123, 'title': {'rendered': 'Synthetic &amp; Book'}, 'link': 'https://bookdash.org/books/synthetic-fixture/', 'languages': [621]}
    page = '<h3><span>Fixture Writer</span> (Writer)</h3><h3>Fixture Artist (Illustrator)</h3>' + '<div id="read-book"><div>' + ''.join(f'<a href="https://bookdash.org/wp-content/uploads/2026/01/synthetic-{n}.jpg">page</a>' for n in range(5)) + '</div></div><p>Never store this story text</p>'

    def test_metadata_keeps_native_identity_roles_language_and_supplied_reader_only(self):
        record = map_record(self.row, self.page, '2026-11-01T14:00:00Z', 621)
        self.assertEqual(record['key'], 'fcd:v1:bookdash:123')
        self.assertEqual(record['title'], 'Synthetic & Book')
        self.assertEqual(record['contributors'][1], {'name': 'Fixture Artist', 'role': 'illustrator'})
        self.assertEqual(record['languages'], ['en'])
        self.assertEqual(record['locations'][0]['downloads'], [])
        self.assertNotIn('readingLevel', record)
        self.assertNotIn('Never store', json.dumps(record))
        self.assertNotIn('synthetic-0.jpg', json.dumps(record))

    def test_incomplete_gallery_unknown_language_identity_or_other_host_is_not_free_evidence(self):
        for patch in [{'id': '123'}, {'languages': [999]}, {'languages': [621, 999]}, {'link': 'https://other.example/books/synthetic-fixture/'}]:
            with self.assertRaises(ValueError): map_record({**self.row, **patch}, self.page, '2026-11-01T14:00:00Z', 621)
        with self.assertRaises(ValueError): map_record(self.row, '<h3>Fixture Writer (Writer)</h3>', '2026-11-01T14:00:00Z', 621)

    def test_shrunken_refresh_preserves_active_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'bookdash.json'
            original = {'records': [{'key': str(n)} for n in range(10)], 'recordCount': 10}
            output.write_text(json.dumps(original))
            with self.assertRaises(ValueError): activate({'records': [{'key': '1'}], 'recordCount': 1}, output)
            self.assertEqual(json.loads(output.read_text()), original)

    def test_newer_catalog_entries_do_not_push_saved_native_ids_out_of_a_refresh(self):
        def source(url):
            if 're-using' in url: return b'We publish all of our books under a Creative Commons CC BY 4.0 license', {}
            if '/languages?' in url: return json.dumps([{'id': 621, 'slug': 'eng', 'name': 'English', 'count': 214}]).encode(), {}
            if '/wp-json/' in url:
                row = self.row if 'include=123' in url else {**self.row, 'id': 999, 'link': 'https://bookdash.org/books/new-fixture/'}
                return json.dumps([row]).encode(), {}
            return self.page.encode(), {}
        with patch('import_bookdash.fetch', side_effect=source), patch('import_bookdash.time.sleep'):
            self.assertEqual(import_catalog(1)['records'][0]['key'], 'fcd:v1:bookdash:999')
            refreshed = import_catalog(1, [123])
            self.assertEqual(refreshed['records'][0]['key'], 'fcd:v1:bookdash:123')
            self.assertEqual(refreshed['sourceLanguageRecordCount'], 214)


if __name__ == '__main__': unittest.main()
