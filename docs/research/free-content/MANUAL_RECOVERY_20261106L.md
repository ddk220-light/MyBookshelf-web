# Manual recovery L — 6 November 2026

102 Working /31 Blocked/failed /0 Still checking of133 active connectors;1,050 current passing examples. Original44:36 Working /8 remaining.

The owner requested this manual pass after pausing hourly recovery. The schedule remains paused. Research only; no production activation.

| Requested connector | Result and scope |
|---|---|
| CMDA | Working: ten distinct title queries over29 OpenCity-indexed CMDA plan publications. Reused same-day captured metadata with original timestamp; OpenCity UUIDs are not native CMDA publication IDs. Official host policy still503. |
| FDIC | Working: ten title queries over14 official public financial-education games. Anonymous Resources UI GET `/api/game-categories` returns metadata; not a promised external API. No gameplay/download/session requests. |
| IMO | Working for a small subset: all six resolution records in MKC's public ship-recycling guide queried successfully. Native resolution symbols preserved. Historical2011–2015 guidance, not verified current law or whole MKC catalog. Six-record exception verifies every record and a negative control rather than padding ten examples. |
| India Code | Retry: official destination policy HTTP500; no catalog query sent. Wait for recovery. |
| LINCS | Retry: policy HTTP403; no target query sent. No new permitted export established. |
| Tamil maps | Retry: survey portal policy HTTP503. No personal-owner/parcel data requested. |
| DOAB/OAPEN | Previously verified OpenAlex-native book search stays Working. Metadata downloads are allowed within scope. ScholarSphere policy503 and native MEMO policy302-to-login prevented actual file requests this run; this does not prove the files themselves require login. |
| Let's Read | Official policy endpoint returns HTML, not robots instructions. Public reader-link and metadata/API discovery did not establish a usable catalog alternative. |
| OER Commons | Current ISKME page advertises metadata harvesting and API services. No current anonymous endpoint/free-use contract supplied; API integration appears under subscription services. Asking ISKME for a free read-only feed is a possible next step, not performed here. |

CMDA and FDIC empty-title controls return zero; IMO exhaustively tests its six-record subset and a negative query. Native/index identities and partial dossier limitations are explicit. No language/version/guide entry is counted as another origin.

The attempted independent US Coast Guard IMO resolution index was policy403. FDIC's published client was inspected only to a bounded2MiB prefix; its public Resources request was visible there, and the complete41KB response was captured separately. Missing/truncated responses and policy failures remain preserved.

Validation: capture, index, audit and registry validation pass;403 research tests pass. An initial sandbox test run could not bind two local test servers; the rerun with network permission passes. No capture-hash errors. Full dossier qualification remains separate from these queryability counts.

Evidence: [manual run](registry/runs/manual-recovery-20261106l/run.json), [attempts](registry/runs/manual-recovery-20261106l/observations.jsonl), [alternatives](registry/runs/manual-recovery-20261106l/alternative-research.json), [connector list](registry/connector-status.csv).
