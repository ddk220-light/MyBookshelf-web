import unittest
from scielo_articlemeta import parse,make_request

class ArticleMetaTests(unittest.TestCase):
    def fixture(self):
        return {'code':'S0100-879X1998000800002','collection':'scl','article':{'code':'S0100-879X1998000800002','collection':'scl','v12':[{'_':'A <i>specific</i> article','l':'en'}]},'title':{'v100':[{'_':'Journal, not article'}]},'fulltexts':{'html':{'en':'http://www.scielo.br/scielo.php?pid=S0100-879X1998000800002'}}}
    def test_article_title_and_collection_identity(self):
        d=self.fixture();r=parse(d,d['code'],'scl')[0]
        self.assertEqual(r['title'],'A specific article');self.assertEqual(r['id'],'scl:'+d['code']);self.assertFalse(r['reading_access_verified']);self.assertFalse(r['reported_content_links'][0]['fetched'])
    def test_wrong_identity_and_unexpected_body_rejected(self):
        for field,value in [('code','S0100-879X1998000900002'),('collection','esp'),('body','unexpected body')]:
            d=self.fixture();d[field]=value
            with self.assertRaises(ValueError):parse(d,'S0100-879X1998000800002','scl')
    def test_request_has_no_body_and_rejects_unreviewed_inputs(self):
        self.assertEqual(make_request('S0100-879X1998000800002')['params']['body'],'false')
        for code,collection in [('invalid','scl'),('S0100-879X1998000800002','esp')]:
            with self.assertRaises(ValueError):make_request(code,collection)

if __name__=='__main__':unittest.main()
