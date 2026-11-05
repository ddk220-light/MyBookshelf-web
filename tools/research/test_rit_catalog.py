import unittest
from rit_catalog import parse,ENDPOINT
class RITTests(unittest.TestCase):
 def body(self,page=1,total=2,next_url='https://repository.rit.edu/theses/index.2.html'):
  nxt=f'<a class="next" href="{next_url}">Next</a>' if next_url else ''
  return f'<div id="series-home"><h3 id="year_2026">2026</h3><p class="pdf"><a href="/cgi/viewcontent.cgi?article=other">PDF</a></p><p class="article-listing"><a href="https://repository.rit.edu/theses/12584">Native Thesis Title</a>, Author</p></div>Page {page} of {total}{nxt}'.encode()
 def test_native_id_is_not_download_article_and_author_not_title(self):
  p=parse(self.body(),ENDPOINT);self.assertEqual(p['results'][0]['id'],'12584');self.assertEqual(p['results'][0]['title'],'Native Thesis Title');self.assertEqual(p['results'][0]['listed_year'],'2026');self.assertFalse(p['results'][0]['reading_access_verified'])
 def test_final_window_follows_existing_number_link_without_arrow(self):
  b=self.body(108,111,None)+b'<a href="https://repository.rit.edu/theses/index.109.html" title="Page 109">109</a>'
  self.assertEqual(parse(b,ENDPOINT)['next_url'],'https://repository.rit.edu/theses/index.109.html')
  with self.assertRaises(ValueError):parse(self.body(108,111,None),ENDPOINT)
 def test_host_year_and_pagination_fail_closed(self):
  for b in [self.body(next_url='https://other.org/theses/index.2.html'),self.body(next_url='https://repository.rit.edu/theses/index.3.html'),self.body().replace(b'year_2026',b'unknown'),self.body().replace(b'https://repository.rit.edu/theses/12584',b'https://other.org/theses/12584')]:
   with self.assertRaises(ValueError):parse(b,ENDPOINT)
  self.assertIsNone(parse(self.body(2,2,None),ENDPOINT)['next_url'])
if __name__=='__main__':unittest.main()
