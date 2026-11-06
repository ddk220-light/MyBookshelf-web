import unittest
from urllib.parse import urlencode
from shodhganga_indcat import ENDPOINT, FILTER, parse, query_text


def page(records, word='agriculture', checked=True):
    form = ('<form method="get" action="'+ENDPOINT+'"><input name="word" value="'+word+'">'
            '<input name="src" value="free" checked><input name="url" value="'+FILTER+'" '+('checked' if checked else '')+'>'
            '<select name="field"><option value="allfields" selected>All</option></select></form>')
    return ('<html>'+form+'<table>'+records+'</table></html>').encode()


def row(index='th_349820', handle='10603/104233', title='Agriculture in Manipur'):
    return ('<tr><td><b>1</b></td><td><a href="https://indcat.inflibnet.ac.in/index.php/thesesrequest?id='+index+'">'+title+'</a></td></tr>'
            '<tr><td><a href="http://shodhganga.inflibnet.ac.in/handle/'+handle+'">Shodhganga</a></td></tr>')


class ShodhgangaMappingTests(unittest.TestCase):
    def test_native_mapping_preserves_both_ids_and_reported_http_link(self):
        rows, _ = parse(page(row()), 'agriculture')
        self.assertEqual(rows[0]['id'], '10603/104233')
        self.assertEqual(rows[0]['indcat_id'], 'th_349820')
        self.assertTrue(rows[0]['reported_repository_link'].startswith('http://'))
        self.assertFalse(rows[0]['reading_access_verified'])

    def test_no_guess_from_title_or_result_rank(self):
        for markup in [row(handle='bad'), row().replace('shodhganga.inflibnet.ac.in','example.org'),
                       row()+row(index='th_2',handle='10603/104233')]:
            with self.subTest(markup=markup),self.assertRaises(ValueError):parse(page(markup),'agriculture')

    def test_ambiguous_and_cross_record_links_are_rejected(self):
        duplicate='<a href="https://shodhganga.inflibnet.ac.in/handle/10603/999">other</a>'
        with self.assertRaises(ValueError):parse(page(row()+duplicate),'agriculture')
        no_link=row().split('<tr><td><a href="http:')[0]
        with self.assertRaises(ValueError):parse(page(no_link+row(index='th_2',handle='10603/2')),'agriculture')

    def test_literal_title_relevance_does_not_accept_stems(self):
        rows, summary=parse(page(row(title='Agricultural development')), 'agriculture')
        self.assertEqual(rows,[]);self.assertEqual(summary['provider_returned'],1)

    def test_query_and_filter_echo_required(self):
        for body in [page(row(),word='different'),page(row(),checked=False),page(row()).replace(b'value="allfields" selected',b'value="title" selected')]:
            with self.subTest(body=body[:100]),self.assertRaises(ValueError):parse(body,'agriculture')

    def test_bounded_document_and_true_empty_form(self):
        self.assertEqual(parse(page(''),'agriculture')[0],[])
        for body in [page(row())[:-7],b'x'*(512*1024+1),page(''.join(row(index='th_'+str(i),handle='10603/'+str(i)) for i in range(21)))]:
            with self.subTest(length=len(body)),self.assertRaises(ValueError):parse(body,'agriculture')

    def test_exact_published_anonymous_form_contract(self):
        q={'src':'free','word':'agriculture','field':'allfields','url':FILTER,'search':'simple'}
        self.assertEqual(query_text(ENDPOINT+'?'+urlencode(q)),'agriculture')
        for change in [{'url':'*'}, {'field':'title'}, {'page':'2'}, {'word':''}]:
            with self.subTest(change=change),self.assertRaises(ValueError):query_text(ENDPOINT+'?'+urlencode({**q,**change}))


if __name__=='__main__':unittest.main()
