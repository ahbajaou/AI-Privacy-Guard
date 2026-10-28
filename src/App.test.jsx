// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import App from './App.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const popupCss = readFileSync('src/App.css', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

function installChrome({ url = 'https://chatgpt.com/', values = {}, localValues = {}, status = { status: 'unverified', message: 'No titles found.' }, failStorage = false, failSet = false, failMessage = false, messageFailures = 0 } = {}) {
  const state = { ...values };
  const localState = { ...localValues };
  let remainingMessageFailures = messageFailures;
  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: '1.3.0' }),
    },
    tabs: {
      query: vi.fn((query, callback) => callback([{ id: 7, url }])),
      sendMessage: vi.fn((id, message, callback) => {
        const messageFailed = failMessage || remainingMessageFailures > 0;
        if (remainingMessageFailures > 0) remainingMessageFailures -= 1;
        if (messageFailed) chrome.runtime.lastError = { message: 'Receiving end does not exist' };
        callback(messageFailed ? undefined : message.type === 'AIPG_GET_STATUS' ? status : { ok: true });
        chrome.runtime.lastError = null;
      }),
    },
    storage: {
      sync: {
        get: vi.fn((keys, callback) => {
          if (failStorage) chrome.runtime.lastError = { message: 'storage unavailable' };
          callback(Object.fromEntries(keys.map((key) => [key, state[key]])));
          chrome.runtime.lastError = null;
        }),
        set: vi.fn((update, callback) => {
          if (failSet) chrome.runtime.lastError = { message: 'settings are read-only' };
          else Object.assign(state, update);
          callback();
          chrome.runtime.lastError = null;
        }),
      },
      local: {
        get: vi.fn((keys, callback) => callback(Object.fromEntries(keys.map((key) => [key, localState[key]])))),
        set: vi.fn((update, callback) => {
          if (!failSet) Object.assign(localState, update);
          callback();
          chrome.runtime.lastError = null;
        }),
      },
    },
  };
  globalThis.chrome = chrome;
  return chrome;
}

async function mountApp() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { container, root };
}

describe('popup controls and verified status', () => {
  let mounted;
  afterEach(async () => {
    if (mounted) {
      await act(async () => mounted.root.unmount());
      mounted.container.remove();
      mounted = null;
    }
    delete globalThis.chrome;
  });

  it('does not show success just because the saved preference is enabled', async () => {
    installChrome({ values: { blurEnabled_ChatGPT: true } });
    mounted = await mountApp();
    expect(mounted.container.textContent).toContain('Unable to verify protection');
    expect(mounted.container.textContent).not.toContain('Protected');
  });

  it('loads and displays a verified protected state', async () => {
    installChrome({
      values: { blurEnabled_ChatGPT: true },
      status: { status: 'protected', count: 2, message: '2 conversation titles blurred.' },
    });
    mounted = await mountApp();
    expect(mounted.container.textContent).toContain('Protected');
    expect(mounted.container.textContent).toContain('2 conversation titles blurred.');
  });

  it('identifies unsupported sites and disables protection toggle', async () => {
    installChrome({ url: 'https://example.org/' });
    mounted = await mountApp();
    expect(mounted.container.textContent).toContain('Unsupported website');
    expect(mounted.container.querySelector('#protection-toggle').disabled).toBe(true);
  });

  it('reports a readable storage error without showing a successful status', async () => {
    installChrome({ failStorage: true });
    mounted = await mountApp();
    expect(mounted.container.textContent).toContain('Could not load settings');
    expect(mounted.container.textContent).toContain('Saved settings could not be loaded');
    expect(mounted.container.textContent).not.toContain('storage unavailable');
  });

  it('reports a missing content script as unverifiable', async () => {
    installChrome({ values: { blurEnabled_ChatGPT: true }, failMessage: true });
    mounted = await mountApp();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 260)));
    expect(mounted.container.textContent).toContain('Unable to verify protection');
    expect(mounted.container.textContent).toContain('Refresh it, then check again');
  });

  it('retries a transient content-script startup race before reporting status', async () => {
    const chrome = installChrome({
      values: { blurEnabled_ChatGPT: true },
      messageFailures: 1,
      status: { status: 'protected', count: 1, message: '1 title is masked.' },
    });
    mounted = await mountApp();
    expect(chrome.tabs.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mounted.container.textContent).toContain('1 title is masked.');
  });

  it('persists the explicit hover reveal preference and updates the content script', async () => {
    const chrome = installChrome({
      values: { blurEnabled_ChatGPT: true },
      status: { status: 'protected', count: 1, message: '1 conversation title blurred.' },
    });
    mounted = await mountApp();
    const checkbox = mounted.container.querySelector('#hover-toggle');
    await act(async () => {
      checkbox.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ hoverRevealEnabled: true }, expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({
      type: 'AIPG_APPLY_SETTINGS',
      hoverReveal: true,
    }), expect.any(Function));
  });

  it('does not claim a setting succeeded when storage writes fail', async () => {
    installChrome({ failSet: true });
    mounted = await mountApp();
    await act(async () => {
      mounted.container.querySelector('#hover-toggle').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mounted.container.textContent).toContain('Setting not saved');
    expect(mounted.container.textContent).toContain('That change could not be saved');
  });

  it('trusts Claude runtime coverage instead of a hardcoded live-test warning', async () => {
    installChrome({
      url: 'https://claude.ai/new',
      values: { blurEnabled_Claude: true },
      status: { status: 'protected', count: 2, message: '2 sensitive sidebar entries blurred.' },
    });
    mounted = await mountApp();
    expect(mounted.container.textContent).toContain('Claude');
    expect(mounted.container.textContent).toContain('2 sensitive sidebar entries blurred.');
    expect(mounted.container.textContent).toContain('Protected');
  });

  it('persists Safe Mode locally without overwriting the normal protection preference', async () => {
    const chrome = installChrome({
      values: { blurEnabled_ChatGPT: false, hoverRevealEnabled: true },
      status: { status: 'safe-protected', message: 'Titles opaquely masked.' },
    });
    mounted = await mountApp();
    await act(async () => {
      mounted.container.querySelector('#safe-mode-toggle').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ presentationSafeModeEnabled: true }, expect.any(Function));
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({
      type: 'AIPG_APPLY_SETTINGS',
      isEnabled: false,
      hoverReveal: true,
      safeMode: true,
    }), expect.any(Function));
  });

  it('shows hover as saved but disabled while Safe Mode overrides it', async () => {
    const chrome = installChrome({
      values: { hoverRevealEnabled: true },
      localValues: { presentationSafeModeEnabled: true },
      status: { status: 'safe-protected', message: 'Identified entries are masked.' },
    });
    mounted = await mountApp();
    const hover = mounted.container.querySelector('#hover-toggle');
    expect(hover.checked).toBe(true);
    expect(hover.matches(':disabled')).toBe(true);
    expect(mounted.container.textContent).toContain('Saved preference paused during Presentation Mode.');
    expect(mounted.container.textContent).toContain('Presentation Mode active');
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('keeps the popup minimal and removes GitHub and unsupported controls', async () => {
    installChrome();
    mounted = await mountApp();
    expect(mounted.container.textContent).not.toContain('GitHub');
    expect(mounted.container.textContent).not.toContain('Account identity masking');
    expect(mounted.container.querySelector('svg')).not.toBeNull();
    expect(mounted.container.textContent).not.toContain('Copy diagnostics');
    expect(mounted.container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(popupCss).toContain('width: min(350px, 100vw)');
    expect(popupCss).toContain('max-height: 560px');
    expect(popupCss).not.toContain('100vh');
    expect(popupCss).not.toContain('linear-gradient');
    expect(popupCss).not.toContain('.github-button');
    expect(packageJson.dependencies).not.toHaveProperty('react-icons');
  });
});
