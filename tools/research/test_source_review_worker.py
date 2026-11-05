import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.robotparser import RobotFileParser

from run_source_reviews import TextSample, pacing_seconds, run, request


class WorkerTests(unittest.TestCase):
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
