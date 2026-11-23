import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from import_gutenberg import activate, import_archive, parse_record, snapshot

OBSERVED = '2026-11-01T08:00:00Z'
# Synthetic metadata, not a catalog record or fictional board data published as real.
RDF = b'''<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
 xmlns:dcterms="http://purl.org/dc/terms/" xmlns:pgterms="http://www.gutenberg.org/2009/pgterms/">
 <pgterms:ebook rdf:about="ebooks/123"><dcterms:title>Import contract fixture</dcterms:title>
 <dcterms:type><rdf:Description><rdf:value>Text</rdf:value></rdf:Description></dcterms:type>
 <dcterms:rights>Public domain in the USA.</dcterms:rights>
 <dcterms:hasFormat><pgterms:file rdf:about="https://www.gutenberg.org/files/123/fixture.html">
 <dcterms:format><rdf:Description><rdf:value>text/html; charset=utf-8</rdf:value></rdf:Description></dcterms:format>
 </pgterms:file></dcterms:hasFormat></pgterms:ebook></rdf:RDF>'''


class ImportTests(unittest.TestCase):
    def test_rights_and_urls_are_not_inferred(self):
        item = parse_record(RDF, OBSERVED)
        self.assertEqual(item['locations'][0]['access'], 'free_full_text')
        self.assertEqual(item['locations'][0]['rightsJurisdiction'], 'US')
        self.assertEqual(parse_record(RDF.replace(b'Public domain in the USA.', b'Unknown'), OBSERVED)['locations'][0]['access'], 'unknown')
        self.assertEqual(parse_record(RDF.replace(b'https://www.gutenberg.org/files/123/fixture.html', b'http://127.0.0.1/private'), OBSERVED)['locations'][0]['access'], 'unknown')
        virtual = RDF.replace(b'https://www.gutenberg.org/files/123/fixture.html', b'https://www.gutenberg.org/ebooks/123.html.images')
        self.assertEqual(parse_record(virtual, OBSERVED)['locations'][0]['access'], 'unknown')
        self.assertNotIn('readerUrl', parse_record(virtual, OBSERVED)['locations'][0])

    def test_xml_and_archive_boundaries(self):
        with self.assertRaises(ValueError): parse_record(b'<!DOCTYPE x><x/>', OBSERVED)
        with self.assertRaises(ValueError): parse_record(b'<rdf/>', OBSERVED)
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w:bz2') as archive:
            entry = tarfile.TarInfo('../../metadata.rdf')
            entry.size = len(RDF)
            archive.addfile(entry, io.BytesIO(RDF))
        stream.seek(0)
        result = import_archive(stream, 1, OBSERVED, 'official archive')
        self.assertEqual(result['recordCount'], 1)
        self.assertFalse(result['complete'])

    def test_failed_refresh_keeps_active_snapshot(self):
        item = parse_record(RDF, OBSERVED)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'catalog.json'
            data = snapshot([item], OBSERVED, 'official archive')
            activate(data, output)
            prior = output.read_bytes()
            activate(data, output)
            self.assertEqual(prior, output.read_bytes())
            with self.assertRaises(ValueError): activate({**data, 'records': []}, output)
            self.assertEqual(prior, output.read_bytes())
            self.assertEqual(json.loads(prior)['records'][0]['key'], 'fcd:v1:gutenberg:123')


if __name__ == '__main__': unittest.main()
