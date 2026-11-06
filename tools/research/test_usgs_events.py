import unittest
from unittest.mock import patch
from usgs_events import capture_query, parse_events


class EventTests(unittest.TestCase):
    def feature(self):
        return {'type': 'Feature', 'id': 'fixture', 'properties': {
            'title': 'M 6 - fixture', 'url': 'https://earthquake.usgs.gov/earthquakes/eventpage/fixture',
            'time': 1000, 'updated': 2000}, 'geometry': {'type': 'Point', 'coordinates': [72.1, 23.2, 10]}}

    def test_axis_order_and_revision_are_preserved(self):
        result = parse_events(self.feature())[0]
        self.assertEqual((result['longitude'], result['latitude'], result['depth_km']), (72.1, 23.2, 10))
        self.assertEqual(result['updated_at_ms_utc'], 2000)
        self.assertEqual(parse_events({'type': 'FeatureCollection', 'features': []}), [])

    def test_duplicate_invalid_coordinate_and_destination_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            parse_events({'type': 'FeatureCollection', 'features': [self.feature(), self.feature()]})
        for coordinates in ([23, 181, 1], [23, 45, float('nan')], [23, 45], [True, 23, 1]):
            feature = self.feature(); feature['geometry']['coordinates'] = coordinates
            with self.assertRaisesRegex(ValueError, 'coordinates'):
                parse_events(feature)
        feature = self.feature(); feature['properties']['url'] = 'https://other.example/event'
        with self.assertRaisesRegex(ValueError, 'destination'):
            parse_events(feature)

    def test_empty_response_is_distinct_from_server_error(self):
        for status, outcome in [(204, 'empty'), (400, 'blocked-or-failed'), (503, 'blocked-or-failed')]:
            http = {'status': status, 'truncated': False, 'sampled_bytes_sha256': 'a' * 64}
            with patch('usgs_events.time.sleep'), patch('usgs_events.request', return_value=(http, b'')):
                row = capture_query({'format': 'geojson', 'limit': 1}, None, {})
            self.assertEqual(row['outcome'], outcome)

    def test_denied_policy_and_oversized_request_never_reach_provider(self):
        with patch('usgs_events.request') as request:
            self.assertEqual(capture_query({'format': 'geojson', 'limit': 1}, False, {})['outcome'], 'skipped')
            with self.assertRaises(ValueError):
                capture_query({'format': 'geojson', 'limit': 20}, None, {})
            request.assert_not_called()
