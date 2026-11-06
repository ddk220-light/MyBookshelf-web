import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import zlib
import json
import hashlib

from capture_analysis import paragraphs, snapshot, source_mentions, dossier_gaps, evidence_run_audit, area_completion
from sphinx_inventory import local_search, parse_inventory, probe


class AdHocObservationTests(unittest.TestCase):
    def test_ad_hoc_observation_has_stable_identity_without_queue_job(self):
        from capture_analysis import primary_document_reference
        row={'id':'manual-review','http':{'status':503}}
        a=primary_document_reference(row,'runs/manual/observations.jsonl')
        self.assertIsNone(a['job_id'])
        self.assertEqual(a['observation_id'],'manual-review')
        self.assertEqual(a,primary_document_reference(row,'runs/manual/observations.jsonl'))
        self.assertNotEqual(a['document_id'],primary_document_reference({**row,'http':{'status':200}},a['path'])['document_id'])
        self.assertEqual(primary_document_reference({'job_id':'queued'},a['path'])['job_id'],'queued')


class CorpusTests(unittest.TestCase):
    def test_coverage_requires_qualified_origins_and_manual_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / 'review.json').write_text('{}')
            area = {'id': 'C17', 'name': 'News'}
            review = {'status': 'complete', 'reviewed_at': 'today', 'reviewed_scope': 'Defined catalog scope',
                      'rationale': 'Current source and language evidence reviewed',
                      'evidence': ['review.json'], 'unresolved_questions': []}
            membership = {'candidate_source_ids': [str(i) for i in range(150)],
                          'query_example_source_ids': [str(i) for i in range(120)],
                          'qualified_source_ids': [str(i) for i in range(99)]}
            self.assertEqual(area_completion(area, membership, review, [], root)['status'], 'open')
            # Repeated membership or a candidate is not the hundredth origin.
            membership['qualified_source_ids'].append('0')
            self.assertEqual(area_completion(area, membership, review, [], root)['qualified_origins'], 99)
            membership['qualified_source_ids'].append('99')
            self.assertEqual(area_completion(area, membership, review, [], root)['status'], 'complete')
            review['unresolved_questions'] = ['India/local-language gap is unresolved']
            self.assertEqual(area_completion(area, membership, review, [], root)['status'], 'open')

    def test_scarcity_cannot_be_silently_accepted_or_use_missing_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / 'review.json').write_text('{}')
            area = {'id': 'I01', 'name': 'Agriculture'}
            review = {'status': 'complete', 'reviewed_at': 'today', 'reviewed_scope': 'Documented discovery scope',
                      'rationale': 'Scarcity review', 'evidence': ['review.json'], 'unresolved_questions': [],
                      'scarcity_evidence_summary': 'Directories and conversion evidence reviewed'}
            self.assertEqual(area_completion(area, {}, review, [], root)['status'], 'open')
            review['owner_accepted_shortfall'] = True
            self.assertEqual(area_completion(area, {}, review, [], root)['status'], 'open')
            review['acceptance_provenance'] = 'Explicit owner acceptance reference'
            self.assertEqual(area_completion(area, {}, review, [], root)['status'], 'complete')
            (root / 'review.json').unlink()
            self.assertEqual(area_completion(area, {}, review, [], root)['status'], 'open')

    def test_civic_area_requires_both_country_cells_and_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / 'review.json').write_text('{}')
            review = {'status': 'complete', 'reviewed_at': 'today', 'reviewed_scope': 'Both jurisdictions',
                      'rationale': 'Country evidence', 'evidence': ['review.json'], 'unresolved_questions': []}
            area = {'id': 'P05', 'name': 'Planning'}
            cells = [{'area_id': 'P05', 'country': 'USA', 'status': 'accounted'}]
            self.assertEqual(area_completion(area, {}, review, cells, root)['status'], 'open')
            cells.append({'area_id': 'P05', 'country': 'India', 'status': 'accounted'})
            self.assertEqual(area_completion(area, {}, review, cells, root)['status'], 'complete')
            self.assertEqual(area_completion(area, {}, {}, cells, root)['status'], 'open')

    def test_complete_label_cannot_hide_questions_missing_files_or_historical_only_claims(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry = Path(tmp)
            (registry / 'analysis').mkdir()
            (registry / 'analysis/documents.jsonl').write_text('{"captured_at":"today","content":"old claim"}\n')
            section = {'status': 'complete', 'summary': 'Claim', 'evidence': ['analysis/documents.jsonl'], 'open_questions': []}
            source = {'dossier': {'query_contract': section}}
            self.assertIn('query_contract', dossier_gaps(source, registry))
            section['evidence'] = ['missing.jsonl']
            self.assertIn('query_contract', dossier_gaps(source, registry))
            (registry / 'current.jsonl').write_text('{"observed_at":"today","http":{"status":200}}\n')
            section['evidence'] = ['current.jsonl']
            section['open_questions'] = ['Is this actually supported?']
            self.assertIn('query_contract', dossier_gaps(source, registry))

    def test_missing_document_capture_hash_fails_the_evidence_audit(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry = Path(tmp)
            run = registry / 'runs/check'
            run.mkdir(parents=True)
            (run / 'queue.json').write_text('{"jobs":[{"id":"a"}]}')
            (run / 'observations.jsonl').write_text('{"job_id":"a","outcome":"captured","http":{"status":200},"robots_evidence":{"status":404}}\n')
            _, errors = evidence_run_audit(registry)
            self.assertTrue(any('Missing capture hash' in e for e in errors))

    def local_failure_fixture(self, registry, url='source-label', outcome='blocked-or-failed', http=None):
        run = registry / 'runs/check'
        run.mkdir(parents=True)
        (registry / 'analysis').mkdir()
        (run / 'queue.json').write_text(json.dumps({'jobs': [{'id': 'a', 'url': url}]}))
        row = {'job_id': 'a', 'url': url, 'outcome': outcome, 'http': http,
               'robots_evidence': {}, 'query_verified': False, 'observed_at': 'today'}
        (run / 'observations.jsonl').write_text(json.dumps(row) + '\n')
        log = b"ValueError: unknown url type: ':///robots.txt'\n"
        (run / 'traceback.txt').write_bytes(log)
        review = {'run_id': 'check', 'job_id': 'a', 'kind': 'invalid-request-url-before-network',
                  'network_request_sent': False, 'reviewed_at': 'today',
                  'observation_sha256': hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
                  'traceback_path': 'runs/check/traceback.txt', 'traceback_sha256': hashlib.sha256(log).hexdigest()}
        (registry / 'analysis/collector-failures.jsonl').write_text(json.dumps(review) + '\n')
        return run

    def test_local_input_failure_requires_both_exact_observation_and_traceback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run = self.local_failure_fixture(root)
            runs, errors = evidence_run_audit(root)
            self.assertEqual(errors, [])
            self.assertEqual(runs[0]['outcomes']['captured'], 0)
            self.assertEqual(runs[0]['local_input_failure_job_ids'], ['a'])
            (run / 'traceback.txt').write_text('changed')
            self.assertTrue(evidence_run_audit(root)[1])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run = self.local_failure_fixture(root)
            row = json.loads((run / 'observations.jsonl').read_text())
            row['observed_at'] = 'changed'
            (run / 'observations.jsonl').write_text(json.dumps(row) + '\n')
            self.assertTrue(evidence_run_audit(root)[1])

    def test_local_failure_review_cannot_waive_a_real_capture_or_valid_url(self):
        for args in [{'url': 'https://example.org/api'}, {'outcome': 'captured'}, {'http': {'status': 403}}]:
            with self.subTest(args=args), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); self.local_failure_fixture(root, **args)
                _, errors = evidence_run_audit(root)
                self.assertTrue(any('Missing capture hash' in e for e in errors))

    def test_snapshot_is_lossless_and_changes_identity_when_evidence_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'review.md'
            path.write_text('पानी — திருக்குறள்\nfailed query\n')
            first = snapshot(path, Path(tmp))
            self.assertEqual(first['content'], path.read_text())
            path.write_text(path.read_text() + 'later success\n')
            second = snapshot(path, Path(tmp))
            self.assertNotEqual(first['id'], second['id'])
            self.assertIn('failed query', second['content'])

    def test_named_catalog_table_rows_keep_separate_line_provenance(self):
        content = '# Sources\n\n| HAL | failed |\n| Shodhganga | pending |\n'
        rows = list(paragraphs(content))
        self.assertEqual([r['line'] for r in rows if r['text'].startswith('|')], [3, 4])
        mentions = source_mentions({'name': 'HAL'}, [{'id': 'test', 'path': 'sources.md', 'format': 'md', 'content': content}])
        self.assertEqual(len(mentions), 1)
        self.assertEqual(mentions[0]['line'], 3)


class InventoryTests(unittest.TestCase):
    def inventory(self, line):
        return b'# Sphinx inventory version 2\n# Project: Python\n# Version: 3.15\n# zlib\n' + zlib.compress(line.encode())

    def test_real_inventory_anchor_substitution_and_exact_symbol_search(self):
        rows = parse_inventory(self.inventory('pathlib.Path py:class 1 library/pathlib.html#$ -\n'), 'https://docs.python.org/3.15/', '3.15')
        self.assertEqual(rows[0]['landing_page'], 'https://docs.python.org/3.15/library/pathlib.html#pathlib.Path')
        self.assertEqual(local_search(rows, {'mode': 'exact_symbol', 'text': 'pathlib.Path'}), rows)
        self.assertEqual(local_search(rows, {'mode': 'exact_symbol', 'text': 'Path'}), [])

    def test_wrong_version_and_external_locations_fail(self):
        with self.assertRaises(ValueError):
            parse_inventory(self.inventory('x py:class 1 x.html -\n'), 'https://docs.python.org/3.15/', '3.14')
        with self.assertRaises(ValueError):
            parse_inventory(self.inventory('x py:class 1 https://other.example/x -\n'), 'https://docs.python.org/3.15/', '3.15')

    def test_failed_import_is_retained_and_cannot_leave_a_fresh_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            (directory / 'examples').mkdir()
            request = {'method': 'GET', 'url': 'https://docs.python.org/3.15/objects.inv', 'local_query': {'mode': 'exact_symbol', 'text': 'x'}}
            source = {'id': 'fixture', 'query': {'adapter': 'sphinx-inventory', 'endpoint': request['url'], 'version': '3.15', 'base_url': 'https://docs.python.org/3.15/', 'cases': [{'id': 'x', 'request': request, 'expected_ids': ['py:class:x']}]}}
            with patch('sphinx_inventory.REGISTRY', directory), patch('sphinx_inventory.LOCK_PATH', directory / 'lock'), patch('sphinx_inventory.robots', return_value=(None, {})), patch('sphinx_inventory.time.sleep'), patch('sphinx_inventory.request', side_effect=TimeoutError('Timed out')):
                probe(source)
            row = json.loads((directory / 'examples/fixture.jsonl').read_text())
            self.assertEqual(row['verdict'], 'unverified')
            self.assertEqual(row['execution_mode'], 'metadata-import-failed')
            self.assertEqual(row['error'], 'Timed out')

    def test_duplicate_identity_project_and_minor_version_escape_fail(self):
        line = 'x py:class 1 library/x.html -\n'
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            parse_inventory(self.inventory(line * 2), 'https://docs.python.org/3.15/', '3.15')
        with self.assertRaisesRegex(ValueError, 'project'):
            parse_inventory(self.inventory(line), 'https://docs.python.org/3.15/', '3.15', 'Other project')
        with self.assertRaisesRegex(ValueError, 'escaped'):
            parse_inventory(self.inventory('x py:class 1 ../3.14/x.html -\n'), 'https://docs.python.org/3.15/', '3.15')

    def test_policy_denial_does_not_request_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'examples').mkdir()
            source = {'id': 'fixture', 'query': {'endpoint': 'https://docs.python.org/3.15/objects.inv', 'cases': []}}
            with patch('sphinx_inventory.REGISTRY', root), patch('sphinx_inventory.LOCK_PATH', root / 'lock'), patch('sphinx_inventory.robots', return_value=(False, {'status': 403})), patch('sphinx_inventory.request') as request:
                probe(source)
            request.assert_not_called()
            row = json.loads((root / 'examples/fixture.access.jsonl').read_text())
            self.assertEqual(row['outcome'], 'blocked-or-failed')
            self.assertIn('not requested', row['error'])


if __name__ == '__main__':
    unittest.main()
