import net from 'node:net';

// Node 20+ races IPv6 and IPv4 ("happy eyeballs") and abandons each address
// after 250 ms by default. Many Indian catalogs publish an AAAA record that is
// unreachable from US hosting and answer IPv4 only after a ~270 ms round trip,
// so every connection failed with ETIMEDOUT in under 300 ms although curl
// connected in under a second (amguricollege.webopac.online and 11 other
// webopac hosts, 15 Nov 2026). Give each address attempt 2.5 s instead; the
// request deadlines in http.js still bound the whole operation.
export const AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 2_500;
net.setDefaultAutoSelectFamilyAttemptTimeout(AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS);
