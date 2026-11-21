# States for Indian libraries without one

Readers pick a state before a library, so a library with no state is hard to
find. On 15 November 2026, 1,555 of the 4,139 Indian libraries offered in the
finder had no state in the source directory. Now 159 do not.

`server/data/india-library-regions.json` fills the state, and the district when
it is unambiguous, for Indian entries with no source region.
`server/services/directory.js` applies it only where the source has no region.
Existing regions are never changed. Regenerate it with:

```sh
node tools/directory/india-regions.mjs
```

## Evidence, strongest first

1. **Published state** (1,041 listed libraries). The state field each
   e-Granthalaya library publishes on its own OPAC home page, captured in
   [`egranthalaya-contacts.json`](egranthalaya-contacts.json). A PIN in the
   same address must not point to another state. Two exceptions come from
   splits the GeoNames postcodes predate: Telangana (2014) and Ladakh (2019).
   In those, the current state wins.
2. **A PIN code** in the published address (151), or in an IndCat institution
   code such as `AGRA_282004` (57). It counts only if GeoNames places that PIN
   in exactly one state.
3. **Exactly one state named** in the published address (6).
4. **District or place names** in the address that all share exactly one state
   (141), when two distinct parts agree on it or one part names a district of
   it. For example, "Sakri, Dhule" resolves because Dhule lies only in
   Maharashtra, and "Dist. Kolhapur" because Kolhapur is a Maharashtra
   district. "Aurangabad" alone stays unresolved (two states). A single town
   name is never enough, even one the place index puts in one state: the index
   holds about 7,700 places, so "Seawoods, Nerul, Navi-Mumbai" matched only
   Goa's Nerul, and "Ghogaon" only the Madhya Pradesh one, though both
   institutions are in Maharashtra. On 16 November 2026 this removed 64 such
   fills (46 of them listed libraries); they are unresolved until stronger
   evidence appears.

A library's name is never evidence: "Air Force School Jaisalmer" says nothing
about where its library is.

## Towns and addresses (`places`)

Approved by the owner on 21 November 2026: published cities from the
libraries' own catalog pages go into the directory, with the source recorded.
The same generator writes `places` into `server/data/india-library-regions.json`:
the labelled City and Address fields (and the address's PIN, when it has one
that GeoNames places in a state) that a library publishes on its own
e-Granthalaya page, for Indian libraries whose source entry has no city or no
address. `server/services/directory.js` applies them only where the source has
none, with the page as `addressSourceUrl`; the public place rule
(`tools/seo/public-place.mjs`) then shows the town, and the app's library
picker, side panel and book card show it as the library's city.

Evidence: the contact capture below (1,108 pages) and saved copies of a
library's own page (`SAVED_PAGES` in the generator, provenance in
`server/test/fixtures/egranthalaya/README.md`; SRS Central Library, Jammu).
Each entry records the page URL, the date and the file it came from.

A city is used only when it is one place name: not several parts ("Srinagar/
Jammu", "Kalyani, Nadia, W.B."), a street, a number, an abbreviation ("JNU",
"BBSR"), a state, a region or a cut-off value. A PIN typed after the town is
dropped. When the place index puts the name only in another state, the
published address must name it too (Dwarka, Delhi counts; "NOIDA" for a
Karauli school does not). Nothing is used when the page's PIN or state name
points to another state, when its place names all lie in other states with no
PIN or state to support it, or when the library has no state. On 21 November
2026 this added 1,052 towns and 1,098 addresses; 10 pages gave nothing
(`placesUnresolved`) and 49 published city fields were not used as a town (`cityRejected`; their addresses still were).

## Address capture

`node tools/directory/egranthalaya-contacts.mjs docs/research/india-library-regions/egranthalaya-contacts.json --resume`

The capture fetched one public OPAC page per listed e-Granthalaya library with
no state: 1,108 pages, all answered, between 22:09 and 00:14 UTC on 15–16
November 2026. It ran on one host at a time, checked robots.txt once per host,
spaced requests 2.5 s apart, and was set to stop on any 401, 403 or 429.

Only the labelled address, city and state fields are kept, never names, e-mail
addresses or phone numbers. One library had typed an office phone number into
its address field. It was removed after capture and is listed under `sanitized`.

## Still without a state (159 listed)

- 151 LIBMAN tenants: the address has no PIN or state, no address at all, a
  single town name (46), or places found in several states.
- 5 e-Granthalaya libraries:
  - The Punjab and Haryana assembly libraries publish their state but sit in
    Chandigarh (PIN 160001), so they are left for a person to decide.
  - KV Raipur and KV Chhatarpur name towns found in several states.
  - One SSB training centre publishes neither a state nor a PIN.
- 2 IndCat records and 1 academic discovery record.

To fix one by hand, add its region to `data/library-directory.json`. A source
region always wins over this file.
