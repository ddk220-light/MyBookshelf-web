// client/src/v2/ui/settings/SettingsPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../../context';
import { getAppStoreLinks } from '../../storeLinks';
import { useReadingLight } from '../AppFrame';
import { ConfirmDialog } from '../ConfirmDialog';
import { LibraryCard } from '../library/LibraryCard';
import { useDogAnimation } from '../DogAnimation';
import { uiMessages as m } from '../../uiMessages';
import { CopyLibraryLink } from '../library/CopyLibraryLink';
import {AccountSummary} from '../account/AccountSummary';
import {useAccountSession} from '../../auth/AccountSessionProvider';

export function SettingsPage() {
  const { library, loadingLibrary, libraryError, retryLibrary, clearSavedBooks, recoveryMode,pending,mutationError,retryMutation } = useLibrary();
  const {session}=useAccountSession();
  const { light, preference, setLight } = useReadingLight();
  const { enabled, setEnabled } = useDogAnimation();
  const links = getAppStoreLinks();
  const [confirming, setConfirming] = useState(false);

  return <section className="page-section settings-page">
    <header className="page-heading"><h1>{m.settings}</h1></header>
    <AccountSummary/>

    <section aria-labelledby="settings-library">
      <h2 id="settings-library" className="settings-label">Your library</h2>
      {loadingLibrary ? <p role="status">{m.loadingLibrary}</p> : libraryError ? <><p role="alert">{m.libraryLoadError}</p><button onClick={retryLibrary}>Retry</button></> : library ? <LibraryCard library={library} compact selected /> : <p>{m.chooseLibraryHint}</p>}
      <Link className="text-link" to="/app/libraries" state={{ after: '/app/settings' }}>{library ? m.changeLibrary : m.chooseLibrary}</Link>
      {library && <CopyLibraryLink key={library.id} library={library} />}
    </section>

    <section className="theme-settings" aria-labelledby="settings-light">
      <h2 id="settings-light" className="settings-label">{m.readingLight}</h2>
      <div className="theme-options" role="group" aria-labelledby="settings-light">{(['daylight', 'lamplight', 'ink'] as const).map(value => <button key={value} aria-pressed={light === value} onClick={() => setLight(value)}><span className={'theme-preview preview-' + value} aria-hidden="true"><i /><b /><b /><em /></span><span>{value === 'daylight' ? 'Daylight' : value === 'lamplight' ? 'Lamplight' : 'Ink'}</span></button>)}</div>
      <button type="button" role="switch" aria-label="Match device" aria-checked={preference === 'system'} className="companion-switch" onClick={() => setLight(preference === 'system' ? light : 'system')}>Match device<span className="switch-track" aria-hidden="true"><span /></span></button>
    </section>

    <section aria-labelledby="settings-companion">
      <h2 id="settings-companion" className="settings-label">Companion</h2>
      <button type="button" role="switch" aria-label="Show companion" aria-checked={enabled}
        className="companion-switch" onClick={() => setEnabled(!enabled)}>
        Show Bucky <span className="switch-track" aria-hidden="true"><span /></span>
      </button>
    </section>

    <section className="prose" id="privacy" aria-labelledby="settings-privacy">
      <h2 id="settings-privacy" className="settings-label">Privacy</h2>
      <p>{session.status==='authenticated'?'Your account library and saved books are private and sync after confirmation. You control whether recently viewed books are recorded.':'Your guest books are saved in this browser. They don’t sync across devices, and clearing browser data removes them.'}</p>
      <a className="text-link" href="/privacy#website">Privacy policy</a>
    </section>

    <section aria-labelledby="settings-about"><h2 id="settings-about" className="settings-label">About MyBookshelf</h2>
      <p>Created by Deepak Ravikumar. Free software under AGPL-3.0.</p>
      <a className="text-link" href="/about">About this project</a>{' · '}
      <a className="text-link" href={import.meta.env.VITE_SOURCE_URL || 'https://github.com/ddk220-light/MyBookshelf-web'}>Source code</a>
    </section>
    <section aria-labelledby="settings-help">
      <h2 id="settings-help" className="settings-label">Help</h2>
      <a className="text-link" href="/support">Help &amp; support</a>
    </section>
    {(links.ios || links.android) && <section id="apps" aria-labelledby="settings-apps">
      <h2 id="settings-apps" className="settings-label">Get the app</h2>
      <div className="download-links">
        {links.ios && <a className="button-link" href={links.ios} target="_blank" rel="noopener noreferrer">Download for iPhone</a>}
        {links.android && <a className="button-link" href={links.android} target="_blank" rel="noopener noreferrer">Download for Android</a>}
      </div>
    </section>}

    <section className="danger-card" aria-labelledby="settings-danger">
      <h2 id="settings-danger" className="settings-label danger-label">Saved data</h2>
      <button className="button-destructive" disabled={recoveryMode} onClick={() => setConfirming(true)}>Clear saved books</button>
    </section>

    <ConfirmDialog
      open={confirming}
      title="Clear saved books?"
      body={<p>Your saved shelf will be emptied. This cannot be undone.</p>}
      confirmLabel="Clear saved books"
      pending={pending}
      error={mutationError}
      onConfirm={async() => { if(await (retryMutation??clearSavedBooks)())setConfirming(false); }}
      onCancel={() => setConfirming(false)}
    />
  </section>;
}
