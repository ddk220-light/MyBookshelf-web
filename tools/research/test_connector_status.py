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
