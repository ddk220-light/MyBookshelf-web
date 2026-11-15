"""Publish a local30-country research index after the additional25 are complete."""
import csv
import json
from pathlib import Path

HERE=Path(__file__).parent
ROOT=HERE.parent
OLD=ROOT/'2026-11-14'
first=json.loads((OLD/'verified-searches.json').read_text())
new=json.loads((HERE/'verified-searches.json').read_text())
assert new['countries_completed']==25,'Finish all25 country dossiers before the global index'
assert new['countries_documented']==25 and not new['countries_with_incomplete_live_assessment']
countries=[];rows=[]
for country,count in first['selected_counts_by_country'].items():
    oldrows=[r for r in first['libraries'] if r['country']==country]
    countries.append(dict(country=country,cohort='Initial five',selected=count,reserves=sum(r['reserve'] for r in oldrows),observed=len(oldrows),report=f'2026-11-14/{country.lower()}/report.md'))
for c in new['country_summary']:
    countries.append(dict(country=c['country'],cohort='Additional25',selected=c['selected'],reserves=c['reserves'],observed=c['observed'],report=f'{HERE.name}/{c["report"]}'))
for r in first['libraries']:
    rows.append(dict(country=r['country'],cohort='Initial five',id=r['id'],library=r['library'],recommendation='reserve' if r['reserve'] else 'verified_target',platform=r['platform'],query=r['query'],method=r['method'],query_url=r['query_url'],payload=r['payload'],checked_at_utc=r['checked_at_utc'],http_status=r['http_status'],books=r['returned_books'],size=r['scale_evidence'],policy=r['policy_observation'],integration=r['integration_issues'],reader_access=r['reader_access'],country_findings=f'2026-11-14/{r["country_findings"]}',nested_path_base=f'2026-11-14/{r["source_path_base"]}',evidence_files=[f'2026-11-14/{p}' for p in r['evidence_files']],product_integration_completed=False))
for r in new['libraries']:
    q=r['query']
    rows.append(dict(country=r['country'],cohort='Additional25',id=r['id'],library=r['library'],recommendation=r['recommendation'],platform=r['platform']['name'],query=q['text'],method=q['method'],query_url=q['url'],payload=q.get('payload'),checked_at_utc=q['checked_at_utc'],http_status=q['http_status'],books=r['books'],size=r['size'],policy=r['robots'],integration=r['integration'],reader_access=r['reader_access'],country_findings=f'{HERE.name}/{r["country_findings"]}',nested_path_base=f'{HERE.name}/{r["source_path_base"]}',evidence_files=[f'{HERE.name}/{p}' for p in r['evidence_files']],product_integration_completed=False))
for r in rows:
    policy=r['policy'] if isinstance(r['policy'],dict) else {}
    r['policy_excluded']=bool(policy.get('disallowed') or policy.get('decision')=='restricted')
    r['transient_session_links']=r['id']=='mexico-unam'
assert len(countries)==30 and len({c['country'] for c in countries})==30
assert len({(r['country'],r['id']) for r in rows})==len(rows)
for r in rows:
    assert r['http_status']==200 and r['books']
    for p in r['evidence_files']+[r['country_findings']]:assert (ROOT/p).is_file(),p
selected=sum(r['recommendation']=='verified_target' for r in rows)
out=dict(scope='Thirty researched countries beyond India, across two research cohorts. Observed book results are not national largest-ten rankings, permission clearance or product integrations.',countries=30,requested_selected_targets=300,selected_total=selected,reserve_total=len(rows)-selected,observed_total=len(rows),restricted_observed_total=sum(r['policy_excluded'] for r in rows),selected_shortfall=300-selected,path_conventions='evidence_files/country_findings are relative to this directory. Nested evidence fields retain country-relative bases in nested_path_base; consult source cohort inventories for special record-request fields.',country_summary=countries,libraries=rows)
(ROOT/'all-catalogs.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
columns=['country','cohort','library','recommendation','policy_excluded','transient_session_links','platform','query','method','query_url','payload','checked_at_utc','http_status','books','size','policy','integration','reader_access','country_findings','nested_path_base','evidence_files']
with (ROOT/'all-catalogs.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
    for r in rows:w.writerow({k:json.dumps(r[k],ensure_ascii=False) if isinstance(r[k],(dict,list)) else r[k] for k in columns})
md=['# International library expansion research','',f'**30 country studies; {len(rows)} observed institutional/network catalog results, comprising {selected} selected targets and {len(rows)-selected} reserves.** The selected target was300. These studies identify practical candidates and blocked major collections, not national largest-ten rankings. No application integrations were enabled by this research.','',f'[Latest25-country analysis]({HERE.name}/README.md) · [Initial five-country analysis](2026-11-14/README.md) · [All catalog observations: CSV](all-catalogs.csv) · [JSON](all-catalogs.json)','', '| Country | Study | Selected | Reserves | Observed |','|---|---|---:|---:|---:|']
for c in countries:md.append(f'| [{c["country"]}]({c["report"]}) | {c["cohort"]} | {c["selected"]} | {c["reserves"]} | {c["observed"]} |')
md += ['', 'A reserve may have a valid book response but insufficient size evidence, partial/test coverage or an access restriction. UMT (Pakistan) and UAAAN (Mexico) are policy-excluded historical observations: do not replay their catalog requests. Both machine-readable indexes flag these observations. Institution counts differ from distinct catalog endpoints and request counts, especially for union catalogs. Book ownership, current circulation, reader eligibility and automated-access policy remain separate findings.','', 'Exact requests, timestamps, returned records, source sizes, access limits and raw or explicitly redacted response evidence are linked from each country dossier. The query inventories preserve related-title results and unresolved identifiers. Captured UNAM Aleph session links are transient; use its documented fresh-session recipe.','']
(ROOT/'README.md').write_text('\n'.join(md))
print(json.dumps(dict(countries=30,observed=len(rows),selected=selected,reserves=len(rows)-selected)))
