# e-Granthalaya public fixture provenance

Captured 2026-10-03 from `https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=PUBLICLIBRARIES`
and the public holdings popup. Requests identified as MyBookshelf. No patron login,
CAPTCHA completion, private account data, or authenticated browser state was used.

- `form.html`: the actual anonymous form controls, with every nonempty opaque hidden
  value replaced by `fixture-state` and library options reduced to the pilot names.
  The runtime must obtain its own fresh form and anonymous ASP.NET session.
- `search-hit.html`: exact ISBN **978-81-313-1345-9**, scoped to **HKMSLIB**;
  record **519750**, title *101 great lives who shaped the world*, format Print.
  The search took **22.29 seconds**, after a **4.02-second** form request.
- `holdings-available.html`: record 519750, the actual public `GridView1` structure,
  including its nested tooltip table. **One** copy at **HKMSLIB**, status **Available**,
  class/book number **BC SRI-K**, shelf **SLIC**, collection **R**. The public detail
  request took **3.08 seconds**. No cookies, viewstate, contact information, or patron
  data are retained. Accession IC2340 identifies a public library copy.
- `search-empty.html`: a second, scoped **CCLSZJYNGR** (Bengaluru Jayanagar) lookup
  for **978-81-7371-146-6** returned zero in **11.16 seconds**. This is deliberately
  treated as unconfirmed, not proof that a library lacks the book.

The unavailable, wrong-ISBN, incomplete-table and unfamiliar-status cases in tests
are explicit mutations of these fixtures. They are not claimed as additional live
observations. The first record was located by one bounded cluster-wide lookup
(61.78 seconds); the shipped provider always selects one library and never repeats
that discovery operation.

Harekrushna Mahtab State Library is a reference/research library, and its official
Odisha government description says lending is not permitted:
https://rtiodisha.gov.in/Pages/printManual/section_id%3A2/office_id%3A301/lang
The seed and returned format preserve that restriction.
