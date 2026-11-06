import csv
import io
import json
import unittest
import gzip

from nga_catalog import FIELDS, parse, search
from scholarly_queries import parse_arxiv, parse_crossref
from preprint_catalog import parse as parse_preprints, search as search_preprints
from pmc_oai import parse as parse_pmc, decode as decode_pmc, LIMIT as PMC_LIMIT
from fao_opensearch import parse as parse_fao


class ScholarlyMetadataTests(unittest.TestCase):
    def test_fao_rejects_wrong_query_echo_and_preserves_handles(self):
        body = b'<feed xmlns="http://www.w3.org/2005/Atom" xmlns:o="http://a9.com/-/spec/opensearch/1.1/"><o:Query role="request" searchTerms="rice"/><o:totalResults>2</o:totalResults><o:startIndex>1</o:startIndex><entry><id>https://openknowledge.fao.org/handle/20.500.14283/testen</id><title>Rice cultivation</title></entry></feed>'
        self.assertEqual(parse_fao(body, 'rice')['results'][0]['id'], 'https://openknowledge.fao.org/handle/20.500.14283/testen')
        self.assertEqual(len(parse_fao(body.replace(b'searchTerms="rice"', b'searchTerms="title%3Arice"'), 'title:rice')['results']), 1)
        with self.assertRaises(ValueError):
            parse_fao(body.replace(b'searchTerms="rice"', b'searchTerms="title%253Arice"'), 'title:rice')
        with self.assertRaises(ValueError):
            parse_fao(body, 'fisheries')
        with self.assertRaises(ValueError):
            parse_fao(body.replace(b'openknowledge.fao.org/handle/', b'other.org/handle/'), 'rice')

    def test_pmc_native_ids_rights_and_provider_errors(self):
        body = b'<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><GetRecord><record><header><identifier>oai:pubmedcentral.nih.gov:123</identifier><datestamp>2026-11-04</datestamp></header><metadata><oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"><dc:title>Genomics</dc:title><dc:rights>CC BY</dc:rights><dc:identifier>https://doi.org/10.1234/test</dc:identifier></oai_dc:dc></metadata></record></GetRecord></OAI-PMH>'
        row = parse_pmc(body)['results'][0]
        self.assertEqual(row['pmcid'], 'PMC123')
        self.assertEqual(row['rights'], ['CC BY'])
        self.assertFalse(row['reading_access_verified'])
        with self.assertRaises(ValueError):
            parse_pmc(body.replace(b'oai:pubmedcentral.nih.gov:123', b'oai:other:123'))
        error = b'<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><error code="idDoesNotExist">unknown</error></OAI-PMH>'
        self.assertEqual(parse_pmc(error)['provider_errors'][0]['code'], 'idDoesNotExist')

    def test_pmc_compression_limits_and_incomplete_streams(self):
        body = gzip.compress(b'metadata')
        self.assertEqual(decode_pmc(body, 'gzip'), b'metadata')
        for bad in (body[:-3], body + gzip.compress(b'extra'), gzip.compress(b'x' * (PMC_LIMIT + 1))):
            with self.assertRaises(ValueError):
                decode_pmc(bad, 'gzip')

    def test_preprints_keep_versions_and_new_doi_prefix(self):
        row = {'doi': '10.64898/2026.11.02.763753', 'title': 'Biomedical Literature Review',
               'version': '1', 'server': 'bioRxiv', 'published': '10.1234/journal', 'license': 'cc_by'}
        d = {'messages': [{'status': 'ok'}], 'collection': [row, {**row, 'version': '2'}]}
        rows = parse_preprints(d, 'biorxiv')['results']
        self.assertNotEqual(rows[0]['id'], rows[1]['id'])
        self.assertEqual(rows[0]['doi'], '10.64898/2026.11.02.763753')
        self.assertEqual(len(search_preprints(rows, 'literature review')), 2)
        self.assertEqual(search_preprints(rows, 'notinthetitle'), [])
        self.assertTrue(parse_preprints({'messages': [{'status': 'no posts found'}], 'collection': []}, 'biorxiv')['explicit_empty'])
        with self.assertRaises(ValueError):
            parse_preprints({'messages': [{'status': 'no posts found'}], 'collection': [row]}, 'biorxiv')
        with self.assertRaises(ValueError):
            parse_preprints({'messages': [{'status': 'ok'}], 'collection': [{**row, 'version': '0'}]}, 'biorxiv')
        with self.assertRaises(ValueError):
            parse_preprints(d, 'medrxiv')
        with self.assertRaises(ValueError):
            parse_preprints({'messages': [{'status': 'non-numeric value supplied'}], 'collection': []}, 'biorxiv')

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
