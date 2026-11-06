import hashlib,json,unittest
from book_catalogs import parse,assess,ENDPOINTS
from learning_catalogs import search
class CatalogTests(unittest.TestCase):
 def test_gutenberg_ids_release_dates_and_title_senses(self):
  body=b'Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\r\n1,Text,2026-01-01,"Systematic Botany",en,Writer,Plants,QK,Science\r\n2,Text,2026-01-02,"Botany Bay",en,Writer,History,D,History\r\n'
  rows=parse(body,'gutenberg-csv');self.assertEqual(rows[0]['gutenberg_release_date'],'2026-01-01');self.assertIsNone(rows[0]['print_edition']);self.assertEqual(len(search(rows,{'mode':'title_tokens','text':'botany'})),2);self.assertEqual([r['id'] for r in search(rows,{'mode':'title_tokens','text':'systematic botany'})],['1'])
  with self.assertRaises(ValueError):parse(body+body.split(b'\r\n')[1]+b'\r\n','gutenberg-csv')
 def test_standard_feed_scope_and_edition_identity(self):
  prefix=f'<feed xmlns="http://www.w3.org/2005/Atom"><id>{ENDPOINTS["standard-new-releases"]}</id><subtitle>The 15 latest books</subtitle>'
  body=(prefix+'<entry><id>https://standardebooks.org/ebooks/a/title/translator</id><title>Book</title><rights>USA public domain</rights></entry></feed>').encode();row=parse(body,'standard-new-releases')[0];self.assertTrue(row['id'].endswith('/translator'));self.assertFalse(row['reading_access_verified'])
  with self.assertRaises(ValueError):parse(body.replace(b'The 15 latest',b'All'),'standard-new-releases')
  with self.assertRaises(ValueError):parse(b'<!DOCTYPE a>'+body,'standard-new-releases')
 def test_export_hash_mismatch_rejected(self):
  source={'id':'project-gutenberg','query':{'adapter':'gutenberg-csv'}};case={'id':'q','expected_ids':['1'],'request':{'method':'GET','url':ENDPOINTS['gutenberg-csv'],'local_query':{'mode':'native_id','text':'1'}}};cap={'http':{'status':200,'truncated':False,'sampled_bytes_sha256':'0'*64,'url':ENDPOINTS['gutenberg-csv']}}
  self.assertEqual(assess(source,case,cap,b'bad')['verdict'],'unverified')
