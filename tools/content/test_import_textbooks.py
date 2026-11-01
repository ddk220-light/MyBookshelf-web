import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from import_gutenberg import activate
from import_textbooks import import_csv, parse_record, web_url

OBSERVED = '2026-11-01T09:08:56Z'
# Synthetic CSV protocol record, never published as real catalog data.
ROW = {'Otl id': '123', 'Title': 'Textbook protocol fixture', 'License': 'Attribution',
       'Library URL': 'https://open.umn.edu/opentextbooks/textbooks/fixture',
       'ISBN13': '9780140328721', 'Contributors': 'Fixture Author - Author / Fixture Editor - Editor',
       'Type 1': 'Online', 'URL 1': 'https://publisher.example/book', 'Price 1': '$0.00',
       'Type 2': 'PDF', 'URL 2': 'https://publisher.example/book', 'Price 2': '$0.00',
       'Description': 'Do not persist descriptions or reviews.'}


def csv_bytes(rows):
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=ROW.keys())
    writer.writeheader(); writer.writerows(rows)
    return output.getvalue().encode()


class TextbookTests(unittest.TestCase):
    def test_access_downloads_roles_and_identifiers_follow_supplied_evidence(self):
        item = parse_record(ROW, OBSERVED)
        self.assertEqual(item['languages'], ['und'])
        self.assertEqual(item['contributors'][1]['role'], 'editor')
        self.assertEqual(item['identifiers'][1]['value'], '9780140328721')
        self.assertEqual(len(item['locations']), 1)
        self.assertEqual(item['locations'][0]['access'], 'free_full_text')
        self.assertEqual(item['locations'][0]['downloads'], [])
        direct = parse_record({**ROW, 'URL 2': 'https://publisher.example/book.pdf'}, OBSERVED)
        self.assertEqual(direct['locations'][1]['downloads'][0]['mimeType'], 'application/pdf')
        self.assertNotIn('Description', json.dumps(item))
        self.assertEqual(parse_record({**ROW, 'License': 'Unknown'}, OBSERVED)['locations'][0]['access'], 'unknown')

    def test_paid_unsafe_and_missing_links_never_become_free_actions(self):
        item = parse_record({**ROW, 'Price 1': '$9.00', 'URL 2': 'http://127.0.0.1/x'}, OBSERVED)
        self.assertEqual(item['locations'][0]['access'], 'metadata_only')
        self.assertEqual(item['locations'][0]['downloads'], [])
        for url in ['file:///a', 'javascript:bad', 'http://2130706433/x', 'https://user:secret@publisher.example/x', 'https://publisher.example/login']:
            self.assertIsNone(web_url(url))
        self.assertEqual(parse_record({**ROW, 'ISBN13': '9780140328722'}, OBSERVED)['identifiers'], [{'scheme': 'open-textbook-library', 'value': '123'}])

    def test_refresh_rejects_empty_changed_schema_and_duplicates_without_replacing_active(self):
        data = import_csv(csv_bytes([ROW]), OBSERVED)
        self.assertEqual(data, import_csv(csv_bytes([ROW]), OBSERVED))
        self.assertFalse(data['complete'])
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'catalog.json'; activate(data, target)
            original = target.read_bytes()
            for raw in [b'', b'Wrong,columns\n1,2\n', csv_bytes([]), csv_bytes([ROW, ROW])]:
                with self.assertRaises(ValueError): activate(import_csv(raw, OBSERVED), target)
                self.assertEqual(target.read_bytes(), original)


if __name__ == '__main__': unittest.main()
