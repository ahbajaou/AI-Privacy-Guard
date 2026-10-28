# AI Privacy Guard

Free Chrome Manifest V3 extension that visually masks selected navigation entries in supported AI chat sidebars. It does not read or redact conversation messages, and visual masking is not data security. It does not detect whether screen sharing is active.

## Development and release

Requirements: Node.js and npm.

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

The release version is `1.3.0`, maintained in `package.json` and copied into the generated manifest. Vite clears and regenerates `build/`, including the extension manifest, icons, shared platform configuration, and early privacy stylesheet.

Production `npm run build` strips the diagnostics endpoint and diagnostic-only popup styles from `build/`. The separate `npm run build:diagnostics` package retains the local diagnostics action for development investigation; load it only in a separate test profile. Diagnostic data is not transmitted.

To prepare the v1.3.0 production archive, build first and zip the contents of `build/`:

```sh
npm run build
cd build && zip -r ../ai-privacy-guard-v1.3.0.zip .
```

Inspect `build/manifest.json` and the archive before any release action. Do not package the source tree or diagnostics build. This project has not been submitted or published.

## Privacy behavior and settings

- Existing ChatGPT and Gemini preferences remain in `chrome.storage.sync` with the keys `blurEnabled_ChatGPT` and `blurEnabled_Gemini`.
- ChatGPT, Gemini, and Claude protection status is computed from matching eligible entries and their current computed masking styles. Protected means those matched entries are masked; it is not a guarantee of complete site-wide privacy. A missing content-script response is reported as unverifiable, not as evidence that the page is unmasked.
- Claude uses `blurEnabled_Claude` in `chrome.storage.sync`. The popup no longer overrides runtime evidence with a hardcoded “not live-tested” warning.
- `hoverRevealEnabled` remains in `chrome.storage.sync` and defaults to off. When enabled, only mouse hover reveals a regular blurred title; keyboard focus does not.
- `presentationSafeModeEnabled` is stored in `chrome.storage.local`, is off by default, and is profile-local. It adds an opaque mask to identified sidebar entries and overrides hover/focus reveal. Turning it off restores the user's independent regular blur/hover preferences.
- Account identity masking is currently unsupported on all configured platforms because no selectors have been positively verified. The popup leaves that control unavailable rather than guessing.
- The active Gemini notebook heading in the main workspace is not supported; only positively identified sidebar navigation entries are covered.
- A manifest stylesheet masks titles from the beginning of document loading until saved settings are read. Chrome cannot apply extension code before navigation rendering begins, so a brief exposure may still occur before the extension's document-start CSS applies.
- If saved settings cannot be read, the page remains visually masked and the popup reports an error. If the content script cannot be reached, protection is reported as unverifiable rather than successful.
- The extension does not collect or transmit conversation text or account identity. Its only host access is to the configured ChatGPT, Gemini, and Claude origins; it requests only the `storage` permission.

The shared settings constants and per-site selectors are in `public/platforms.js`; early CSS is in `public/privacy.css`. The keyboard shortcut toggles the same local Safe Mode value and is suggested as `Alt+Shift+P`; Chrome may resolve shortcut conflicts differently. Customize it at `chrome://extensions/shortcuts`.

## Manual browser QA

Automated tests use a mocked DOM and mocked Chrome APIs; they do not verify live service behavior. Authenticated ChatGPT, Gemini, and Claude protection is **NOT TESTED** for this release candidate. Use a separate browser profile and a non-sensitive test account, then load production `build/`. If investigation is needed, use `build-diagnostics/` separately and do not share screenshots, full DOM, or copied page markup:

```sh
npm run build:diagnostics
```

Do not share screenshots, full DOM, or copied page markup.

| Test | ChatGPT | Gemini | Claude |
| --- | --- | --- | --- |
| Fresh install and existing-user upgrade | NOT TESTED | NOT TESTED | NOT TESTED |
| Refresh, open/switch chats, SPA navigation | NOT TESTED | NOT TESTED | NOT TESTED |
| Sidebar collapsed/expanded and dynamically added titles | NOT TESTED | NOT TESTED | NOT TESTED |
| Regular protection on/off and hover/focus behavior | NOT TESTED | NOT TESTED | NOT TESTED |
| Safe Mode on/off, opaque mask, hover override | NOT TESTED | NOT TESTED | NOT TESTED |
| Multiple tabs, browser restart, extension reload/update | NOT TESTED | NOT TESTED | NOT TESTED |
| Empty sidebar, unsupported pages, storage/messaging failures | NOT TESTED | NOT TESTED | NOT TESTED |
| Account identity masking | NOT SUPPORTED | NOT SUPPORTED | NOT SUPPORTED |

Automated tests cover representative Chrome API failures, settings persistence, startup masking, current ChatGPT sidebar/link structure, project/folder test-ID links, selector failures, SPA navigation, dynamically inserted and empty sidebars, Safe Mode opacity, hover/focus override, runtime status reporting, and keyboard command toggling. They do not establish signed-in live-site compatibility.
