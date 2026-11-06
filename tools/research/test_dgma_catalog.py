import unittest
from dgma_catalog import parse
class MaritimeMetadataTest(unittest.TestCase):
    def test_dates_versions_and_scope(self):
        raw=b'<html><title>Directorate General of Shipping - Government of India</title><a href="https://dgma.gov.in/download/123_dgma-circular-71-2026.pdf">Migration of certificate services<div class="light-sm-txt">23-Oct-2026 Size: 610 KB Format: PDF</div></a><a href="https://dgma.gov.in/download/other.pdf">Other item</a></html>'
        row=parse(raw)[0];self.assertEqual(row['title'],'Migration of certificate services');self.assertEqual(row['published_date_label'],'23-Oct-2026')
        self.assertTrue(row['id'].endswith('71-2026.pdf'));self.assertFalse(row['reading_access_verified'])
        for invalid in [raw.replace(b'</html>',b''),raw.replace(b'23-Oct-2026',b'undated'),raw.replace(b'dgma.gov.in/download/',b'other.example/download/')]:
            with self.assertRaises(ValueError):parse(invalid)
