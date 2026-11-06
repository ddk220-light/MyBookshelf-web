import unittest
from rosap_oai import parse, fetch_case, ENDPOINT

class RosaMetadata(unittest.TestCase):
    def xml(self, identity='oai:dot.stacks:dot:94173'):
        return ('<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><GetRecord><record><header><identifier>'+identity+'</identifier><datestamp>2026-10-01</datestamp></header><metadata><dc xmlns="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:d="http://purl.org/dc/elements/1.1/"><d:title>Central BIM Library</d:title><d:date>2026</d:date><d:identifier>https://rosap.ntl.bts.gov/view/dot/94173</d:identifier></dc></metadata></record></GetRecord></OAI-PMH>').encode()
    def test_identity_and_date_do_not_become_another_edition(self):
        r=parse(self.xml())['results'][0]
        self.assertEqual(r['native_dot_id'],'94173');self.assertEqual(r['dates'],['2026'])
        self.assertFalse(r['reading_access_verified'])
        with self.assertRaises(ValueError):parse(self.xml('oai:cdc.stacks:cdc:94173'))
    def test_explicit_error_is_not_success(self):
        d=parse(b'<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><error code="idDoesNotExist">No record</error></OAI-PMH>')
        self.assertEqual(d['results'],[]);self.assertEqual(d['provider_errors'][0]['code'],'idDoesNotExist')
    def test_rejects_missing_metadata_and_unsafe_xml(self):
        for b in [self.xml().replace(b'<d:title>Central BIM Library</d:title>',b''),b'<!DOCTYPE a>'+self.xml(),self.xml().replace(b'http://www.openarchives.org/OAI/2.0/oai_dc/',b'http://example.com/fulltext')]:
            with self.assertRaises(ValueError):parse(b)
    def test_only_reviewed_metadata_request(self):
        source={'id':'rosa-p','query':{'adapter':'rosap-oai'}}
        case={'id':'x','expected_ids':['oai:dot.stacks:dot:94173'],'request':{'method':'GET','url':ENDPOINT,'params':{'verb':'GetRecord','identifier':'oai:dot.stacks:dot:94173','metadataPrefix':'fulltext'}}}
        with self.assertRaises(ValueError):fetch_case(source,case,None,{})
        case['request']['params']['metadataPrefix']='oai_dc'
        obs=fetch_case(source,case,False,{})
        self.assertEqual(obs['verdict'],'unverified');self.assertIsNone(obs['http']['status'])
