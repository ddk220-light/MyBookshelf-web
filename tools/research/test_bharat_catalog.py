import unittest
from bharat_catalog import parse
from metadata_links import local_search

class BharatCatalog(unittest.TestCase):
    def test_preserves_published_year_language_and_resource_identity(self):
        body=b'<h3>Electrician Ebooks</h3><a href="/pdf/E_Books/CTS/118/English/TP/First%20Year.pdf">Trade Practical 1st Year English</a><a href="/pdf/E_Books/CTS/118/Hindi/TP/First%20Year.pdf">Trade Practical 1st Year Hindi</a><a href="https://other.example/file.pdf">Unrelated</a>'
        rows=parse(body);self.assertEqual(len(rows),2)
        self.assertNotEqual(rows[0]['id'],rows[1]['id'])
        self.assertEqual(len(local_search(rows,{'field':'title','value':'1st Year Hindi'})),1)
        self.assertEqual(local_search(rows,{'field':'title','value':'zzqxnomatch671932'}),[])
        self.assertFalse(rows[0]['reading_access_verified'])
        with self.assertRaises(ValueError):parse(body.replace(b'Electrician Ebooks',b'Welder Ebooks'))
    def test_wrong_host_and_conflicting_labels_do_not_become_books(self):
        with self.assertRaises(ValueError):parse(b'<h3>Electrician Ebooks</h3><a href="https://other.example/pdf/E_Books/CTS/118/x.pdf">Book</a>')
        with self.assertRaises(ValueError):parse(b'<h3>Electrician Ebooks</h3><a href="/pdf/E_Books/CTS/118/x.pdf">One</a><a href="/pdf/E_Books/CTS/118/x.pdf">Two</a>')
