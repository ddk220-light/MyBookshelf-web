import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.robotparser import RobotFileParser

from run_source_reviews import TextSample, pacing_seconds, run, request, robots


class WorkerTests(unittest.TestCase):
    def test_html_login_or_app_shell_cannot_silently_allow_collection(self):
        for content_type, body in [
            ('text/html', b'<html><title>Sign in</title></html>'),
            ('text/plain', b'<!DOCTYPE html><html>Challenge</html>'),
            ('application/json', b'{"error":"auth required"}'),
            ('text/plain', b'\xffUser-agent: *'),
        ]:
            with self.subTest(content_type=content_type, body=body):
                response = {'status': 200, 'truncated': False, 'content_type': content_type}
                with patch('run_source_reviews.request', return_value=(response, body)):
                    policy, evidence = robots('https://example.org/catalog')
                self.assertIs(policy, False)
                self.assertIn('policy_error', evidence)

    def test_empty_plain_robots_and_404_remain_distinct_from_denial(self):
        for status, body in [(200, b''), (404, b'<html>Not found</html>')]:
            with patch('run_source_reviews.request', return_value=(
                    {'status': status, 'truncated': False, 'content_type': 'text/plain'}, body)):
                policy, _ = robots('https://example.org/catalog')
            if status == 404:
                self.assertIsNone(policy)
            else:
                self.assertTrue(policy.can_fetch('ResearchAgent', '/catalog'))
        with patch('run_source_reviews.request', return_value=(
                {'status': 200, 'truncated': False, 'content_type': 'text/plain'},
                b'\xef\xbb\xbfUser-agent: *\nDisallow: /catalog\n')):
            policy, _ = robots('https://example.org/catalog')
        self.assertFalse(policy.can_fetch('ResearchAgent', '/catalog'))

    def test_scripts_are_not_collected_as_document_text(self):
        p = TextSample()
        p.feed('<title>API documentation</title><script>privateCode()</script><p>Public search contract</p>')
        self.assertEqual(p.title, ['API documentation'])
        self.assertNotIn('privateCode()', '\n'.join(p.parts))
        self.assertIn('Public search contract', p.parts)

    def test_redirect_is_saved_without_requesting_unreviewed_destination(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        visits = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                visits.append(self.path)
                self.send_response(302)
                self.send_header('Location', '/unreviewed-policy')
                self.end_headers()
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            result, _ = request('http://127.0.0.1:' + str(server.server_port) + '/known')
            self.assertEqual(result['status'], 302)
            self.assertEqual(result['redirect_location'], '/unreviewed-policy')
            self.assertEqual(visits, ['/known'])
            self.assertEqual(len(result['sampled_bytes_sha256']), 64)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_provider_delay_is_never_shortened(self):
        p = RobotFileParser()
        p.parse(['User-agent: *', 'Crawl-delay: 90', 'Request-rate: 1/120'])
        self.assertEqual(pacing_seconds(p), 120)

    def test_json_negotiation_and_public_paging_headers_are_preserved(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                is_json = self.headers.get('Accept') == 'application/json'
                self.send_header('Content-Type', 'application/json' if is_json else 'application/xml')
                self.send_header('Link', '<https://example.org/records?page=2>; rel="next"')
                self.send_header('X-Total-Count', '2')
                self.send_header('Set-Cookie', 'private-session=not-evidence')
                self.end_headers()
                self.wfile.write(b'[]' if is_json else b'<records/>')
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            result, body = request('http://127.0.0.1:' + str(server.server_port), headers={'Accept': 'application/json'})
            self.assertEqual(json.loads(body), [])
            self.assertEqual(result['response_headers']['X-Total-Count'], '2')
            self.assertIn('page=2', result['response_headers']['Link'])
            self.assertNotIn('Set-Cookie', result['response_headers'])
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_denied_host_is_not_retried_and_resume_does_not_repeat_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jobs = [{'id': str(i), 'url': f'https://example.org/{i}', 'source_ids': [], 'lead_ids': []} for i in range(2)]
            # Keep the real advisory-lock behavior, but isolate its file from a
            # researcher or worker holding the production lock in this environment.
            with patch('run_source_reviews.Path', return_value=root / 'worker.lock'), patch('run_source_reviews.REGISTRY', root), patch('run_source_reviews.build_queue', return_value=jobs), patch('run_source_reviews.robots', return_value=(None, {'status': 404})), patch('run_source_reviews.pace'), patch('run_source_reviews.request', return_value=({'status': 403}, b'')) as fetch:
                run('fixture')
                run('fixture')
            self.assertEqual(fetch.call_count, 1)
            rows = [json.loads(line) for line in (root / 'runs/fixture/observations.jsonl').read_text().splitlines()]
            self.assertEqual([r['outcome'] for r in rows], ['blocked-or-failed', 'skipped'])
            state = json.loads((root / 'runs/fixture/progress.json').read_text())
            self.assertEqual(state['processed'], 2)
            self.assertFalse(state['goal_complete'])


if __name__ == '__main__':
    unittest.main()
