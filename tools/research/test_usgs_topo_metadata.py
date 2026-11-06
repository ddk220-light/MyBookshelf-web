import csv
import hashlib
import io
import unittest
import zipfile
from unittest.mock import patch

from usgs_topo_metadata import ENDPOINT, FIELDS, parse, search, assess, probe


def row(**updates):
    value = {k: '' for k in FIELDS}
    value.update(product_auth_id='1001', gnis_cell_id='100', series='US Topo', edition='Current',
                 map_name='San Francisco North', primary_state='California', date_on_map='2021',
                 publication_date='2021-01-01', production_date='2021-01-01', distribution_date='2026-11-06',
                 product_inventory_uuid='12345678-abcd-1234-abcd-123456789abc',
                 db_uuid='12345678-abcd-1234-abcd-123456789def', inv_uuid='12345678-abcd-1234-abcd-123456789fed',
                 product_url='https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/USTopo/Current/PDF/CA/CA_San_Francisco_North.pdf',
                 product_filename='CA_San_Francisco_North.pdf')
    return {**value, **updates}


def archive(rows, count=None, extra=False, missing=None):
    out = io.BytesIO()
    fields = sorted(FIELDS - {missing} if missing else FIELDS)
    table = io.StringIO(newline='')
    writer = csv.DictWriter(table, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('ustopo_current.csv', table.getvalue())
        z.writestr('ustopo_current.txt', f'Total Files | {len(rows) if count is None else count}\nLast Updated | 2026-11-06\n')
        z.writestr('ustopo_current_readme.txt', 'Public metadata field documentation')
        if extra:
            z.writestr('../unexpected.pdf', 'not metadata')
    return out.getvalue()


class TopoMetadataTests(unittest.TestCase):
    def test_version_identity_and_snapshot_dates_preserved(self):
        data = parse(archive([row()]))
        item = data['records'][0]
        self.assertEqual(item['id'], '1001')
        self.assertEqual(item['gnis_cell_id'], '100')
        self.assertEqual(item['date_on_map'], '2021')
        self.assertEqual(data['provider_updated'], '2026-11-06')
        self.assertNotEqual(item['db_uuid'], item['inv_uuid'])
        self.assertFalse(item['reading_access_verified'])

    def test_literal_title_and_exact_state_filters(self):
        rows = parse(archive([row()]))['records']
        self.assertEqual(search(rows, {'field':'title','value':'San North','state':'California'}), rows)
        self.assertEqual(search(rows, {'field':'title','value':'San','state':'Texas'}), [])
        self.assertEqual(search(rows, {'field':'title','value':'Franc'}), [])
        self.assertEqual(search(rows, {'field':'id','value':'1001'}), rows)
        self.assertEqual(search(rows, {'field':'title','value':'qzxnevermatch2026'}), [])

    def test_incomplete_archive_and_wrong_count_fail(self):
        for body in [b'not zip', archive([row()])[:-15], archive([row()], count=2),
                     archive([row()], extra=True), archive([row()], missing='inv_uuid')]:
            with self.assertRaises(ValueError):
                parse(body)

    def test_conflicting_versions_are_not_merged(self):
        safe = row(product_auth_id='2001', gnis_cell_id='200', product_url=row()['product_url'].replace('North','South'), product_filename=row()['product_filename'].replace('North','South'))
        data = parse(archive([row(), row(product_auth_id='1002'), safe]))
        self.assertEqual([x['id'] for x in data['records']], ['2001'])
        self.assertEqual(len(data['excluded']), 2)

    def test_untrusted_product_links_and_historical_rows_not_counted(self):
        for bad in [row(product_url='https://other.example/map.pdf'), row(edition='Historical'),
                    row(product_inventory_uuid='not-uuid'), row(product_auth_id=''),
                    row(product_filename='wrong.pdf')]:
            with self.assertRaises(ValueError):
                parse(archive([bad]))

    def test_capture_hash_and_reused_parse_must_match(self):
        body = archive([row()]); data = parse(body)
        cap = {'http': {'status':200,'truncated':False,'sampled_bytes_sha256':hashlib.sha256(body).hexdigest()}}
        source = {'id':'usgs-national-map','query':{'adapter':'usgs-topo-metadata'}}
        case = {'id':'north','expected_ids':['1001'],'request':{'method':'GET','url':ENDPOINT,'local_query':{'field':'title','value':'North'}}}
        self.assertEqual(assess(source,case,cap,body,data)['verdict'],'verified')
        data['archive_sha256']='incorrect'
        self.assertEqual(assess(source,case,cap,body,data)['verdict'],'unverified')

    def test_policy_failure_prevents_export_download(self):
        with patch('usgs_topo_metadata.robots',return_value=(False,{})), patch('usgs_topo_metadata.request') as fetch:
            probe({'id':'usgs-national-map','query':{'endpoint':ENDPOINT,'cases':[]}})
            fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
