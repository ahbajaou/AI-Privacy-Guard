import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/background.js', 'utf8');

function loadServiceWorker(initial = false) {
  const commandHandlers = [];
  const state = { presentationSafeModeEnabled: initial };
  const chrome = {
    runtime: { lastError: null },
    commands: { onCommand: { addListener: vi.fn((handler) => commandHandlers.push(handler)) } },
    action: { setBadgeText: vi.fn((details, callback) => callback()) },
    storage: {
      local: {
        get: vi.fn((keys, callback) => callback({ presentationSafeModeEnabled: state.presentationSafeModeEnabled })),
        set: vi.fn((values, callback) => {
          Object.assign(state, values);
          callback();
        }),
      },
    },
  };
  new Function('chrome', source)(chrome);
  return { chrome, commandHandlers, state };
}

describe('Presentation Safe Mode keyboard command', () => {
  it('toggles persistent local state and updates its optional badge', () => {
    const { chrome, commandHandlers, state } = loadServiceWorker(false);
    commandHandlers[0]('toggle-presentation-safe-mode');
    expect(state.presentationSafeModeEnabled).toBe(true);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'SAFE' }, expect.any(Function));

    commandHandlers[0]('toggle-presentation-safe-mode');
    expect(state.presentationSafeModeEnabled).toBe(false);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' }, expect.any(Function));
  });

  it('ignores other registered Chrome commands', () => {
    const { chrome, commandHandlers, state } = loadServiceWorker(false);
    commandHandlers[0]('some-other-command');
    expect(state.presentationSafeModeEnabled).toBe(false);
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });
});
