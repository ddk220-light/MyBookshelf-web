import unittest
from story_queries import parse,query_url,relevant
class StoryTests(unittest.TestCase):
 def test_word_relevance_avoids_catch_and_caterpillar(self):
  self.assertTrue(relevant('My Cat','cat'));self.assertTrue(relevant('Cats','cat'));self.assertFalse(relevant('Pink Caterpillar','cat'));self.assertFalse(relevant('Catch the Bunny','cat'))
 def test_nalibali_native_posts_and_query_echo(self):
  b=b'<h1>Search Results for: moon</h1><article class="elementor-post post-42 type-stories"><h3 class="elementor-post__title"><a href="https://nalibali.org/stories/moon/">The Moon</a></h3></article>'
  r=parse(b,query_url('nalibali-public','moon'),'nalibali-public')[0];self.assertEqual(r['id'],'42');self.assertFalse(r['reading_access_verified'])
  with self.assertRaises(ValueError):parse(b,query_url('nalibali-public','cat'),'nalibali-public')
 def test_storyberries_does_not_select_sidebar_posts(self):
  b=b'<h1>Search Results for: cat</h1><main id="main"><article class="post-42 type-post"><h2 class="entry-title"><a href="https://www.storyberries.com/cat/">Cat</a></h2></article></main><article class="post-99 type-post"><h2 class="entry-title">Sidebar</h2></article>'
  rows=parse(b,query_url('storyberries-public','cat'),'storyberries-public');self.assertEqual([r['id'] for r in rows],['42'])
 def test_missing_output_is_not_empty(self):
  b=b'<h1>Search Results for: nonsense</h1><main id="main"></main>'
  with self.assertRaises(ValueError):parse(b,query_url('storyberries-public','nonsense'),'storyberries-public')
 def test_storyberries_empty_requires_matching_form_value(self):
  b=b'<main id="main"><h1>Nothing Found</h1>Sorry, but nothing matched your search terms.<input name="s" value="nonsense"></main>'
  self.assertEqual(parse(b,query_url('storyberries-public','nonsense'),'storyberries-public'),[])
  with self.assertRaises(ValueError):parse(b,query_url('storyberries-public','different'),'storyberries-public')
