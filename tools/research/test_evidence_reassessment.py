import json
from pathlib import Path
import tempfile
import unittest
from capture_analysis import evidence_run_audit
class EvidenceReassessmentTests(unittest.TestCase):
 def test_only_independent_matching_capture_permits_reassessment(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);d=r/'runs/a';d.mkdir(parents=True);proof=r/'runs/proof';proof.mkdir()
   (d/'queue.json').write_text(json.dumps({'jobs':[{'id':'j','url':'https://example.org'}]}))
   http={'status':200,'sampled_bytes_sha256':'a'*64};policy={'sampled_bytes_sha256':'b'*64}
   first={'job_id':'j','url':'https://example.org','observed_at':'2026-11-05T01:00:00Z','outcome':'blocked-or-failed','http':http,'robots_evidence':policy}
   original={**first,'observed_at':'2026-11-05T02:00:00Z','outcome':'captured'}
   (proof/'observations.jsonl').write_text(json.dumps(original)+'\n')
   second={**original,'reassessment_at':'2026-11-05T03:00:00Z','capture_reused_from':'runs/proof/observations.jsonl'}
   for row,valid in [(second,True),({**second,'http':{**http,'sampled_bytes_sha256':'c'*64}},False),(original,False),({**second,'capture_reused_from':'missing'},False)]:
    (d/'observations.jsonl').write_text(json.dumps(first)+'\n'+json.dumps(row)+'\n')
    runs,errors=evidence_run_audit(r);self.assertEqual(not errors,valid);self.assertEqual(runs[0]['jobs'],1);self.assertEqual(runs[0]['observations'],2)
if __name__=='__main__':unittest.main()
