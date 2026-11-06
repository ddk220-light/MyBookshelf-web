import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import connector_status,source_registry
class ConnectorSelectionTests(unittest.TestCase):
 def test_excluded_source_is_retained_but_not_counted_as_failed_or_working(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'sources').mkdir()
   source={'id':'excluded','name':'Excluded provider','group':'G02','research_selection':{'included':False,'reason':'Owner excluded'},'state':'deferred','query':{'adapter':'unproven','cases':[]},'next_action':'Do not query'}
   (root/'sources/excluded.json').write_text(json.dumps(source));(root/'completion-audit.json').write_text(json.dumps({'source_gaps':{'excluded':{'passing_examples':10}}}))
   result=connector_status.generate(root)
   self.assertEqual(result['inventory_total'],1);self.assertEqual(result['totals']['total'],0);self.assertEqual(len(result['excluded_connectors']),1);self.assertEqual(result['connectors'],[])
 def test_direct_probe_rejects_excluded_source_before_network(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'sources').mkdir();(root/'sources/excluded.json').write_text(json.dumps({'research_selection':{'included':False}}))
   with patch.object(source_registry,'REGISTRY',root),patch.object(source_registry,'fetch') as fetch:
    with self.assertRaisesRegex(ValueError,'excluded by owner'):source_registry.probe('excluded')
    fetch.assert_not_called()
 def test_single_work_scope_requires_real_positive_and_empty_evidence(self):
  import copy,hashlib
  from small_catalog_coverage import verified_single_work
  fixture=Path(source_registry.REGISTRY)/'runs/technical-recovery-20261106c/marg-single-work-proof.json'
  if not fixture.exists():self.skipTest('Scoped live evidence not in this checkout')
  original=json.loads((source_registry.REGISTRY/'sources/marg-foundation.json').read_text())
  proof=json.loads(fixture.read_text())
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'proof.json';source=copy.deepcopy(original)
   def save(data):
    p.write_text(json.dumps(data));source['queryability_review']={'basis':'exhaustive-single-work-publisher-subset','evidence_path':'proof.json','evidence_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
   save(proof)
   self.assertTrue(verified_single_work(source,{'passing_examples':2},root))
   self.assertFalse(verified_single_work(source,{'passing_examples':1},root))
   self.assertEqual(connector_status.classify(source,{'passing_examples':2},root),'working')
   bad=copy.deepcopy(proof);bad['negative_query']=bad['positive_queries'][0];save(bad)
   self.assertFalse(verified_single_work(source,{'passing_examples':2},root))
   save(proof);p.write_text('{}')
   with self.assertRaisesRegex(ValueError,'hash'):verified_single_work(source,{'passing_examples':2},root)
   p.unlink()
   with self.assertRaisesRegex(ValueError,'Missing'):verified_single_work(source,{'passing_examples':2},root)
 def test_one_intermittent_success_is_not_a_working_connector(self):
  source={'state':'deferred','query':{'cases':[]}}
  self.assertEqual(connector_status.classify(source,{'passing_examples':2}),'blocked_or_failed')
