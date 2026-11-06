import unittest
from pathlib import Path
from unittest.mock import patch
from sru_metadata import parse_sru, SRUSession, ENDPOINT, interpret_policy, POLICY_URL

OPEN = '<searchRetrieveResponse xmlns="http://docs.oasis-open.org/ns/search-ws/sruResponse">'
CLOSE = '</searchRetrieveResponse>'
RECORD = '''<record><recordData><record xmlns="http://www.loc.gov/MARC21/slim">
<controlfield xmlns="" tag="001">42</controlfield><controlfield xmlns="" tag="003">IN-AhILN</controlfield>
<datafield xmlns="" tag="245"><subfield code="a">Soil science</subfield></datafield>
<datafield xmlns="" tag="250"><subfield code="a">2nd ed</subfield></datafield>
<datafield xmlns="" tag="856"><subfield code="u">https://example.org/item</subfield></datafield>
</record></recordData></record>'''


class SRUMetadataTests(unittest.TestCase):
    def test_exact_reviewed_sru_description_is_not_a_robots_denial(self):
        body=(Path(__file__).resolve().parents[2]/'docs/research/free-content/registry/runs/technical-recovery-20261106h/indcat-policy-response.xml').read_bytes()
        http={'status':200,'url':POLICY_URL,'content_type':'text/xml','truncated':False}
        policy,proof=interpret_policy(http,body)
        self.assertIsNone(policy);self.assertFalse(proof['access_restriction_overridden'])
        for data in [body.replace(b'robots.txt',b'private'),b'<html>Access denied</html>',b'<?xml version="1.0"?><challenge/>']:
            self.assertIs(interpret_policy(http,data)[0],False)
        self.assertIs(interpret_policy({**http,'status':403},body)[0],False)

    def test_real_robots_denial_still_applies_to_sru(self):
        policy,_=interpret_policy({'status':200,'url':POLICY_URL,'content_type':'text/plain','truncated':False},b'User-agent: *\nDisallow: /biblio\n')
        self.assertFalse(policy.can_fetch('MyBookshelf-SourceReview',ENDPOINT))

    def test_mixed_namespace_native_identity_and_unverified_reading(self):
        result = parse_sru((OPEN + '<numberOfRecords>22</numberOfRecords><records>' + RECORD +
                            '</records><nextRecordPosition>2</nextRecordPosition>' + CLOSE).encode())
        self.assertEqual((result['number_of_records'], result['next_record_position']), (22, 2))
        item = result['results'][0]
        self.assertEqual((item['id'], item['agency'], item['editions']), ('42', 'IN-AhILN', ['2nd ed']))
        self.assertEqual(item['reported_links'], ['https://example.org/item'])
        self.assertFalse(item['reading_access_verified'])

    def test_missing_001_003_uses_only_unique_agency_qualified_035(self):
        import re
        base=re.sub(r'<controlfield[^>]+tag="00[13]"[^>]*>.*?</controlfield>','',RECORD)
        field='<datafield xmlns="" tag="035"><subfield code="a">(IN-AhILN)bk_42</subfield></datafield>'
        record=base.replace('</record></recordData>',field+'</record></recordData>')
        wrap=lambda r:(OPEN+'<numberOfRecords>1</numberOfRecords><records>'+r+'</records>'+CLOSE).encode()
        item=parse_sru(wrap(record))['results'][0]
        self.assertEqual((item['id'],item['agency']),('42','IN-AhILN'))
        self.assertIn('MARC035',item['identity_field'])
        for bad in [record.replace('(IN-AhILN)','(Other)'),record.replace(field,field+field.replace('bk_42','bk_43')),RECORD.replace('</record></recordData>',field.replace('bk_42','bk_43')+'</record></recordData>')]:
            with self.assertRaises(ValueError):parse_sru(wrap(bad))

    def test_provider_fuzzy_matches_are_filtered_without_catalog_absence_claim(self):
        from sru_metadata import filter_title_results
        original={'results':[{'id':'1','title':'ZZ animal behaviour'},{'id':'2','title':'Organic chemistry Organic chemistry'}],'number_of_records':39322}
        empty=filter_title_results(original,'dc.title="zzUnmatchedKnowledge739519927"')
        self.assertEqual(empty['results'],[])
        self.assertEqual(empty['number_of_records'],39322)
        self.assertEqual(len(empty['provider_page_results']),2)
        self.assertIn('not a catalog-wide',empty['filtered_empty_scope'])
        self.assertEqual([r['id'] for r in filter_title_results(original,'dc.title="Organic chemistry"')['results']],['2'])
        with self.assertRaises(ValueError):filter_title_results(original,'dc.title=foo')

    def test_empty_and_provider_diagnostic_are_different(self):
        self.assertEqual(parse_sru((OPEN + '<numberOfRecords>0</numberOfRecords>' + CLOSE).encode())['results'], [])
        with self.assertRaisesRegex(ValueError, 'diagnostic'):
            parse_sru((OPEN + '<numberOfRecords>0</numberOfRecords><diagnostics><diagnostic/></diagnostics>' + CLOSE).encode())

    def test_missing_duplicate_identity_and_inconsistent_count_fail(self):
        for record, count in [(RECORD.replace('tag="001"', 'tag="999"'), 1), (RECORD * 2, 2), (RECORD, 0)]:
            with self.assertRaises(ValueError):
                parse_sru((OPEN + f'<numberOfRecords>{count}</numberOfRecords><records>' + record + '</records>' + CLOSE).encode())

    def test_html_entities_and_oversize_are_not_evidence(self):
        for body in [b'<html>Login</html>', b'<!DOCTYPE x [<!ENTITY y "z">]><x/>', b' ' * (512 * 1024 + 1)]:
            with self.assertRaises(ValueError):
                parse_sru(body)

    def test_access_denial_stops_further_requests_and_policy_denial_sends_none(self):
        req = {'method': 'GET', 'url': ENDPOINT, 'params': {'query': 'dc.title=test'}}
        for policy, expected_calls in [(False, 0), (None, 1)]:
            with patch('sru_metadata.sru_policy', return_value=(policy, {'status': 404})), \
                 patch('sru_metadata.time.sleep'), \
                 patch('run_source_reviews.request', return_value=({'status': 503, 'truncated': False}, b'unavailable')) as request:
                session = SRUSession()
                first, _ = session.fetch(req)
                second, _ = session.fetch(req)
                self.assertTrue(first['error'])
                self.assertIsNone(second['http']['status'])
                self.assertEqual(request.call_count, expected_calls)

    def test_provider_diagnostic_is_retained_as_failed_xml_evidence(self):
        body = (OPEN + '<diagnostics><diagnostic/></diagnostics>' + CLOSE).encode()
        with patch('sru_metadata.sru_policy', return_value=(None, {'status': 404})), \
             patch('sru_metadata.time.sleep'), \
             patch('run_source_reviews.request', return_value=({'status': 200, 'truncated': False}, body)):
            obs, data = SRUSession().fetch({'method': 'GET', 'url': ENDPOINT})
            self.assertIsNone(data)
            self.assertIn('diagnostic', obs['error'])
            self.assertEqual(obs['invalid_metadata_xml_excerpt'], body.decode())


if __name__ == '__main__':
    unittest.main()
