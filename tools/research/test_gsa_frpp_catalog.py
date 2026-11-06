import unittest
from gsa_frpp_catalog import parse
from metadata_links import local_search
class AnnualSummaryCatalog(unittest.TestCase):
    def test_fiscal_year_versions_exclude_other_resources(self):
        b=b'<html><h1>FRPP Summary Report Library</h1><a href="https://www.gsa.gov/system/files/FY2025v2.xlsx">FY 2025 FRPP Summary Data Set [XLSX - 669 KB]</a><a href="https://www.gsa.gov/system/files/FY2024.xlsx">FY 2024 FRPP Summary Data Set [XLSX - 668 KB]</a><a href="https://other.example/FY2025.xlsx">FY 2025 FRPP Summary Data Set</a><a href="https://www.gsa.gov/system/files/owners.xlsx">Owners</a></html>'
        rows=parse(b);self.assertEqual(len(rows),2);self.assertEqual(rows[0]['fiscal_year'],2025)
        self.assertTrue(rows[0]['id'].endswith('FY2025v2.xlsx'));self.assertEqual(len(local_search(rows,{'field':'title','value':'2024'})),1)
        self.assertEqual(local_search(rows,{'field':'title','value':'no-match'}),[])
        self.assertFalse(rows[0]['personal_owner_data_requested'])
        for invalid in [b.replace(b'</html>',b''),b.replace(b'FRPP Summary Report Library',b'Other')]:
            with self.assertRaises(ValueError):parse(invalid)
