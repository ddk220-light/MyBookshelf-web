import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from capture_analysis import inventory_capture_audit


class InventoryCapture(unittest.TestCase):
    def test_missing_hash_or_tampered_inventory_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'analysis/inventories').mkdir(parents=True)
            (root / 'examples').mkdir()
            body = b'{"rows": []}\n'
            name = 'analysis/inventories/example.json'
            (root / name).write_bytes(body)
            self.assertTrue(inventory_capture_audit(root))

            row = {'inventory_path': name, 'observed_at': '2026-11-05T00:00:00Z',
                   'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()},
                   'robots_evidence': {'sampled_bytes_sha256': 'a' * 64}}
            evidence = root / 'examples/example.access.jsonl'
            evidence.write_text(json.dumps(row) + '\n')
            self.assertEqual(inventory_capture_audit(root), [])
            (root / name).write_bytes(body + b' ')
            self.assertTrue(inventory_capture_audit(root))
            (root / name).write_bytes(body)
            del row['http']['sampled_bytes_sha256']
            evidence.write_text(json.dumps(row) + '\n')
            self.assertTrue(inventory_capture_audit(root))

    def test_binary_inventory_requires_matching_capture_too(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'analysis/inventories').mkdir(parents=True)
            (root / 'examples').mkdir()
            name = 'analysis/inventories/python.inv'
            body = b'Sphinx compressed metadata sample'
            (root / name).write_bytes(body)
            self.assertTrue(inventory_capture_audit(root))
            row = {'inventory_path': name, 'observed_at': '2026-11-05T00:00:00Z',
                   'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()},
                   'robots_evidence': {'sampled_bytes_sha256': 'a' * 64}}
            (root / 'examples/python.access.jsonl').write_text(json.dumps(row) + '\n')
            self.assertEqual(inventory_capture_audit(root), [])
