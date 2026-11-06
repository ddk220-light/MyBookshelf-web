import unittest
from bookdash_queries import parse,query_url
class BookDashTests(unittest.TestCase):
 def test_variants_keep_native_urls_and_query_echo(self):
  body=b'<form method="get" action="/books"><input name="s" value="tree"></form><a title="Tree" href="https://bookdash.org/books/tree/">Tree 2 languages</a><a title="Tree SASL" href="https://bookdash.org/books/tree-sasl/">Tree SASL 2 languages</a>'
  rows=parse(body,query_url('tree'));self.assertEqual(len(rows),2);self.assertNotEqual(rows[0]['id'],rows[1]['id']);self.assertFalse(rows[0]['reading_access_verified'])
  with self.assertRaises(ValueError):parse(body,query_url('fish'))
 def test_empty_must_be_explicit(self):
  body=b'<form method="get" action="/books"><input name="s" value="zzznobook481276"></form>'
  with self.assertRaises(ValueError):parse(body,query_url('zzznobook481276'))
  self.assertEqual(parse(body+b"We haven't found any books that match your search",query_url('zzznobook481276')),[])
