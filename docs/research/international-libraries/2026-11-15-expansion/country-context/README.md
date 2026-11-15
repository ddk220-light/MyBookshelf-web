# Country-selection context

The 25 additional countries are all low- or middle-income economies in the World Bank metadata retrieved 15 November 2026. Each had more than 20 million residents in 2024. The set balances population, regional diversity and plausible library-integration opportunities; it is not a ranking of infrastructure deprivation.

| Country | Region | Population 2024, millions | Income group at retrieval |
|---|---|---:|---|
| Brazil | Latin America | 212.0 | Upper middle income |
| Mexico | Latin America | 130.9 | Upper middle income |
| Colombia | Latin America | 52.9 | Upper middle income |
| Peru | Latin America | 34.2 | Upper middle income |
| Argentina | Latin America | 45.7 | Upper middle income |
| Vietnam | Asia | 101.0 | Upper middle income |
| Thailand | Asia | 71.7 | Upper middle income |
| Nepal | Asia | 29.7 | Lower middle income |
| Sri Lanka | Asia | 21.9 | Upper middle income |
| Türkiye | Asia | 85.5 | Upper middle income |
| Egypt | Middle East and North Africa | 116.5 | Lower middle income |
| Morocco | Middle East and North Africa | 38.1 | Lower middle income |
| Algeria | Middle East and North Africa | 46.8 | Upper middle income |
| Iraq | Middle East and North Africa | 46.0 | Upper middle income |
| Ethiopia | Sub-Saharan Africa | 132.1 | Low income |
| Democratic Republic of the Congo | Sub-Saharan Africa | 109.3 | Low income |
| Kenya | Sub-Saharan Africa | 56.4 | Lower middle income |
| Tanzania | Sub-Saharan Africa | 68.6 | Lower middle income |
| Uganda | Sub-Saharan Africa | 50.0 | Low income |
| Ghana | Sub-Saharan Africa | 34.4 | Lower middle income |
| Cameroon | Sub-Saharan Africa | 29.1 | Lower middle income |
| Côte d’Ivoire | Sub-Saharan Africa | 31.9 | Lower middle income |
| Angola | Sub-Saharan Africa | 37.9 | Lower middle income |
| Mozambique | Sub-Saharan Africa | 34.6 | Low income |
| South Africa | Sub-Saharan Africa | 64.0 | Upper middle income |

Population totals 1.681 billion across the 25, but this is not an estimate of library users, eligible borrowers or product demand. National income is context, not a measure of catalog completeness, local infrastructure or public borrowing rights. Country dossiers investigate the actual library conditions.

Sources: [population API request](population-2024-request.json), [income metadata request](country-metadata-request.json). Original JSON responses and [normalized values](summary.json) are retained alongside the request files. An optional internet-use query mostly returned missing latest-period values and a latest-nonempty follow-up timed out; those incomplete observations are not used in the comparison.

## Research transport controls

[Cross-origin controls at 08:24 UTC](reachability-control.json) captured identical upstream 503 responses from unrelated library and non-library origins. [Client comparisons at 08:29 UTC](client-comparison.json) then showed partial recovery, with the same results in urllib and curl. Independent country catalog origins subsequently recovered, allowing bounded rechecks. These controls qualify failures as observations from the execution network; they do not establish that a country or its libraries were offline. Normal TLS and inherited network settings were retained.
