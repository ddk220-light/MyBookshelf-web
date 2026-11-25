// The Google tag for mybookshelf.cloud, exactly as Google gave it to the owner
// (24 November 2026). Do not edit it: what it measures is set in Google
// Analytics, and the security policy allows its inline script by its hash
// (shared/security-policy.mjs). It is in client/index.html and on every public
// page (tools/seo/build-pages.mjs). See docs/GOOGLE_TAG.md.
export const GOOGLE_TAG_SNIPPET = `<script async src="https://www.googletagmanager.com/gtm.js?id=G-G2QJ7MKTQ9"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
</script>`;
