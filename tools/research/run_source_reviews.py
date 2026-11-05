#!/usr/bin/env python3
"""Run the pending primary-document evidence queue; never mark sources qualified."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

from source_registry import REGISTRY, ROOT, USER_AGENT
from jsonl_io import read_jsonl

BRANCH = 'research/free-content-discovery-expansion'
LIMIT = 512 * 1024


def now():
    return datetime.now(timezone.utc).isoformat()


def save(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


class TextSample(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.in_title = False
        self.title = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag == 'title':
            self.in_title = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.skip:
            return
        if self.in_title:
            self.title.append(data.strip())
        if data.strip():
            self.parts.append(data.strip())


class ReviewRedirects(urllib.request.HTTPRedirectHandler):
    # A redirect can change the applicable robots policy or operator. Preserve
    # its destination for review instead of silently requesting another route.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, limit=LIMIT, headers=None):
    start = time.monotonic()
    result = {'requested_at': now(), 'url': url, 'status': None}
    body = b''
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, **(headers or {})})
        try:
            response = urllib.request.build_opener(ReviewRedirects()).open(req, timeout=20)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            result.update(status=response.status, final_url=response.url,
                          content_type=response.headers.get('Content-Type'),
                          redirect_location=response.headers.get('Location'),
                          response_headers={key: response.headers[key] for key in
                                            ('Link', 'X-Total-Count', 'Retry-After', 'Content-Encoding') if key in response.headers})
            body = response.read(limit + 1)
    except OSError as exc:
        result['error'] = str(exc)
    result.update(seconds=round(time.monotonic() - start, 3), bytes_read=len(body),
                  truncated=len(body) > limit, sampled_bytes_sha256=hashlib.sha256(body).hexdigest())
    return result, body


def build_queue():
    jobs = {}
    leads = json.loads((REGISTRY / 'discovery-links.json').read_text())['leads']
    for lead in leads:
        if lead['state'] == 'untriaged':
            jobs.setdefault(lead['url'], {'lead_ids': [], 'source_ids': []})['lead_ids'].append(lead['id'])
    for path in sorted((REGISTRY / 'sources').glob('*.json')):
        source = json.loads(path.read_text())
        if source['state'] == 'candidate':
            for url in source['documentation']:
                jobs.setdefault(url, {'lead_ids': [], 'source_ids': []})['source_ids'].append(source['id'])
    return [{'id': hashlib.sha256(url.encode()).hexdigest()[:20], 'url': url, **refs}
            for url, refs in jobs.items() if url.startswith('https://')]


def robots(url):
    parsed = urllib.parse.urlsplit(url)
    address = f'{parsed.scheme}://{parsed.netloc}/robots.txt'
    observation, body = request(address, 64 * 1024)
    if observation['status'] == 404:
        return None, observation
    if observation['status'] != 200 or observation['truncated']:
        return False, observation
    # A successful HTML app/login/challenge page is not an empty robots file.
    # RobotFileParser silently ignores its markup and would otherwise allow all
    # paths. Preserve the response evidence and defer instead of inferring access.
    content_type = (observation.get('content_type') or '').lower()
    prefix = body.lstrip(b'\xef\xbb\xbf \t\r\n').lower()
    if ('html' in content_type or 'json' in content_type
            or prefix.startswith((b'<!doctype', b'<html', b'<?xml', b'{', b'['))):
        observation['policy_error'] = 'Non-robots HTML/JSON/XML response; policy unavailable'
        return False, observation
    try:
        text = body.decode('utf-8-sig')
    except UnicodeError:
        observation['policy_error'] = 'Robots response is not valid UTF-8; policy unavailable'
        return False, observation
    parser = urllib.robotparser.RobotFileParser(address)
    parser.parse(text.splitlines())
    return parser, observation


def pacing_seconds(policy):
    if policy in (None, False):
        return 3
    rate = policy.request_rate(USER_AGENT)
    return max(3, policy.crawl_delay(USER_AGENT) or 0, rate.seconds / rate.requests if rate else 0)


def pace(seconds, progress_path, state):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(min(20, deadline - time.monotonic()))
        state['heartbeat_at'] = now()
        save(progress_path, state)


def publish(directory):
    branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip()
    if branch != BRANCH:
        return {'status': 'blocked', 'reason': 'Unexpected branch; no commit or push attempted.'}
    relative = str(directory.relative_to(ROOT))
    # --only ensures an unrelated staged change cannot enter this checkpoint.
    try:
        subprocess.run(['git', 'add', '--', relative], cwd=ROOT, check=True, capture_output=True)
        changed = subprocess.run(['git', 'diff', '--cached', '--quiet', '--', relative], cwd=ROOT).returncode
        if changed:
            subprocess.run(['git', 'commit', '--only', '-m', 'Checkpoint running source documentation review', '--', relative],
                           cwd=ROOT, check=True, capture_output=True)
        subprocess.run(['git', 'push', 'origin', 'HEAD:refs/heads/' + BRANCH], cwd=ROOT,
                       check=True, capture_output=True, timeout=60)
        sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        return {'status': 'pushed', 'commit': sha, 'at': now()}
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        return {'status': 'failed', 'reason': type(exc).__name__, 'at': now(),
                'next_action': 'Retain local evidence. Reconcile remote/index changes without force-push.'}


def run(run_id, do_publish=False):
    if not run_id or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in run_id):
        raise ValueError('Use a simple stable run identifier')
    directory = REGISTRY / 'runs' / run_id
    directory.mkdir(parents=True, exist_ok=True)
    # One writer across all run IDs; advisory lock is released if the process dies.
    lock = Path('/tmp/mybookshelf-source-review.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    queue_path = directory / 'queue.json'
    if not queue_path.exists():
        save(queue_path, {'created_at': now(), 'jobs': build_queue()})
    jobs = json.loads(queue_path.read_text())['jobs']
    output = directory / 'observations.jsonl'
    existing = read_jsonl(output)
    done = {row['job_id'] for row in existing}
    state = {'run_id': run_id, 'phase': 'primary-document-evidence', 'pid': os.getpid(),
             'started_at': now(), 'state': 'running', 'total': len(jobs), 'processed': len(done),
             'goal_complete': False, 'note': 'Captures policy/query/documentation evidence for review; does not complete source dossiers or count as verified search examples.'}
    save(directory / 'progress.json', {**state, 'heartbeat_at': now()})
    policies, blocked_hosts = {}, set()
    try:
        for job in jobs:
            if job['id'] in done:
                continue
            state.update(current_job=job, heartbeat_at=now())
            save(directory / 'progress.json', state)
            host = urllib.parse.urlsplit(job['url']).netloc
            if host not in policies:
                policies[host] = robots(job['url'])
                pace(pacing_seconds(policies[host][0]), directory / 'progress.json', state)
            policy, policy_observation = policies[host]
            allowed = host not in blocked_hosts and policy is not False and (policy is None or policy.can_fetch(USER_AGENT, job['url']))
            row = {'job_id': job['id'], 'observed_at': now(), 'source_ids': job['source_ids'],
                   'lead_ids': job['lead_ids'], 'url': job['url'], 'robots_evidence': policy_observation,
                   'classification': 'awaiting-analysis', 'query_verified': False}
            if not allowed:
                row.update(outcome='skipped', reason='robots rule, unavailable robots policy, or earlier access/rate denial on this host')
            else:
                http, body = request(job['url'])
                row['http'] = http
                row['outcome'] = 'captured' if http['status'] == 200 else 'blocked-or-failed'
                if http['status'] in (403, 429, 503):
                    blocked_hosts.add(host)
                content_type = http.get('content_type', '') or ''
                if http['status'] == 200 and ('html' in content_type or 'text/plain' in content_type):
                    parser = TextSample()
                    parser.feed(body[:LIMIT].decode('utf-8', errors='replace'))
                    row['title'] = ' '.join(parser.title)[:500]
                    row['text_excerpt'] = '\n'.join(parser.parts)[:12000]
                    row['excerpt_is_complete_document'] = False
            with output.open('a') as stream:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
                stream.flush()
                os.fsync(stream.fileno())
            done.add(job['id'])
            state.update(processed=len(done), heartbeat_at=now(), last_outcome=row['outcome'])
            save(directory / 'progress.json', state)
            print(f'{len(done)}/{len(jobs)} {row["outcome"]} {job["url"]}', flush=True)
            if do_publish and len(done) % 10 == 0:
                state['last_publication'] = publish(directory)
            pace(pacing_seconds(policy), directory / 'progress.json', state)
        state.update(state='evidence-pass-complete', completed_at=now(), current_job=None, heartbeat_at=now())
    except BaseException as exc:
        state.update(state='interrupted', error=type(exc).__name__, heartbeat_at=now())
        raise
    finally:
        save(directory / 'progress.json', state)
        if do_publish:
            publication = publish(directory)
            print(json.dumps({'final_publication': publication}), flush=True)
        lock.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run_id')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    run(args.run_id, args.publish)
