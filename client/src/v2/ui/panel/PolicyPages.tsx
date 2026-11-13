import privacyText from '../../../../../docs/policy/privacy.md?raw';
import termsText from '../../../../../docs/policy/terms.md?raw';
import aboutText from '../../../../../docs/policy/about.md?raw';
import { PanelPage } from './PanelPage';
import { PolicyBlocks, inline, parsePolicy, policySections } from './policyText';
import { appVersion, policyEffectiveDate } from './buildInfo';

// Privacy, Terms and About (plan section 10.1), from the approved drafts in
// docs/policy. The texts are rendered as written; only the effective date and
// version placeholders are filled, and only when the build supplies them.

function PolicyDocument({ text, name }: { text: string; name: string }) {
  const { title, intro, sections } = policySections(parsePolicy(text, { '[EFFECTIVE DATE]': policyEffectiveDate() }));
  return <PanelPage title={title || name} documentTitle={name} className="policy-page">
    {intro.length > 0 && <div className="policy-intro"><PolicyBlocks blocks={intro} idPrefix={name + '-intro'} /></div>}
    <div className="policy-sections">
      {sections.map((section, index) => <section key={index} className="policy-section" aria-labelledby={`${name}-section-${index}`}>
        <h2 id={`${name}-section-${index}`}>{inline(section.heading)}</h2>
        <PolicyBlocks blocks={section.blocks} idPrefix={`${name}-${index}`} />
      </section>)}
    </div>
  </PanelPage>;
}

export function PrivacyPage() {
  return <PolicyDocument text={privacyText} name="Privacy" />;
}

/** Terms use the Privacy board's layout (plan section 9, row 29). */
export function TermsPage() {
  return <PolicyDocument text={termsText} name="Terms" />;
}

/** About board: the name, the About text, then Version and Contact rows. */
export function AboutPage() {
  const blocks = parsePolicy(aboutText, { '[VERSION]': appVersion() });
  const facts: Array<[string, string]> = [];
  const body = blocks.filter(block => {
    if (block.type !== 'p') return block.type !== 'h1';
    const fact = /^(Version|Contact):\s*(.+)$/.exec(block.text);
    if (fact) facts.push([fact[1], fact[2]]);
    return !fact;
  });
  return <PanelPage title="MyBookshelf" documentTitle="About" className="about-page">
    <div className="policy-intro"><PolicyBlocks blocks={body} idPrefix="about" /></div>
    <dl className="about-facts">
      {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{inline(value)}</dd></div>)}
    </dl>
  </PanelPage>;
}
