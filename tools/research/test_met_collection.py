import unittest
from source_registry import normalize


class MetSubsetTests(unittest.TestCase):
    source = {'query': {'adapter': 'met-collection'}}

    def test_metadata_or_missing_image_is_not_full_public_domain_image_evidence(self):
        good = {'objectID': 123, 'title': 'Study', 'isPublicDomain': True, 'primaryImage': 'https://images.metmuseum.org/example.jpg'}
        result = normalize(self.source, good)[0]
        self.assertEqual(result['id'], '123')
        self.assertFalse(result['reading_access_verified'])
        for fields in [{'isPublicDomain': False}, {'isPublicDomain': 'true'}, {'primaryImage': ''},
                       {'objectID': True}, {'objectID': None}, {'title': ''}]:
            with self.assertRaises(ValueError):
                normalize(self.source, {**good, **fields})

    def test_equal_titles_and_accession_numbers_do_not_merge_native_objects(self):
        ids = [normalize(self.source, {'objectID': oid, 'title': 'Same title',
                   'accessionNumber': 'Shared accession', 'isPublicDomain': True,
                   'primaryImage': 'https://images.metmuseum.org/example.jpg'})[0]['id'] for oid in [1, 2]]
        self.assertEqual(ids, ['1', '2'])
