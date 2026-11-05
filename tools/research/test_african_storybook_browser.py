import unittest
from african_storybook_browser import normalize
class AfricanStorybookTests(unittest.TestCase):
 def test_native_action_language_and_approval(self):
  r={'native_action':'loadBook(50307,1, false, 1);','language_id':'1133','approved':'1','title':'Elephant and Lion','reading_level':'4'}
  got=normalize([r])[0];self.assertEqual(got['id'],'50307');self.assertFalse(got['reading_access_verified']);self.assertEqual(got['language'],'English')
  for key,value in [('native_action','loadBook(secret);'),('language_id','unknown'),('approved','0')]:
   with self.assertRaises(ValueError):normalize([{**r,key:value}])
  self.assertEqual(len(normalize([r,r])),1)
  with self.assertRaises(ValueError):normalize([r,{**r,'title':'Conflicting title'}])
 def test_multilingual_actions_remain_distinct(self):
  r={'native_action':'loadBook(20739,1, true, 3);','language_id':'1104, 1133','approved':'1','title':'Akabenje'}
  got=normalize([r])[0];self.assertEqual(got['language_ids'],['1104','1133']);self.assertEqual(got['native_action_flag'],'true');self.assertIsNone(got['language'])
 def test_same_native_book_keeps_reader_variants_without_inflation(self):
  r={'native_action':'loadBook(20739,1, false, 3);','language_id':'1104','approved':'1','title':'Akabenje'}
  rows=normalize([r,{**r,'native_action':'loadBook(20739,1, true, 3);','language_id':'1104, 1133'}]);self.assertEqual(len(rows),1);self.assertEqual(len(rows[0]['reader_variants']),2)
