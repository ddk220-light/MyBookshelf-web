import '@testing-library/jest-dom/vitest';

// jsdom does not implement the native dialog top layer. Browser journeys verify
// focus trapping and Escape; unit tests still need the dialog's open lifecycle.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

// Answers the app remembers for a visit (module memory) start fresh in each test.
import { afterEach } from 'vitest';
import { forgetAccountCapabilities } from '../v2/ui/shelf/capabilitiesMemo';
afterEach(() => { forgetAccountCapabilities(); });
