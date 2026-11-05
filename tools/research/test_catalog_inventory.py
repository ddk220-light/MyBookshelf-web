import csv
import io
import unittest

from catalog_inventory import local_search, parse_otl


class CatalogInventoryTests(unittest.TestCase):
    def catalog(self, **overrides):
        item = {'Otl id': '4', 'Title': 'Calculus', 'Publisher': 'Example', 'License': 'Attribution',
                'Library URL': 'https://open.umn.edu/opentextbooks/textbooks/calculus',
                'Subject 1': 'Mathematics', 'Type 1': 'Online', 'URL 1': 'https://example.org/book',
                'Price 1': '$0.00', 'Type 2': 'Hardcopy', 'URL 2': 'https://shop.example.org/book',
                'Price 2': '$25.00', **overrides}
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=list(item))
        writer.writeheader()
        writer.writerow(item)
        return stream.getvalue().encode()

    def test_catalog_price_does_not_prove_reader_access_or_include_paid_print(self):
        row = parse_otl(self.catalog())[0]
        self.assertEqual(len(row['metadata_reported_free_links']), 1)
        self.assertFalse(row['metadata_reported_free_links'][0]['access_verified'])
        self.assertEqual(parse_otl(self.catalog(**{'Price 1': ''}))[0]['metadata_reported_free_links'], [])

    def test_schema_changes_and_noncanonical_identity_fail_closed(self):
        with self.assertRaises(ValueError):
            parse_otl(b'title,url\nBook,https://example.org\n')
        with self.assertRaises(ValueError):
            parse_otl(self.catalog(**{'Library URL': 'https://example.org/impersonator'}))

    def test_metadata_search_distinguishes_title_subject_and_unsupported_fulltext(self):
        rows = parse_otl(self.catalog())
        self.assertEqual(local_search(rows, {'mode': 'title_contains', 'text': 'Mathematics'}), [])
        self.assertEqual(local_search(rows, {'mode': 'title_or_subject', 'text': 'mathematics'}), rows)
        self.assertEqual(local_search(rows, {'mode': 'title_contains', 'text': '  '}), [])
        with self.assertRaises(ValueError):
            local_search(rows, {'mode': 'full_text', 'text': 'Mathematics'})


if __name__ == '__main__':
    unittest.main()
