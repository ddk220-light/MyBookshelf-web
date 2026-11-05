import csv
import io
import json
import unittest

from nga_catalog import FIELDS, parse, search
from scholarly_queries import parse_arxiv, parse_crossref


class ScholarlyMetadataTests(unittest.TestCase):
    def test_crossref_keeps_doi_identity_and_refuses_error_envelope(self):
        record = {'DOI': '10.1234/AbC', 'title': ['A real title'], 'type': 'journal-article'}
        data = {'status': 'ok', 'message-type': 'work-list',
                'message': {'items': [record], 'total-results': 12, 'next-cursor': 'cursor2'}}
        found = parse_crossref(json.dumps(data).encode())
        self.assertEqual(found['results'][0]['id'], '10.1234/abc')
        self.assertFalse(found['results'][0]['reading_access_verified'])
        self.assertEqual(found['next_cursor'], 'cursor2')
        data['status'] = 'failed'
        with self.assertRaises(ValueError):
            parse_crossref(json.dumps(data).encode())

    def test_crossref_missing_and_duplicate_id_fail(self):
        for items in ([{'title': ['Missing DOI']}],
                      [{'DOI': '10.1234/ABC', 'title': ['One']}, {'DOI': '10.1234/abc', 'title': ['Other']} ]):
            with self.assertRaises(ValueError):
                parse_crossref(json.dumps({'status': 'ok', 'message-type': 'work-list',
                                          'message': {'items': items, 'total-results': 2}}).encode())

    def test_arxiv_preserves_version_and_rejects_error_entry(self):
        body = b'<feed xmlns="http://www.w3.org/2005/Atom" xmlns:o="http://a9.com/-/spec/opensearch/1.1/"><o:totalResults>1</o:totalResults><o:startIndex>0</o:startIndex><entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title></entry></feed>'
        self.assertEqual(parse_arxiv(body)['results'][0]['id'], '1706.03762v7')
        for replacement in (b'http://arxiv.org/api/errors#incorrect_id_format', b'http://arxiv.org/abs/1706.03762'):
            with self.assertRaises(ValueError):
                parse_arxiv(body.replace(b'http://arxiv.org/abs/1706.03762v7', replacement))

    def test_nga_multiline_csv_preserves_parts_discards_provenance(self):
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=[*FIELDS, 'provenancetext'])
        writer.writeheader()
        row = {k: '' for k in FIELDS}
        row.update(objectid='12', title='Girl, with\na Red Hat', attribution='Johannes Vermeer',
                   parentid='11', isvirtual='0', provenancetext='DO NOT RETAIN')
        writer.writerow(row)
        rows = parse(output.getvalue().encode())
        self.assertEqual(rows[0]['parentid'], '11')
        self.assertNotIn('provenancetext', rows[0])
        self.assertEqual(search(rows, {'mode': 'title_tokens', 'text': 'red girl'})[0]['id'], '12')
        self.assertEqual(search(rows, {'mode': 'artist_tokens', 'text': 'Vermeer'})[0]['id'], '12')
        self.assertEqual(search(rows, {'mode': 'title_tokens', 'text': ''}), [])
        self.assertEqual(search(rows, {'mode': 'title_tokens', 'text': 'DO NOT RETAIN'}), [])
        with self.assertRaises(ValueError):
            search(rows, {'mode': 'full_text', 'text': 'girl'})
        writer.writerow(row)
        with self.assertRaises(ValueError):
            parse(output.getvalue().encode())


if __name__ == '__main__':
    unittest.main()
