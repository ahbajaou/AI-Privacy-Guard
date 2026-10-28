import React, { useCallback, useEffect, useState } from 'react';
import '../public/platforms.js';
import './App.css';

const platforms = globalThis.AIPG_PLATFORMS || [];
const hoverStorageKey = globalThis.AIPG_HOVER_STORAGE_KEY || 'hoverRevealEnabled';
const safeModeStorageKey = globalThis.AIPG_SAFE_MODE_STORAGE_KEY || 'presentationSafeModeEnabled';

function chromeCall(invoke) {
  return new Promise((resolve, reject) => {
    try {
      invoke((result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Chrome could not complete the request.'));
        else resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function identifyPlatform(url) {
  if (!url) return null;
  return platforms.find((platform) => platform.urlPrefixes.some((prefix) => url.startsWith(prefix))) || null;
}

function App() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState(null);
  const [tabId, setTabId] = useState(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [hoverReveal, setHoverReveal] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [status, setStatus] = useState({ state: 'loading', message: 'Checking this tab…' });
  /* AIPG_DIAGNOSTICS_ONLY_START */
  const [diagnosticsText, setDiagnosticsText] = useState('');
  const [diagnosticsMessage, setDiagnosticsMessage] = useState('');
  const diagnosticsEnabled = globalThis.AIPG_DIAGNOSTICS_ENABLED === true;
  /* AIPG_DIAGNOSTICS_ONLY_END */

  const checkProtection = useCallback(async (targetTabId = tabId, targetPlatform = platform) => {
    if (!targetPlatform || targetTabId === null) {
      setStatus({ state: 'unsupported', label: 'Unsupported website', message: 'Open ChatGPT, Gemini, or Claude to use privacy protection.' });
      return;
    }
    try {
      let reply;
      let lastCommunicationError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          reply = await chromeCall((callback) => chrome.tabs.sendMessage(
            targetTabId,
            { type: 'AIPG_GET_STATUS' },
            callback,
          ));
          lastCommunicationError = null;
          if (reply?.status !== 'initializing' || attempt === 2) break;
        } catch (error) {
          lastCommunicationError = error;
          if (attempt === 2) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      if (lastCommunicationError) throw lastCommunicationError;
      const labels = {
        protected: 'Protected',
        'safe-protected': 'Presentation Mode active',
        'partially-protected': 'Partially protected',
        disabled: 'Protection disabled',
        empty: 'No sidebar entries found',
        revealed: 'Revealed on hover',
        unverified: 'Unable to verify protection',
        error: 'Protection error',
        initializing: 'Checking protection',
      };
      setStatus({
        state: reply?.status || 'unverified',
        label: labels[reply?.status] || 'Unable to verify protection',
        message: reply?.message || 'The page did not return a protection status.',
      });
    } catch (error) {
      const runtimeMessage = error?.message || '';
      const staleTab = /receiving end does not exist|could not establish connection|no tab with id/i.test(runtimeMessage);
      setStatus({
        state: 'unverified',
        label: 'Unable to verify protection',
        message: staleTab
          ? 'This tab may predate the extension update. Refresh it, then check again.'
          : 'The page could not confirm masking. Refresh the tab and retry.',
      });
    }
  }, [platform, tabId]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus({ state: 'loading', message: 'Checking this tab…' });
    try {
      const [tabs, localValues] = await Promise.all([
        chromeCall((callback) => chrome.tabs.query(
          { active: true, currentWindow: true },
          callback,
        )),
        chromeCall((callback) => chrome.storage.local.get([safeModeStorageKey], callback)),
      ]);
      setSafeMode(Boolean(localValues?.[safeModeStorageKey]));
      const activeTab = tabs?.[0];
      if (!activeTab) throw new Error('Missing active tab');
      const selectedPlatform = identifyPlatform(activeTab.url);
      setTabId(activeTab.id ?? null);
      setPlatform(selectedPlatform);
      if (!selectedPlatform) {
        setIsEnabled(false);
        setHoverReveal(false);
        setStatus({ state: 'unsupported', label: 'Unsupported website', message: 'Open ChatGPT, Gemini, or Claude to use privacy protection.' });
        return;
      }

      const values = await chromeCall((callback) => chrome.storage.sync.get(
        [selectedPlatform.storageKey, hoverStorageKey],
        callback,
      ));
      setIsEnabled(Boolean(values?.[selectedPlatform.storageKey]));
      setHoverReveal(Boolean(values?.[hoverStorageKey]));
      await checkProtection(activeTab.id ?? null, selectedPlatform);
    } catch {
      setStatus({
        state: 'error',
        label: 'Could not load settings',
        message: 'Saved settings could not be loaded. Reopen the popup and try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [checkProtection]);

  useEffect(() => {
    load();
  }, [load]);

  const updateSetting = async (area, key, value, settingType) => {
    setBusy(true);
    let settingSaved = false;
    try {
      await chromeCall((callback) => chrome.storage[area].set({ [key]: value }, callback));
      settingSaved = true;
      if (settingType === 'protection') setIsEnabled(value);
      else if (settingType === 'hover') setHoverReveal(value);
      else setSafeMode(value);
      if (platform && tabId !== null) {
        const nextEnabled = settingType === 'protection' ? value : isEnabled;
        const nextHoverReveal = settingType === 'hover' ? value : hoverReveal;
        const nextSafeMode = settingType === 'safe-mode' ? value : safeMode;
        await chromeCall((callback) => chrome.tabs.sendMessage(tabId, {
          type: 'AIPG_APPLY_SETTINGS',
          isEnabled: nextEnabled,
          hoverReveal: nextHoverReveal,
          safeMode: nextSafeMode,
        }, callback));
      }
      await checkProtection();
    } catch {
      setStatus({
        state: settingSaved ? 'unverified' : 'error',
        label: settingSaved ? 'Refresh to apply setting' : 'Setting not saved',
        message: settingSaved
          ? 'The preference was saved, but this page did not confirm the change. Refresh the tab to apply it.'
          : 'That change could not be saved. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const onProtectionChange = (event) => {
    if (platform) updateSetting('sync', platform.storageKey, event.target.checked, 'protection');
  };

  const onHoverChange = (event) => {
    if (!safeMode) updateSetting('sync', hoverStorageKey, event.target.checked, 'hover');
  };

  const onSafeModeChange = (event) => {
    updateSetting('local', safeModeStorageKey, event.target.checked, 'safe-mode');
  };

  /* AIPG_DIAGNOSTICS_ONLY_START */
  const copyDiagnostics = async () => {
    setDiagnosticsMessage('Collecting sanitized diagnostics…');
    try {
      const result = await chromeCall((callback) => chrome.tabs.sendMessage(tabId, {
        type: 'AIPG_GET_DIAGNOSTICS',
        popupSettings: {
          privacyEnabled: isEnabled,
          presentationModeEnabled: safeMode,
        },
      }, callback));
      const serialized = JSON.stringify(result, null, 2);
      setDiagnosticsText(serialized);
      try {
        await navigator.clipboard.writeText(serialized);
        setDiagnosticsMessage('Sanitized diagnostics copied. They contain no titles or URLs.');
      } catch {
        setDiagnosticsMessage('Diagnostics are shown below. Select and copy the JSON.');
      }
    } catch {
      const fallback = {
        extensionVersion: globalThis.chrome?.runtime?.getManifest?.().version || 'unknown',
        platform: platform?.id || 'unknown',
        contentScriptLoaded: false,
        stylesheetLoaded: false,
        settingsRestored: false,
        privacyEnabled: isEnabled,
        presentationModeEnabled: safeMode,
        sidebarRootMatches: 0,
        conversationTargetMatches: 0,
        conversationTargetsInNavigation: 0,
        conversationTargetsOutsideNavigation: 0,
        projectTargetMatches: 0,
        plausibleNavigationCandidateCount: 0,
        plausibleStructureCandidateCount: 0,
        conversationLikeEntryCount: 0,
        projectLikeEntryCount: 0,
        folderLikeEntryCount: 0,
        nestedProjectConversationCount: 0,
        candidateStructure: [],
        targetStructure: [],
        computedMaskApplied: false,
        protectionStatus: status.state,
        errorCode: 'CONTENT_SCRIPT_UNAVAILABLE',
        popupPageStateMismatch: null,
      };
      const serialized = JSON.stringify(fallback, null, 2);
      setDiagnosticsText(serialized);
      try {
        await navigator.clipboard.writeText(serialized);
        setDiagnosticsMessage('Content script did not respond. Sanitized fallback diagnostics copied.');
      } catch {
        setDiagnosticsMessage('Content script did not respond. Select and copy the sanitized JSON below.');
      }
    }
  };
  /* AIPG_DIAGNOSTICS_ONLY_END */

  const statusLabel = status.label || (status.state === 'loading' ? 'Checking protection' : 'Unable to verify protection');
  const canRetry = ['unverified', 'partially-protected', 'error'].includes(status.state);

  return (
    <main className="app" aria-busy={loading || busy}>
      <header className="header">
        <div className="logo">
          <svg className="shield-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.75 19 5.6v5.5c0 4.42-2.82 8.1-7 10.15-4.18-2.05-7-5.73-7-10.15V5.6l7-2.85Z" />
            <path d="m8.8 12.1 2.1 2.1 4.4-4.55" />
          </svg>
          <h1>AI Privacy Guard</h1>
        </div>
        <span className="version">v{globalThis.chrome?.runtime?.getManifest?.().version || '1.3.0'}</span>
      </header>

      <section className="site-row" aria-label="Current website">
        <span className="site-name">{loading ? 'Checking current tab' : platform?.name || 'Unsupported website'}</span>
        <span className={`site-status ${platform ? 'supported' : 'unsupported'}`}>
          <span className="site-status-dot" aria-hidden="true" />
          {loading ? 'Checking' : platform ? 'Supported' : 'Unsupported'}
        </span>
      </section>

      <section className="control-section" aria-label="Privacy controls">
        <div className="setting-row primary-setting">
          <div className="setting-copy">
            <label className="control-label" htmlFor="protection-toggle">Hide conversation titles</label>
            <p>Blur titles in the chat sidebar.</p>
          </div>
          <input
            id="protection-toggle"
            className="switch"
            type="checkbox"
            checked={isEnabled}
            onChange={onProtectionChange}
            disabled={loading || busy || !platform}
          />
        </div>

        <div className="setting-row presentation-setting">
          <div className="setting-copy">
            <label className="control-label" htmlFor="safe-mode-toggle">Presentation Mode</label>
            <p>Opaque masks. Hover and focus never reveal titles.</p>
          </div>
          <input
            id="safe-mode-toggle"
            className="switch"
            type="checkbox"
            checked={safeMode}
            onChange={onSafeModeChange}
            disabled={loading || busy || !platform}
          />
        </div>

        <fieldset className={`hover-setting ${safeMode ? 'overridden' : ''}`} disabled={loading || busy || safeMode}>
          <legend>Additional setting</legend>
          <label className="hover-row" htmlFor="hover-toggle">
            <span className="hover-copy">
              <span className="hover-title">Reveal on hover</span>
              <span className="hover-description">
                {safeMode ? 'Saved preference paused during Presentation Mode.' : 'Optional in regular blur mode.'}
              </span>
            </span>
            <input
              id="hover-toggle"
              className="switch small-switch"
              type="checkbox"
              checked={hoverReveal}
              onChange={onHoverChange}
              aria-describedby="hover-description"
            />
          </label>
          <span id="hover-description" className="sr-only">
            {safeMode ? 'Hover reveal is temporarily overridden. The saved preference is unchanged.' : 'Hover reveal does not apply while Presentation Mode is on.'}
          </span>
        </fieldset>

        <div className={`protection-status ${status.state}`} role="status" aria-live="polite">
          <span className="status-indicator" aria-hidden="true" />
          <div className="status-copy">
            <strong>{loading ? 'Checking protection' : statusLabel}</strong>
            <p>{status.message}</p>
          </div>
          {canRetry && !loading && (
            <button className="retry-button" type="button" onClick={load} disabled={busy}>Retry</button>
          )}
        </div>

        <p className="privacy-note">Visual masking only. Your AI service still receives its page content.</p>

        {/* AIPG_DIAGNOSTICS_ONLY_START */}
        {diagnosticsEnabled && (
          <section className="diagnostics-panel" aria-label="Development diagnostics">
            <button
              className="retry-button diagnostics-button"
              type="button"
              onClick={copyDiagnostics}
              disabled={loading || tabId === null || !platform}
            >
              Copy diagnostics
            </button>
            {diagnosticsMessage && <p className="diagnostics-message" role="status">{diagnosticsMessage}</p>}
            {diagnosticsText && (
              <textarea
                className="diagnostics-output"
                aria-label="Sanitized diagnostic JSON"
                readOnly
                value={diagnosticsText}
                onFocus={(event) => event.target.select()}
              />
            )}
          </section>
        )}
        {/* AIPG_DIAGNOSTICS_ONLY_END */}
      </section>
    </main>
  );
}

export default App;
