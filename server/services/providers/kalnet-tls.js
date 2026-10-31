import fs from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { checkServerIdentity, rootCertificates } from 'node:tls';
import { Agent } from 'undici';

const ORIGIN = 'https://kalnet.kshec.kerala.gov.in';
const FINGERPRINT = '8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0';
let dispatcher;

export function validatedKalnetIntermediate() {
  const pem = fs.readFileSync(new URL('./certs/sectigo-public-server-authentication-dv-r36.pem', import.meta.url), 'utf8');
  const certificate = new X509Certificate(pem);
  if (!certificate.ca || certificate.fingerprint256 !== FINGERPRINT
    || Date.now() < Date.parse(certificate.validFrom) || Date.now() > Date.parse(certificate.validTo)) throw new Error('KALNET intermediate certificate is invalid');
  const hasPublicRoot = rootCertificates.some(value => {
    const root = new X509Certificate(value);
    return certificate.checkIssued(root) && certificate.verify(root.publicKey);
  });
  if (!hasPublicRoot) throw new Error('KALNET intermediate has no trusted public root');
  return pem;
}

// The upstream currently omits an intermediate. Add its independently validated
// public chain certificate only here; retain Node's standard hostname verifier.
export function kalnetTransportOptions(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || !url.pathname.startsWith('/vufind/') || url.username || url.password) return {};
  dispatcher ||= new Agent({
    connections: 2,
    pipelining: 1,
    connect: { ca: [...rootCertificates, validatedKalnetIntermediate()], rejectUnauthorized: true, allowPartialTrustChain: false, checkServerIdentity },
  });
  return { dispatcher };
}
