import hashlib
import unittest
import zlib

from sphinx_inventory import local_search, parse_inventory, review_candidate


class RefreshReviewTests(unittest.TestCase):
    contract = {'base_url': 'https://docs.python.org/3.15/', 'version': '3.15', 'project': 'Python'}

    def inventory(self, entries, version='3.15'):
        return (f'# Sphinx inventory version 2\n# Project: Python\n# Version: {version}\n# zlib\n'.encode()
                + zlib.compress(entries.encode()))

    def review(self, old, new, **http):
        return review_candidate(old, hashlib.sha256(old).hexdigest(), new,
            {'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(new).hexdigest(), **http}, self.contract)

    def test_removed_symbol_stays_in_accepted_snapshot_with_explicit_stale_review(self):
        old = self.inventory('json.loads py:function 1 library/json.html#$ -\npathlib.Path py:class 1 library/pathlib.html#$ -\n')
        new = self.inventory('pathlib.Path py:class 1 library/pathlib.html#$ -\n')
        result = self.review(old, new)
        self.assertEqual(result['removed_ids'], ['py:function:json.loads'])
        self.assertEqual(result['stale_ids'], ['py:function:json.loads'])
        self.assertTrue(result['snapshot_stale'])
        self.assertEqual(result['status'], 'manual-review-required')
        self.assertFalse(result['replace_accepted'])
        self.assertFalse(result['query_verified'])
        self.assertEqual(len(local_search(parse_inventory(old, self.contract['base_url'], '3.15'),
                         {'mode': 'exact_symbol', 'text': 'json.loads'})), 1)

    def test_http_error_empty_or_wrong_version_cannot_publish_an_empty_catalog(self):
        old = self.inventory('json.loads py:function 1 library/json.html#$ -\n')
        for new, http in [(b'', {'status': 503}), (self.inventory(''), {}),
                          (self.inventory('x py:function 1 x.html -\n', '3.14'), {}),
                          (old, {'truncated': True})]:
            result = self.review(old, new, **http)
            self.assertEqual(result['status'], 'candidate-rejected')
            self.assertEqual(result['accepted_entries'], 1)
            self.assertFalse(result['replace_accepted'])
            self.assertEqual(result['removed_ids'], [])

    def test_hash_changes_and_missing_capture_hash_are_not_fresh_evidence(self):
        old = self.inventory('json.loads py:function 1 library/json.html#$ -\n')
        for proof in [None, '0' * 64]:
            self.assertEqual(self.review(old, old, sampled_bytes_sha256=proof)['status'], 'candidate-rejected')
        with self.assertRaisesRegex(ValueError, 'Accepted inventory hash'):
            review_candidate(old, '0' * 64, old, {}, self.contract)

    def test_changed_target_and_added_symbol_need_review_but_unchanged_is_not_a_new_query(self):
        old = self.inventory('x py:function 1 library/x.html -\n')
        new = self.inventory('x py:function 1 library/other.html -\ny py:function 1 library/y.html -\n')
        result = self.review(old, new)
        self.assertEqual(result['changed_ids'], ['py:function:x'])
        self.assertEqual(result['added_ids'], ['py:function:y'])
        same = self.review(old, old)
        self.assertEqual(same['status'], 'unchanged')
        self.assertFalse(same['query_verified'])
        self.assertFalse(same['replace_accepted'])


if __name__ == '__main__':
    unittest.main()
