# IMLS population fixtures

For `tools/directory/us-population.test.mjs`. Copied on 24 November 2026; no
request was made to make them.

- `pls-fy2024-ae-population.csv`: 16 records of the IMLS Public Libraries Survey
  FY2024 administrative entity file (`PLS_FY24_AE_pud24i.csv`, from
  `pls_fy2024_csv.zip` on imls.gov, downloaded by the USA research on
  23 November 2026), unchanged but for the columns: the ones the population
  tool and the shared IMLS reader use. Los Angeles (the largest offered
  library), Chicago, Rochester (a member of a shared catalog with its own
  record), PAL Public Library Cooperative (whose members Alachua and Putnam
  record outlets of it), Greenville, Illinois (the 500th largest offered
  library on 24 November 2026), Fort Worth (no population: `-3`),
  Mid-Arkansas Regional Library System, and PAC2's nine member libraries.
- `directory-legacy-matches.tsv`: five rows of the USA research's IMLS match of
  the legacy directory entries (`directory-with-pls.tsv`), columns trimmed to
  the ones the tool reads and PAC2's note shortened: a single match, a
  consortium catalog matched to its members, and two entries with no record.
