import copy
import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('classify', Path(__file__).with_name('classify.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class DecisionTests(unittest.TestCase):
    def route(self, name, category, blocked=False):
        return {'connectionId': name, 'candidateCategory': category,
                'blocker': {'code': 'ROBOTS_DISALLOWED'} if blocked else None}

    def test_blocked_primary_does_not_hide_alternative(self):
        routes = [self.route('primary', 1, True), self.route('alternate', 2)]
        self.assertEqual(c.choose_category(routes)['connectionId'], 'alternate')

    def test_all_blocked_retains_underlying_candidate(self):
        routes = [self.route('primary', 2, True), self.route('alternate', 1, True)]
        self.assertTrue(all(x['blocker'] for x in routes))
        self.assertEqual(c.choose_category(routes)['candidateCategory'], 1)

    def test_primary_breaks_equal_candidate_tie(self):
        self.assertEqual(c.choose_category([self.route('other', 2), self.route('primary', 2)])['connectionId'], 'primary')

    def test_review_correction_overrides_old_false_challenge(self):
        old = {'type': 'search_failed', 'code': 'SOURCE_ACCESS_BLOCKED', 'at': 'old'}
        review = {'classification': 'verified_20_live'}
        self.assertIsNone(c.blocker_for(review, {'diagnosedCode': 'SOURCE_ACCESS_BLOCKED'}, 'primary', old))

    def test_tooling_and_empty_are_not_source_blocks(self):
        for classification in ['tooling_or_evidence_gap', 'confirmed_empty_live', 'clean_zero_replayed']:
            self.assertIsNone(c.blocker_for({'classification': classification}, {}, 'primary', None))
        self.assertIsNone(c.blocker_for(None, {}, 'primary', {'type': 'search_failed', 'code': 'UNSUPPORTED_PROFILE'}))

    def test_policy_block_keeps_date_and_nonpermanence(self):
        block = c.blocker_for({'classification': 'confirmed_policy_block', 'sourceObservedThrough': '2026-11-07'}, {'diagnosedCode': 'ROBOTS_DISALLOWED'}, 'primary', None)
        self.assertEqual(block['code'], 'ROBOTS_DISALLOWED')
        self.assertEqual(block['observedAt'], '2026-11-07')
        self.assertFalse(block['permanentFailure'])

    def test_positive_response_without_review_is_not_verification(self):
        self.assertEqual(c.route_verification(None, 'primary', {'records': [1]}, False), ('candidate', 'saved_unqualified_results'))

    def test_platform_subtype_mapping(self):
        self.assertEqual(c.system_key('x', {'family': 'catalog', 'catalogUrl': 'https://portal.vmedulife.com/public/library/'}, {}, {}), 'vmedulife')
        self.assertEqual(c.system_key('x', {'family': 'discovery-academic'}, {'academicCatalogId': 'a'}, {'a': {'kind': 'srms'}}), 'academic:srms')
        self.assertEqual(c.system_key('x', {'family': 'catalog', 'catalogUrl': 'https://unmapped.example'}, {}, {}), 'individual')

    def test_incomplete_trailing_line_is_not_an_event(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'events.jsonl'
            p.write_bytes(b'{"id":1}\n{"id":2')
            self.assertEqual(c.complete_events(p), ([{'id':1}],1))


class FrozenInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.output=Path(cls.temp.name)
        cls.summary=c.build(output=cls.output)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_all_ids_routes_and_counts_reconcile(self):
        result=c.validate(output=self.output)
        self.assertEqual(result['libraries'], 6703)
        self.assertEqual(sum(result['categories'].values()), 6703)
        self.assertEqual(self.summary['unresolvedMappings'], [])
        self.assertEqual(c.read_json(self.output/'coverage-audit.json')['capturedConnections'], 6744)

    def test_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as d:
            other=Path(d)
            c.build(output=other)
            for f in self.output.iterdir():
                self.assertEqual(f.read_bytes(), (other/f.name).read_bytes(), f.name)

    def test_unknown_and_demonstrated_routes_never_become_release_ready(self):
        rows=[json.loads(x) for x in (self.output/'libraries.jsonl').read_text().splitlines()]
        self.assertTrue(any(r['verificationStatus']=='previously_demonstrated' for r in rows))
        self.assertTrue(any(r['verificationStatus']=='candidate' for r in rows))
        self.assertTrue(all(not r['releaseReady'] and r['liveChecksPerformedForClassification']==0 for r in rows))
        bn=next(r for r in rows if r['libraryId']=='discovery-academic:librarika-bncollege')
        self.assertNotEqual(bn['category'],4)

    def test_missing_or_corrupt_body_fails(self):
        path=self.output/'evidence-index.json'
        original=path.read_bytes()
        try:
            data=json.loads(original)
            ref=next(r['evidence'][0] for r in data.values() if r['evidence'])
            ref['sha256']='0'*64
            c.write_json(path,data)
            with self.assertRaisesRegex(ValueError,'Missing/mismatched saved query evidence'):
                c.validate(output=self.output)
            ref['path']='does-not-exist.txt'
            c.write_json(path,data)
            with self.assertRaisesRegex(ValueError,'Missing/mismatched saved query evidence'):
                c.validate(output=self.output)
        finally:
            path.write_bytes(original)

    def test_changed_input_hash_fails(self):
        path=self.output/'summary.json';original=path.read_bytes()
        try:
            data=json.loads(original);data['inputs'][0]['sha256']='0'*64;c.write_json(path,data)
            with self.assertRaisesRegex(ValueError,'Classification input changed or missing'):
                c.validate(output=self.output)
        finally:
            path.write_bytes(original)

    def test_wrong_csv_category_fails(self):
        path=self.output/'libraries.csv';original=path.read_bytes()
        try:
            with path.open() as f: reader=csv.DictReader(f);fields=reader.fieldnames;rows=list(reader)
            rows[0]['category']='999'
            with path.open('w',newline='') as f: writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(rows)
            with self.assertRaises(AssertionError): c.validate(output=self.output)
        finally:
            path.write_bytes(original)


if __name__=='__main__':
    unittest.main()
