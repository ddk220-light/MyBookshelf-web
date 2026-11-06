import copy
import hashlib
import json
import unittest
from urllib.parse import quote
from snapplify_search import ENDPOINT, assess, parse, query_title, search_data, zero_price


class SnapplifySearchTests(unittest.TestCase):
    def setUp(self):
        self.row = {'entity_id': '7413889', 'title': 'The Best Thing Ever',
                    'url': '/product/the-best-thing-ever', 'reference_code': '9781928318552',
                    'price': 0, 'gross': 0, 'availableInCountry': True, 'canAddToCart': True,
                    'displayGrossPrice': 'R 0.00', 'customer': {'email': 'must-not-be-retained'}}
        self.url = ENDPOINT + '?term=' + quote(self.row['title'])

    def body(self, rows=None, **patch):
        d = {'term': self.row['title'], 'total': 1, 'page': 0, 'size': 10,
             'items': [self.row] if rows is None else rows, **patch}
        return ('<html><script>realmCommerceApp.value("searchData",' + json.dumps(d) + ');</script></html>').encode()

    def test_only_public_bounded_form_is_permitted(self):
        self.assertEqual(query_title(self.url), self.row['title'])
        for url in [self.url + '&page=1', self.url + '&term=other', self.url.replace('/search?', '/customer/login?'), self.url.replace('https:', 'http:')]:
            with self.assertRaises(ValueError): query_title(url)

    def test_documented_publisher_facet_must_be_echoed_and_satisfied(self):
        url = self.url + '&modifiers=' + quote('{"publisher":"Book Dash"}')
        self.assertEqual(query_title(url), self.row['title'])
        item = {**self.row, 'publisher': 'Book Dash'}
        rows, _ = parse(self.body([item], modifiers={'publisher': 'Book Dash'}), self.row['title'], 'Book Dash')
        self.assertEqual(len(rows), 1)
        with self.assertRaises(ValueError): parse(self.body([item]), self.row['title'], 'Book Dash')
        with self.assertRaises(ValueError): parse(self.body([self.row], modifiers={'publisher': 'Book Dash'}), self.row['title'], 'Book Dash')
        with self.assertRaises(ValueError): query_title(self.url + '&modifiers=' + quote('{"secret":true}'))

    def test_preserve_product_identity_without_claiming_reading_or_isbn_validation(self):
        rows, meta = parse(self.body(), self.row['title'])
        self.assertEqual(rows[0]['id'], 'snapplify:7413889')
        self.assertFalse(rows[0]['reading_access_verified'])
        self.assertFalse(rows[0]['reference_code_is_validated_isbn'])
        self.assertNotIn('customer', rows[0])

    def test_paid_unavailable_and_wrong_titles_are_excluded(self):
        rows = [self.row, {**self.row, 'entity_id': '2', 'price': 10},
                {**self.row, 'entity_id': '3', 'canAddToCart': False},
                {**self.row, 'entity_id': '4', 'title': 'Different book'}]
        result, meta = parse(self.body(rows, total=4), self.row['title'])
        self.assertEqual(len(result), 1)
        self.assertEqual(meta['excluded'], {'not_zero_price': 1, 'not_available': 1, 'nonmatching_title': 1})
        self.assertEqual(meta['provider_total'], 4)

    def test_unknown_nonfinite_boolean_or_missing_prices_are_not_free(self):
        for value in [None, False, True, '', 'NaN', 'Infinity', -1, 'free']:
            self.assertFalse(zero_price(value), value)
        for value in [0, 0.0, '0.00']:
            self.assertTrue(zero_price(value))

    def test_duplicate_missing_and_external_identity_fail(self):
        for rows in [[self.row, self.row], [{**self.row, 'entity_id': ''}], [{**self.row, 'url': 'https://other.example/book'}]]:
            with self.assertRaises(ValueError): parse(self.body(rows), self.row['title'])

    def test_fallback_empty_query_or_oversized_page_cannot_satisfy_query(self):
        for patch in [{'term': ''}, {'page': 1}, {'size': 100}]:
            with self.assertRaises(ValueError): parse(self.body(**patch), self.row['title'])
        self.assertEqual(parse(self.body([], total=0), self.row['title'])[0], [])

    def test_js_expressions_duplicates_and_incomplete_pages_are_rejected(self):
        for body in [self.body().replace(b');', b'+maliciousFunction());'), self.body() + self.body(), self.body().replace(b'</html>', b'')]:
            with self.assertRaises(ValueError): search_data(body)

    def test_response_evidence_must_be_successful_complete_and_hash_matched(self):
        source = {'id': 'snapplify', 'query': {'adapter': 'snapplify-shop'}}
        case = {'id': 'test', 'request': {'method': 'GET', 'url': self.url}, 'expected_ids': ['snapplify:7413889']}
        body = self.body(); cap = {'http': {'status': 200, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()}}
        self.assertEqual(assess(source, case, cap, body)['verdict'], 'verified')
        for patch in [{'status': 403}, {'truncated': True}, {'sampled_bytes_sha256': '0' * 64}]:
            changed = copy.deepcopy(cap); changed['http'].update(patch)
            self.assertEqual(assess(source, case, changed, body)['verdict'], 'unverified')


if __name__ == '__main__':
    unittest.main()
