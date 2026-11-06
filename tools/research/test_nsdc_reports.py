import unittest
from nsdc_reports import parse,make_request
class NsdcReportTests(unittest.TestCase):
    def row(self):
        return {'text':'Construction Material & Building Hardware\n05 Aug 2025\t\n','links':[{'url':'https://api1.nsdcindia.org//system/files/2025-08/report%20one.pdf'}]}
    def test_title_word_order_and_exact_native_url(self):
        row=parse([self.row()],'Building Construction')[0]
        self.assertEqual(row['id'],self.row()['links'][0]['url']);self.assertEqual(row['displayed_updated_on'],'05 Aug 2025');self.assertFalse(row['reading_access_verified'])
    def test_wrong_titles_or_file_identity_rejected(self):
        with self.assertRaises(ValueError):parse([self.row()],'Food')
        for url in ['https://evil.example/report.pdf','https://api1.nsdcindia.org/system/files/report.pdf']:
            row=self.row();row['links'][0]['url']=url
            with self.assertRaises(ValueError):parse([row],'Building')
    def test_duplicate_native_id_and_oversized_query_rejected(self):
        with self.assertRaises(ValueError):parse([self.row(),self.row()],'Building')
        with self.assertRaises(ValueError):make_request('x'*51)
        self.assertEqual(parse([],'NoResults'),[])
if __name__=='__main__':unittest.main()
