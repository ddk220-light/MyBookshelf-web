import unittest
from diksha_featured import parse,search

def card(title='Constitution Day',key='Constitution-Day'):
    return ('<div class="d-block w-100 position-relative"><img alt="'+title+'"><img alt="'+title+'"><div>'+''.join('<a href="https://diksha.gov.in/learn/course/do_'+str(i)+'" onclick="handleClickTelemetryEvent(\''+key+'-'+lang+'-Quiz\')">'+label+'</a>' for i,lang,label in [(1,'English','Click here to play the quiz'),(2,'Hindi','प्रश्नोत्तरी खेलने के लिए क्लिक करें')])+'</div></div>')
class FeaturedTests(unittest.TestCase):
    def test_language_variants_and_empty_control(self):
        data=parse((card()+'<footer></footer>').encode());self.assertEqual(len(data['records']),2)
        self.assertEqual(search(data['records'],{'topic':'Constitution','link_language':'Hindi'})[0]['id'],'do_2')
        self.assertEqual(search(data['records'],{'topic':'unmatched','link_language':'English'}),[])
    def test_unreviewed_banner_is_quarantined_not_relabelled(self):
        data=parse((card()+card('Different banner','Different')+'<footer></footer>').encode());self.assertEqual(len(data['records']),2);self.assertEqual(len(data['quarantined_cards']),1)
    def test_changed_tracking_contract_or_incomplete_capture_fails(self):
        with self.assertRaises(ValueError):parse(card().encode())
        with self.assertRaises(ValueError):parse((card(key='Wrong')+'<footer></footer>').encode())
if __name__=='__main__':unittest.main()
