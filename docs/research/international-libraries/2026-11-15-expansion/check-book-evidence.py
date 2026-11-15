"""Offline evidence-presence triage; string presence does not certify semantics."""
import html
import json
from pathlib import Path
import re
import unicodedata

ROOT=Path(__file__).parent

def norm(text):
    text=html.unescape(html.unescape(text))
    text=re.sub(r'\\u([0-9a-fA-F]{4})',lambda m:chr(int(m.group(1),16)),text)
    text=re.sub(r'<[^>]+>',' ',text)
    text=unicodedata.normalize('NFKD',text).lower()
    return ' '.join(''.join(ch if ch.isalnum() else ' ' for ch in text if not unicodedata.combining(ch)).split())

data=json.loads((ROOT/'verified-searches.json').read_text());rows=[]
for r in data['libraries']:
    base=ROOT/r['source_path_base'];q=r['query'];book=r['books'][0]
    query_raw=(base/q['evidence_path']).read_text(errors='replace')
    book_path=book.get('evidence_path')
    detail_raw=(base/book_path).read_text(errors='replace') if book_path else ''
    title=norm(book['title']);record=str(book.get('record_id') or '')
    item=dict(country=r['country'],id=r['id'],library=r['library'],title=book['title'],record_id=record,
              title_in_query=bool(title and title in norm(query_raw)),
              record_id_in_query=bool(len(record)>=3 and record in html.unescape(query_raw)),
              title_in_book_evidence=bool(title and title in norm(detail_raw)),
              query_evidence=f'{r["source_path_base"]}{q["evidence_path"]}',book_evidence=f'{r["source_path_base"]}{book_path}' if book_path else None)
    item['manual_review']=not (item['title_in_query'] or item['record_id_in_query'])
    rows.append(item)
out=dict(method='First returned book only: normalized title or literal record-ID presence in the actual saved query, plus title presence in book evidence. Presence supports navigation but is not proof of correct edition, institution scope or real availability; absent strings require human review, not automatic rejection.',rows=rows,manual_review=[r for r in rows if r['manual_review']])
(ROOT/'book-evidence-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(rows=len(rows),manual_review=[dict(country=r['country'],id=r['id'],title=r['title']) for r in rows if r['manual_review']]),ensure_ascii=False))
