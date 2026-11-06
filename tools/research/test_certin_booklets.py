import unittest
from pathlib import Path
from certin_booklets import interpret_policy,POLICY_URL

class CERTPolicyTests(unittest.TestCase):
    def test_only_reviewed_missing_page_with_numeric_tracking_value_is_accepted(self):
        r=Path(__file__).resolve().parents[2]/'docs/research/free-content/registry/runs/technical-recovery-20261106h'
        h={'status':200,'url':POLICY_URL,'content_type':'text/html','truncated':False}
        for file in ['certin-soft404-policy.html','certin-soft404-policy-second.html']:
            body=(r/file).read_bytes();p,e=interpret_policy(h,body)
            self.assertIsNone(p);self.assertFalse(e['access_restriction_overridden'])
        for changed in [body+b'\nUser-agent: *\nDisallow: /',body.replace(b'not found',b'access denied'),body.replace(b'_event_transid',b'challenge'),b'<html>CAPTCHA</html>']:
            self.assertIs(interpret_policy(h,changed)[0],False)
        for attrs in [{'status':403},{'url':'https://example.org/robots.txt'},{'truncated':True}]:
            self.assertIs(interpret_policy({**h,**attrs},body)[0],False)

    def test_real_exclusion_is_never_overridden(self):
        p,_=interpret_policy({'status':200,'url':POLICY_URL,'content_type':'text/plain','truncated':False},b'User-agent: *\nDisallow: /\n')
        self.assertFalse(p.can_fetch('MyBookshelf-SourceReview',POLICY_URL))


class CERTListingTests(unittest.TestCase):
    def body(self):
        return b'''<html>CERT-In has released awareness booklets<table><tr><td class="contentTD"><ul><li><b>AI booklet</b><a href="/PDF/AI_booklet.pdf">English</a><a href="/PDF/AI_booklet_Tamil.pdf">Tamil</a><li><a href="/PDF/CSH_Booklet.pdf"><b>Cyber Security Handbook</b></a></td></tr></table></html>'''

    def test_unclosed_list_language_versions_and_native_urls(self):
        from certin_booklets import parse,search
        rows=parse(self.body())
        self.assertEqual(len(rows),3)
        self.assertEqual([r['id'] for r in search(rows,{'title':'AI booklet','language':'Tamil'})],['https://www.cert-in.org.in/PDF/AI_booklet_Tamil.pdf'])
        self.assertIsNone(rows[2]['published_language_label'])
        self.assertFalse(rows[0]['reading_access_verified'])
        self.assertEqual(search(rows,{'title':'AI unrelated','language':None}),[])

    def test_duplicate_and_ambiguous_labels_fail(self):
        from certin_booklets import parse
        for body in [self.body().replace(b'AI_booklet_Tamil.pdf',b'AI_booklet.pdf'),self.body().replace(b'>Tamil<',b'>click here<')]:
            with self.assertRaises(ValueError):parse(body)

    def test_external_and_commented_links_not_catalog_items(self):
        from certin_booklets import parse
        body=self.body().replace(b'/PDF/AI_booklet_Tamil.pdf',b'https://other.invalid/PDF/Tamil.pdf')
        self.assertEqual(len(parse(body)),2)
        body=body.replace(b'</td>',b'<!--<li><a href="/PDF/hidden.pdf">Hidden</a>--></td>')
        self.assertEqual(len(parse(body)),2)

    def test_unbounded_incomplete_and_login_are_not_results(self):
        from certin_booklets import parse
        for body in [self.body()[:-7],b'<html>Login</html>',b'x'*(512*1024+1)]:
            with self.assertRaises(ValueError):parse(body)

    def test_failed_hash_or_http_cannot_verify(self):
        import hashlib
        from certin_booklets import assess,ENDPOINT
        body=self.body();source={'id':'cert-in','query':{'adapter':'certin-booklets'}}
        case={'id':'x','expected_ids':['https://www.cert-in.org.in/PDF/AI_booklet.pdf'],'request':{'method':'GET','url':ENDPOINT,'local_query':{'title':'AI booklet','language':'English'}}}
        cap={'http':{'status':200,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()}}
        self.assertEqual(assess(source,case,cap,body)['verdict'],'verified')
        self.assertEqual(assess(source,case,cap,body+b' ')['verdict'],'unverified')
        cap['http']['status']=403
        self.assertEqual(assess(source,case,cap,body)['verdict'],'unverified')


if __name__=='__main__':unittest.main()
