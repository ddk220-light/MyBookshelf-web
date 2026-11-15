"""Combine country dossiers and validate evidence references; no network calls."""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path

ROOT=Path(__file__).parent
parser=argparse.ArgumentParser()
parser.add_argument('--strict',action='store_true',help='Require all25 documented country dossiers')
args=parser.parse_args()
countries=json.loads((ROOT/'countries.json').read_text())
rows=[];summaries=[];missing=[]

def evidence(country,path):
    if path is None:return None
    p=ROOT/country/path
    assert p.is_file(),f'Missing evidence: {p}'
    return str(p.relative_to(ROOT))

def cell(value):
    return str(value if value is not None else '').replace('|','\\|').replace('\n',' ')

def record_link(book,country,restricted=False,transient=False):
    title=cell(book['title']).replace('[','\\[').replace(']','\\]')
    if restricted:return title+' (policy-excluded; do not replay)'
    if transient:return title+' (captured session link is transient; use the fresh-session recipe in the dossier)'
    detail_request=book.get('detail_request') or book.get('record_request') or {}
    detail_method=book.get('detail_method',book.get('record_method',detail_request.get('method','GET')))
    if detail_method.upper()=='POST':
        return f'{title} (POST detail; [request]({country}/findings.json))'
    url=book.get('record_url')
    suffix=' (union-supplied local link; not a verified live detail)' if country=='thailand' or (country=='iraq' and '/biblio/' in (url or '')) else ''
    return f'[{title}](<{url}>)'+suffix if url else title+' (stable record link unresolved)'

for c in countries:
    slug=c['slug'];p=ROOT/slug/'findings.json'
    if not p.exists() or not (ROOT/slug/'report.md').is_file():missing.append(c['name']);continue
    d=json.loads(p.read_text())
    status=d.get('status','unspecified')
    live_assessment_complete=status.startswith('complete')
    assert (ROOT/slug/'report.md').is_file(),slug
    assert d['country_code']==c['iso3'],(slug,d.get('country_code'))
    libraries=d['libraries'];selected=[r for r in libraries if r['recommendation']=='verified_target']
    assert len(selected)<=10,(slug,len(selected))
    assert all(r['robots'].get('decision')!='restricted' for r in selected),(slug,'Restricted observation cannot be selected')
    assert len({r['id'] for r in libraries})==len(libraries),slug
    summary=dict(country=c['name'],slug=slug,region=c['region'],country_code=c['iso3'],selected=len(selected),reserves=len(libraries)-len(selected),observed=len(libraries),selected_shortfall=10-len(selected),market=d['market'],report=f'{slug}/report.md',findings=f'{slug}/findings.json',major_priorities=len(d['major_library_priorities']),blocked_or_unverified=len(d['blocked_or_unverified']),restricted_observations=sum(r['robots'].get('decision')=='restricted' for r in libraries))
    summaries.append(summary)
    summary.update(status=status,live_assessment_complete=live_assessment_complete)
    for r in libraries:
        q=r['query'];books=r['books'];rec=r['recommendation']
        assert rec in {'verified_target','reserve'},(slug,rec)
        assert q['http_status']==200 and q['text'] and q['url'] and q['checked_at_utc'],(slug,r['id'])
        assert q['method'].upper() in {'GET','POST'},(slug,r['id'])
        assert q['method'].upper()!='POST' or q.get('payload') is not None,(slug,r['id'],'missing payload')
        assert books and all(b['title'] for b in books),(slug,r['id'])
        query_evidence=evidence(slug,q['evidence_path']);query_metadata=evidence(slug,q['metadata_path'])
        for book in books:evidence(slug,book.get('evidence_path'))
        evidence(slug,r['size'].get('evidence_path'));evidence(slug,r['platform'].get('evidence_path'));evidence(slug,r['robots'].get('evidence_path'))
        assert r['integration']['live_app_tested'] is False,(slug,r['id'])
        row=dict(country=c['name'],country_code=c['iso3'],country_slug=slug,id=r['id'],library=r['name'],recommendation=rec,scope=r['scope'],platform_family=r['platform']['family'],platform=r['platform'],size=r['size'],query=q,books=books,robots=r['robots'],reader_access=r['reader_access'],integration=r['integration'],evidence_files=[query_evidence,query_metadata],source_path_base=f'{slug}/',country_findings=f'{slug}/findings.json',product_integration_completed=False)
        rows.append(row)
        row.update(policy_excluded=r['robots'].get('decision')=='restricted',selected_candidate=rec=='verified_target',transient_session_links=r['id']=='mexico-unam')

if args.strict:
    assert not missing,missing
    assert all(c['major_priorities']>=10 for c in summaries),'Each country needs ten major priorities, even if not query-verified'
assert len({(r['country_code'],r['id']) for r in rows})==len(rows)
selected=[r for r in rows if r['recommendation']=='verified_target'];reserves=[r for r in rows if r['recommendation']=='reserve']
incomplete=[c['country'] for c in summaries if not c['live_assessment_complete']]
completed=len(summaries)-len(incomplete)
output=dict(scope='Additional 25-country research; observed book responses are not national size ranks, permissions or deployed integrations.',countries_requested=25,countries_documented=len(summaries),countries_completed=completed,countries_pending=missing,countries_with_incomplete_live_assessment=incomplete,requested_selected_targets=250,observed_total=len(rows),selected_total=len(selected),reserve_total=len(reserves),restricted_observed_total=sum(r['robots'].get('decision')=='restricted' for r in rows),selected_shortfall=250-len(selected),selected_shortfall_scope='Gap against the requested250 selected targets; missing or incomplete studies are not researched zeroes.',country_summary=summaries,path_conventions='evidence_files/country_findings are inventory-relative; nested source/evidence paths resolve from source_path_base.',libraries=rows)
(ROOT/'verified-searches.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
columns=['country','library','recommendation','policy_excluded','transient_session_links','scope','platform_family','query_text','method','query_url','payload','checked_at_utc','http_status','match_type','result_count','count_note','books','size','robots','reader_access','integration','evidence_files','country_findings','source_path_base']
with (ROOT/'verified-searches.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
    for row in rows:
        q=row['query'];flat={**row,**q,'query_text':q['text'],'query_url':q['url']}
        w.writerow({k:json.dumps(flat.get(k),ensure_ascii=False) if isinstance(flat.get(k),(dict,list)) else flat.get(k) for k in columns})
md=['# Actual book-search inventory: 25 additional countries','',f'**{len(rows)} observed institutions/networks: {len(selected)} selected and {len(reserves)} reserves, across {len(summaries)} documented country studies ({completed} completed live assessments).** The requested selected target is 250. These counts do not establish national largest-ten rankings or app integration.','']
if missing:md += ['Research still pending: '+', '.join(missing)+'. These are not failed or zero-result countries.','']
if incomplete:md += ['Live assessment remains incomplete or environment-limited: '+', '.join(incomplete)+'. Source dossiers and any actual observations are retained; these countries are not failed markets.','']
md += ['[Machine-readable JSON](verified-searches.json) · [CSV](verified-searches.csv) · [Country comparison](country-comparison.md)','','| Country | Selected | Reserves | Observed | Selected shortfall |','|---|---:|---:|---:|---:|']
for c in summaries:md.append(f'| [{c["country"]}]({c["report"]}) | {c["selected"]} | {c["reserves"]} | {c["observed"]} | {c["selected_shortfall"]} |')
for c in summaries:
    slug=c['slug'];md += ['',f'## {c["country"]}','',f'[Market, size, policy and blocked-candidate analysis]({c["report"]})','','| Institution/network | Selection | Platform | Actual query | Returned book | Matching |','|---|---|---|---|---|---|']
    for r in rows:
        if r['country_slug']!=slug:continue
        q=r['query'];query=cell(q['text']);link=f'POST: {query} ([payload]({slug}/findings.json))' if q['method'].upper()=='POST' else f'[{query}](<{q["url"]}>)'
        label='selected' if r['recommendation']=='verified_target' else 'reserve'
        if r['policy_excluded']:
            label='policy-excluded observation; do not replay'
            link=query+' (historical evidence only; request link suppressed)'
        elif r['transient_session_links']:
            link=query+f' (transient session; [fresh-session recipe]({slug}/report.md))'
        md.append(f'| {cell(r["library"])} | {label} | {cell(r["platform_family"])} | {link} | {record_link(r["books"][0],slug,r["policy_excluded"],r["transient_session_links"])} | {cell(q.get("match_type"))} |')
    if not c['observed']:md += ['','No actual book-query success was verified. Major priorities and failed/restricted checks remain in the country report.']
md += ['','All query evidence and exact UTC checks are retained. Related titles, historical holdings, unavailable copies and missing stable identifiers retain their limitations in the country dossiers. No production provider was enabled.','']
(ROOT/'verified-searches.md').write_text('\n'.join(md))
comparison=['# Country comparison: 25 additional countries','',f'Documented studies: {len(summaries)}/25; completed live assessments: {completed}/25. Actual book-search observations: {len(rows)}; selected: {len(selected)}; reserves: {len(reserves)}.','', 'Counts reflect this audit and access conditions, not national LMS market shares or comparable collection sizes.','', '| Country | Selected / observed | Verified platform families | Platform strategy | Network opportunity |','|---|---:|---|---|---|']
if incomplete:comparison[4:4]=['Live assessment incomplete/environment-limited: '+', '.join(incomplete)+'.','']
for c in summaries:
    families=Counter(r['platform_family'] for r in rows if r['country_slug']==c['slug'] and r['recommendation']=='verified_target')
    family=', '.join(f'{k} ({v})' for k,v in families.most_common()) or 'No selected live query verified'
    market=c['market'];networks=market.get('network_opportunities',[])
    network='; '.join(str(n.get('name','')) for n in networks[:3])
    comparison.append(f'| [{c["country"]}]({c["report"]}) | {c["selected"]} / {c["observed"]} | {cell(family)} | {cell(market.get("platform_strategy",""))} | {cell(network)} |')
comparison += ['','[Full query evidence](verified-searches.md) · [Research protocol](PROTOCOL.md)','']
(ROOT/'country-comparison.md').write_text('\n'.join(comparison))
print(json.dumps({k:output[k] for k in ['countries_completed','observed_total','selected_total','reserve_total','selected_shortfall','countries_pending']},ensure_ascii=False))
