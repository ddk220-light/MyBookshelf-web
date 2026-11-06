import json
from pathlib import Path
import tempfile
import unittest

from capture_analysis import evidence_run_audit
from jsonl_io import read_jsonl


class JsonlBoundaryTests(unittest.TestCase):
    def test_unicode_line_separators_inside_document_do_not_split_records(self):
        records = [{'text': 'World Bank legal text\u2028continues\u2029here\u0085and यहाँ'}, {'job_id': 'second'}]
        body = ''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in records).encode()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'observations.jsonl'
            path.write_bytes(body)
            self.assertEqual(read_jsonl(path), records)
            self.assertEqual(path.read_bytes(), body)

    def test_incomplete_tail_is_ignored_only_when_explicitly_requested(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'observations.jsonl'
            path.write_bytes(b'{"job_id":"complete"}\n{"job_id":"incomplete')
            with self.assertRaises(json.JSONDecodeError):
                read_jsonl(path)
            self.assertEqual(read_jsonl(path, allow_incomplete_tail=True), [{'job_id': 'complete'}])
            path.write_bytes(b'{"job_id":"complete"}')
            self.assertEqual(read_jsonl(path), [{'job_id': 'complete'}])
            path.write_bytes(b'{bad}\n{"job_id":"complete"}')
            with self.assertRaises(json.JSONDecodeError):
                read_jsonl(path, allow_incomplete_tail=True)

    def test_run_audit_accepts_unicode_document_but_still_rejects_missing_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run = root / 'runs/fixture'
            run.mkdir(parents=True)
            (run / 'queue.json').write_text(json.dumps({'jobs': [{'id': 'one'}]}))
            row = {'job_id': 'one', 'outcome': 'captured', 'text_excerpt': 'Paragraph\u2028continued',
                   'http': {'status': 200, 'sampled_bytes_sha256': 'a' * 64},
                   'robots_evidence': {'status': 200, 'sampled_bytes_sha256': 'b' * 64}}
            path = run / 'observations.jsonl'
            path.write_text(json.dumps(row, ensure_ascii=False) + '\n')
            runs, errors = evidence_run_audit(root)
            self.assertEqual(errors, [])
            self.assertEqual(runs[0]['observations'], 1)
            del row['http']['sampled_bytes_sha256']
            path.write_text(json.dumps(row, ensure_ascii=False) + '\n')
            self.assertTrue(any('Missing capture hash' in error for error in evidence_run_audit(root)[1]))
