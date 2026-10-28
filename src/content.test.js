// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync('public/content.js', 'utf8');
const css = readFileSync('public/privacy.css', 'utf8');
const platform = {
  id: 'ChatGPT',
  hostnames: ['chatgpt.com', 'chat.openai.com'],
  storageKey: 'blurEnabled_ChatGPT',
  sidebarSelector: 'nav[role="navigation"]',
  conversationSelector: 'nav[role="navigation"] a[href^="/c/"], nav[role="navigation"] a[href^="/g/"][href*="/c/"]',
  projectSelector: 'nav[role="navigation"] [data-aipg-chatgpt-project-row], nav[role="navigation"] a[href^="/g/"]:not([href*="/c/"]), nav[role="navigation"] a[href^="/projects/"], nav[role="navigation"] a[href^="/project/"]',
  titleSelector: 'nav[role="navigation"] a[href^="/c/"], nav[role="navigation"] a[href^="/g/"][href*="/c/"]',
  sensitiveSelector: 'nav[role="navigation"] a[href^="/c/"], nav[role="navigation"] a[href^="/g/"][href*="/c/"], nav[role="navigation"] [data-aipg-chatgpt-project-row], nav[role="navigation"] a[href^="/g/"]:not([href*="/c/"]), nav[role="navigation"] a[href^="/projects/"], nav[role="navigation"] a[href^="/project/"]',
  liveVerified: true,
};

const claudePlatform = {
  id: 'Claude',
  hostnames: ['claude.ai'],
  storageKey: 'blurEnabled_Claude',
  titleSelector: 'a[href^="/chat/"]',
  liveVerified: false,
};

const geminiPlatform = {
  id: 'Gemini',
  hostnames: ['gemini.google.com'],
  storageKey: 'blurEnabled_Gemini',
  sidebarSelector: 'bard-sidenav[role="navigation"]',
  titleSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-conversation-title], bard-sidenav[role="navigation"] [data-aipg-gemini-project-title]',
  conversationSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-conversation-title]',
  projectSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-project-title]',
  sensitiveSelector: 'bard-sidenav[role="navigation"] [data-aipg-gemini-conversation-title], bard-sidenav[role="navigation"] [data-aipg-gemini-project-title]',
  liveVerified: false,
};

function createChromeApi(settings = {}, failRead = false) {
  const api = {
    runtime: {
      lastError: null,
      getManifest: vi.fn(() => ({ version: '1.3.0' })),
      onMessage: { addListener: vi.fn((listener) => { api.messageListener = listener; }) },
    },
    storage: {
      sync: {
        get: vi.fn((keys, callback) => {
          setTimeout(() => {
            if (failRead) api.runtime.lastError = { message: 'storage unavailable' };
            callback(failRead ? undefined : Object.fromEntries(keys.map((key) => [key, settings[key]])));
            api.runtime.lastError = null;
          }, 5);
        }),
      },
      local: {
        get: vi.fn((keys, callback) => {
          setTimeout(() => {
            if (failRead) api.runtime.lastError = { message: 'storage unavailable' };
            callback(failRead ? undefined : Object.fromEntries(keys.map((key) => [key, settings[key]])));
            api.runtime.lastError = null;
          }, 5);
        }),
      },
      onChanged: { addListener: vi.fn((listener) => { api.storageListener = listener; }) },
    },
  };
  return api;
}

function runContentScript(settings, failRead = false, selectedPlatform = platform) {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = selectedPlatform.id === 'Gemini'
    ? '<bard-sidenav role="navigation"><mat-nav-list></mat-nav-list></bard-sidenav>'
    : '<nav role="navigation" aria-label="Chat history"></nav>';
  const chrome = createChromeApi(settings, failRead);
  const pageWindow = {
    location: {
      hostname: selectedPlatform.hostnames[0],
      pathname: '/',
      origin: `https://${selectedPlatform.hostnames[0]}`,
    },
    getComputedStyle: window.getComputedStyle.bind(window),
  };
  new Function('window', 'document', 'chrome', 'globalThis', 'MutationObserver', 'NodeFilter', source)(
    pageWindow,
    document,
    chrome,
    { AIPG_PLATFORMS: [selectedPlatform], AIPG_HOVER_STORAGE_KEY: 'hoverRevealEnabled', AIPG_SAFE_MODE_STORAGE_KEY: 'presentationSafeModeEnabled' },
    window.MutationObserver,
    window.NodeFilter,
  );
  return chrome;
}

function addTitle(title = 'Private chat', route = '/c/test-conversation-id') {
  const link = document.createElement('a');
  link.href = route;
  const outer = document.createElement('div');
  const inner = document.createElement('div');
  inner.textContent = title;
  outer.append(inner);
  link.append(outer);
  document.querySelector('nav[role="navigation"]').append(link);
  return link;
}

function addChatGPTProject(title, { expanded = true, withTitle = true } = {}) {
  const row = document.createElement('div');
  row.setAttribute('role', 'button');
  row.setAttribute('aria-expanded', String(expanded));
  const titleLeaf = document.createElement('span');
  if (withTitle) titleLeaf.append(document.createTextNode(title));
  row.append(titleLeaf);
  const actions = document.createElement('div');
  const menu = document.createElement('button');
  menu.setAttribute('aria-label', `Project actions for ${title}`);
  const newChat = document.createElement('button');
  newChat.setAttribute('aria-label', `New chat in ${title}`);
  actions.append(menu, newChat);
  row.append(actions);
  document.querySelector('nav[role="navigation"]').append(row);
  let nestedConversation = null;
  if (expanded) {
    nestedConversation = document.createElement('a');
    nestedConversation.href = '/g/test-project-id/c/test-conversation-id';
    nestedConversation.textContent = 'Nested conversation';
    document.querySelector('nav[role="navigation"]').append(nestedConversation);
  }
  return { row, titleLeaf, menu, newChat, nestedConversation };
}

function addGeminiEntry(list, title, route = '/app/conversation') {
  const item = document.createElement('gem-nav-list-item');
  const link = document.createElement('a');
  link.setAttribute('href', route);
  link.innerHTML = '<span><span><span><span></span></span></span></span>';
  link.querySelector('span span span span').append(document.createTextNode(title));
  const action = document.createElement('button');
  action.type = 'button';
  action.setAttribute('aria-label', 'More options');
  item.append(link, action);
  list.append(item);
  return { item, link, title: link.querySelector('span span span span'), action };
}

function message(chrome, payload) {
  let response;
  chrome.messageListener(payload, {}, (value) => { response = value; });
  return response;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('content script privacy and status behavior', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('masks matching titles before saved settings finish loading, then restores disabled state', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: false });
    const title = addTitle();
    expect(document.body.hasAttribute('data-aipg-ready')).toBe(false);
    expect(window.getComputedStyle(title).filter).toContain('blur(');
    await tick();
    expect(document.body.getAttribute('data-aipg-enabled')).toBe('false');
    expect(window.getComputedStyle(title).filter).not.toContain('blur(');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('disabled');
  });

  it('restores enabled preference and verifies matching title blur', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    const title = addTitle();
    await tick();
    expect(window.getComputedStyle(title).filter).toContain('blur(');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('protected');
  });

  it('reports an intentional hover reveal without claiming all titles are masked', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true, hoverRevealEnabled: true });
    const title = addTitle();
    await tick();
    title.style.setProperty('filter', 'none', 'important');
    vi.spyOn(title, 'matches').mockImplementation((selector) => selector === ':hover');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({
      status: 'revealed',
      count: 1,
      verifiedCount: 0,
    });
  });

  it('matches the current ChatGPT sidebar shell and leaves ordinary controls alone', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    const chat = addTitle('Private conversation');
    const project = document.createElement('a');
    project.href = '/projects/project-id';
    project.textContent = 'Project entry';
    const newChat = document.createElement('a');
    newChat.href = '/';
    newChat.dataset.testid = 'create-new-chat-button';
    newChat.textContent = 'New chat';
    document.querySelector('nav[role="navigation"]').append(project, newChat);
    const mainContentLink = document.createElement('a');
    mainContentLink.href = '/c/main-content-link';
    document.body.append(mainContentLink);
    await tick();
    expect(window.getComputedStyle(chat).filter).toContain('blur(');
    expect(window.getComputedStyle(project).filter).toContain('blur(');
    expect(window.getComputedStyle(newChat).filter).not.toContain('blur(');
    expect(window.getComputedStyle(mainContentLink).filter).not.toContain('blur(');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'protected', count: 2 });
  });

  it('recognizes conversation links in the live ChatGPT landmark structure', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    const sidebar = document.querySelector('nav[role="navigation"]');
    for (let index = 0; index < 30; index += 1) addTitle(`Private title ${index}`);
    for (let index = 0; index < 7; index += 1) {
      const control = document.createElement('a');
      control.href = `/navigation-${index}`;
      control.textContent = 'Navigation';
      sidebar.append(control);
    }
    const secondaryNavigation = document.createElement('nav');
    secondaryNavigation.setAttribute('role', 'navigation');
    secondaryNavigation.innerHTML = '<a href="/settings">Settings</a>';
    document.body.append(secondaryNavigation);
    await tick();
    expect(document.querySelectorAll('nav[role="navigation"] a[href^="/c/"]')).toHaveLength(30);
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'protected', count: 30 });
    expect(window.getComputedStyle(secondaryNavigation.querySelector('a')).filter).not.toContain('blur(');
  });

  it('covers standard chats, project-scoped chats, and project links in Safe Mode', async () => {
    const chrome = runContentScript({
      blurEnabled_ChatGPT: true,
      presentationSafeModeEnabled: true,
      hoverRevealEnabled: true,
    });
    const sidebar = document.querySelector('nav[role="navigation"]');
    const standard = addTitle('Standard chat', '/c/private-id-a');
    const nested = addTitle('Project chat', '/g/private-project-id/c/private-id-b');
    let navigationClicks = 0;
    standard.addEventListener('click', (event) => {
      event.preventDefault();
      navigationClicks += 1;
    });
    const recent = document.createElement('div');
    recent.dataset.testid = 'recent-conversations';
    const pinned = document.createElement('div');
    pinned.dataset.testid = 'pinned-conversations';
    recent.append(standard);
    pinned.append(nested);
    sidebar.append(recent, pinned);
    const project = document.createElement('a');
    project.href = '/g/private-project-id';
    project.textContent = 'Private project';
    sidebar.append(project);
    await tick();
    for (const entry of [standard, nested, project]) {
      expect(window.getComputedStyle(entry).color).toBe('rgba(0, 0, 0, 0)');
      expect(window.getComputedStyle(entry).backgroundColor).toBe('rgb(17, 17, 17)');
      expect(window.getComputedStyle(entry).filter).toBe('none');
    }
    standard.click();
    expect(navigationClicks).toBe(1);
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'safe-protected', count: 3 });
    const diagnostics = message(chrome, { type: 'AIPG_GET_DIAGNOSTICS' });
    expect(diagnostics).toMatchObject({
      eligibleConversationEntries: 2,
      maskedConversationEntries: 2,
      eligibleProjectEntries: 1,
      maskedProjectEntries: 1,
      nestedProjectConversationCount: 1,
      recentConversationEntries: 1,
      pinnedConversationEntries: 1,
    });
  });

  it('marks and blurs only the title leaf of project button rows', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    const projectsHeading = document.createElement('div');
    projectsHeading.textContent = 'Projects';
    document.querySelector('nav[role="navigation"]').append(projectsHeading);
    const project = addChatGPTProject('SYNTHETIC_PROJECT_LABEL', { expanded: true });
    let rowClicks = 0;
    let menuClicks = 0;
    project.row.addEventListener('click', () => { rowClicks += 1; });
    project.menu.addEventListener('click', (event) => { event.stopPropagation(); menuClicks += 1; });
    await tick();

    const marker = project.row.querySelector('[data-aipg-chatgpt-project-title]');
    expect(marker).not.toBeNull();
    expect(window.getComputedStyle(marker).filter).toContain('blur(');
    expect(window.getComputedStyle(project.row).filter).not.toContain('blur(');
    expect(window.getComputedStyle(project.menu).filter).not.toContain('blur(');
    expect(window.getComputedStyle(project.newChat).filter).not.toContain('blur(');
    expect(window.getComputedStyle(projectsHeading).filter).not.toContain('blur(');
    expect(window.getComputedStyle(project.nestedConversation).filter).toContain('blur(');

    project.row.click();
    project.menu.click();
    expect(rowClicks).toBe(1);
    expect(menuClicks).toBe(1);
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'protected', count: 2 });
    const diagnostics = message(chrome, { type: 'AIPG_GET_DIAGNOSTICS' });
    expect(diagnostics).toMatchObject({
      eligibleConversationEntries: 1,
      maskedConversationEntries: 1,
      eligibleProjectEntries: 1,
      maskedProjectEntries: 1,
      activeProjectTitleSupported: false,
      chatGPTProjectClassification: {
        projectActionControlCount: 1,
        discoveredComponents: 1,
        interactiveRowCount: 1,
        roleButtonRowCount: 1,
        expectedTitleLeafCount: 1,
        titleLeafCount: 1,
        directTextNodeCount: 1,
        acceptedCount: 1,
        markerAssignedCount: 1,
        computedMaskedCount: 1,
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain('SYNTHETIC_PROJECT_LABEL');
    expect(JSON.stringify(diagnostics)).not.toContain('test-project-id');
    expect(JSON.stringify(diagnostics)).not.toContain('Project actions for');
  });

  it('keeps project title leaves opaque in Presentation Mode without masking controls or main content', async () => {
    const chrome = runContentScript({
      blurEnabled_ChatGPT: true,
      hoverRevealEnabled: true,
      presentationSafeModeEnabled: true,
    });
    const project = addChatGPTProject('SYNTHETIC_SAFE_PROJECT');
    const mainHeading = document.createElement('h1');
    mainHeading.textContent = 'Main conversation content';
    document.body.append(mainHeading);
    await tick();

    const titleLeaf = project.row.querySelector('[data-aipg-chatgpt-project-title]');
    expect(window.getComputedStyle(titleLeaf).color).toBe('rgba(0, 0, 0, 0)');
    expect(window.getComputedStyle(titleLeaf).backgroundColor).toBe('rgb(17, 17, 17)');
    expect(window.getComputedStyle(project.menu).backgroundColor).not.toBe('rgb(17, 17, 17)');
    expect(window.getComputedStyle(project.newChat).backgroundColor).not.toBe('rgb(17, 17, 17)');
    expect(window.getComputedStyle(mainHeading).backgroundColor).not.toBe('rgb(17, 17, 17)');
    expect(css).toContain('[data-aipg-chatgpt-project-row]:hover [data-aipg-chatgpt-project-title]');
    expect(css).toContain('data-aipg-safe-mode="true"] nav[role="navigation"] [data-aipg-chatgpt-project-title]');
    expect(css).not.toContain('[data-aipg-chatgpt-project-title]:focus');
    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('true');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'safe-protected', count: 2 });
  });

  it('tracks project creation, renaming, expansion and deletion with sanitized coverage', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    const project = addChatGPTProject('INITIAL_SYNTHETIC_LABEL', { expanded: false });
    await tick();
    expect(project.row.querySelectorAll('[data-aipg-chatgpt-project-title]')).toHaveLength(1);
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'protected', count: 1 });

    project.row.setAttribute('aria-expanded', 'true');
    const titleNode = project.row.querySelector('[data-aipg-chatgpt-project-title]').firstChild;
    titleNode.nodeValue = 'RENAMED_SYNTHETIC_LABEL';
    const added = addChatGPTProject('NEW_SYNTHETIC_LABEL', { expanded: false });
    await tick();
    expect(project.row.querySelector('[data-aipg-chatgpt-project-title]').textContent).toBe('RENAMED_SYNTHETIC_LABEL');
    expect(added.row.querySelector('[data-aipg-chatgpt-project-title]')).not.toBeNull();
    expect(window.getComputedStyle(added.row.querySelector('[data-aipg-chatgpt-project-title]')).filter).toContain('blur(');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'protected', count: 2 });

    project.row.remove();
    await tick();
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'protected', count: 1 });
  });

  it('reports partial coverage when a project action row has no title leaf', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    addChatGPTProject('IGNORED_EMPTY_LABEL', { expanded: false, withTitle: false });
    await tick();

    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({
      status: 'partially-protected',
      count: 0,
      unclassifiedCandidateCount: 1,
    });
    expect(message(chrome, { type: 'AIPG_GET_DIAGNOSTICS' }).chatGPTProjectClassification).toMatchObject({
      discoveredComponents: 1,
      acceptedCount: 0,
      rejectedReasonCounts: { project_title_text_missing: 1 },
    });
  });

  it('reports partial coverage when a sensitive-looking sidebar item is unclassified', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    addTitle('Known entry');
    const unknown = document.createElement('a');
    unknown.href = '/history/private-route';
    unknown.dataset.testid = 'conversation-history-item';
    unknown.textContent = 'Unclassified entry';
    document.querySelector('nav[role="navigation"]').append(unknown);
    await tick();
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({
      status: 'partially-protected',
      count: 1,
      unclassifiedCandidateCount: 1,
    });
    const diagnostics = message(chrome, { type: 'AIPG_GET_DIAGNOSTICS' });
    expect(diagnostics.unclassifiedCandidateEntries).toBe(1);
    expect(diagnostics.errorCode).toBe('PARTIAL_COVERAGE');
  });

  it('keeps content opaquely masked and returns an error if storage restoration fails', async () => {
    const chrome = runContentScript({}, true);
    const title = addTitle();
    await tick();
    expect(window.getComputedStyle(title).backgroundColor).toBe('rgb(17, 17, 17)');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('error');
  });

  it('reports an empty sidebar as unverifiable rather than failed protection', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    await tick();
    const result = message(chrome, { type: 'AIPG_GET_STATUS' });
    expect(result.status).toBe('empty');
    expect(result.message).toContain('no navigation links');
  });

  it('reports a missing privacy stylesheet as an application error', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    await tick();
    document.head.innerHTML = '';
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'error' });
  });

  it('returns local diagnostics with structure and counts only', async () => {
    const chrome = runContentScript({
      blurEnabled_ChatGPT: true,
      presentationSafeModeEnabled: true,
    });
    addTitle('DO_NOT_INCLUDE_PRIVATE_TITLE');
    const project = document.createElement('a');
    project.href = '/g/DO_NOT_INCLUDE_ROUTE_ID';
    project.textContent = 'DO_NOT_INCLUDE_PROJECT_LABEL';
    document.querySelector('nav[role="navigation"]').append(project);
    await tick();
    const result = message(chrome, {
      type: 'AIPG_GET_DIAGNOSTICS',
      popupSettings: { privacyEnabled: true, presentationModeEnabled: true },
    });
    const serialized = JSON.stringify(result);
    expect(result).toMatchObject({
      extensionVersion: '1.3.0',
      platform: 'ChatGPT',
      contentScriptLoaded: true,
      settingsRestored: true,
      privacyEnabled: true,
      presentationModeEnabled: true,
      sidebarRootMatches: 1,
      conversationTargetMatches: 1,
      projectTargetMatches: 1,
      eligibleConversationEntries: 1,
      maskedConversationEntries: 1,
      eligibleProjectEntries: 1,
      maskedProjectEntries: 1,
      unmaskedEligibleEntries: 0,
      computedMaskApplied: true,
      popupPageStateMismatch: { privacyEnabled: false, presentationModeEnabled: false },
      errorCode: 'NONE',
    });
    expect(serialized).not.toContain('DO_NOT_INCLUDE_PRIVATE_TITLE');
    expect(serialized).not.toContain('DO_NOT_INCLUDE_PROJECT_LABEL');
    expect(serialized).not.toContain('DO_NOT_INCLUDE_ROUTE_ID');
    expect(serialized).not.toContain('href');
    expect(serialized).not.toContain('https://');
  });

  it('masks verified Gemini history and project title leaves but leaves controls alone', async () => {
    const chrome = runContentScript({ blurEnabled_Gemini: true }, false, geminiPlatform);
    const list = document.querySelector('mat-nav-list');
    const histories = Array.from({ length: 6 }, (_, index) => addGeminiEntry(list, `PRIVATE_HISTORY_${index}`));
    const notebookItem = document.createElement('project-sidenav-list-item');
    notebookItem.setAttribute('data-testid', 'notebook-list-entry');
    notebookItem.append(addGeminiEntry(notebookItem, 'PRIVATE_PROJECT', '/app/project').item);
    const newNotebook = document.createElement('button');
    newNotebook.setAttribute('aria-label', 'New notebook');
    const allNotebooks = document.createElement('a');
    allNotebooks.href = '/app/notebooks';
    allNotebooks.textContent = 'All notebooks';
    const navigationClicks = vi.fn();
    const menuClicks = vi.fn();
    histories[0].action.addEventListener('click', menuClicks);
    notebookItem.querySelector('a').addEventListener('click', (event) => {
      event.preventDefault();
      navigationClicks();
    });
    newNotebook.addEventListener('click', navigationClicks);
    const otherProjects = Array.from({ length: 2 }, (_, index) => {
      const project = document.createElement('project-sidenav-list-item');
      project.setAttribute('data-testid', 'notebook-list-entry');
      const route = index === 0 ? '/library/item' : '/app/project';
      project.append(addGeminiEntry(project, `PRIVATE_PROJECT_${index}`, route).item);
      return project;
    });
    list.append(notebookItem, ...otherProjects, newNotebook, allNotebooks);
    await tick();
    const result = message(chrome, {
      type: 'AIPG_GET_DIAGNOSTICS',
      popupSettings: { privacyEnabled: true, presentationModeEnabled: false },
    });
    expect(result).toMatchObject({
      contentScriptLoaded: true,
      platform: 'Gemini',
      sidebarRootMatches: 1,
      sidebarRootSelectorConfigured: true,
      conversationTargetMatches: 6,
      projectTargetMatches: 3,
      eligibleConversationEntries: 6,
      maskedConversationEntries: 6,
      eligibleProjectEntries: 3,
      maskedProjectEntries: 3,
      eligibleNotebookProjectEntries: 3,
      maskedNotebookProjectEntries: 3,
      unmaskedEligibleEntries: 0,
      computedMaskApplied: true,
      protectionStatus: 'protected',
      errorCode: 'NONE',
      diagnosticsBuildId: 'aipg-project-title-leaf-r1',
      geminiProjectClassification: {
        discoveredComponents: 3,
        expectedTitleLeafCount: 3,
        directTextNodeCount: 3,
        notebookAncestorMarkerCount: 3,
        acceptedCount: 3,
        markerAssignedCount: 3,
        computedMaskedCount: 3,
        rejectedReasonCounts: {},
      },
    });
    expect(histories.every(({ title }) => window.getComputedStyle(title).filter.includes('blur('))).toBe(true);
    expect(histories.every(({ action }) => !window.getComputedStyle(action).filter.includes('blur('))).toBe(true);
    expect(window.getComputedStyle(notebookItem.querySelector('[data-aipg-gemini-project-title]')).filter).toContain('blur(');
    expect(notebookItem.querySelector('a').click()).toBeUndefined();
    expect(navigationClicks).toHaveBeenCalledTimes(1);
    newNotebook.click();
    expect(navigationClicks).toHaveBeenCalledTimes(2);
    expect(newNotebook.hasAttribute('data-aipg-gemini-project-title')).toBe(false);
    expect(window.getComputedStyle(newNotebook).filter).not.toContain('blur(');
    expect(allNotebooks.hasAttribute('data-aipg-gemini-project-title')).toBe(false);
    expect(window.getComputedStyle(allNotebooks).filter).not.toContain('blur(');
    histories[0].action.click();
    expect(menuClicks).toHaveBeenCalledTimes(1);
    expect(result.geminiNavigationStructure[0].lists[0]).toMatchObject({ linkCount: 10 });
    expect(result.geminiNavigationStructure[0].itemComponents).toMatchObject([
      { component: 'gem-nav-list-item', count: 9 },
      { component: 'project-sidenav-list-item', count: 3 },
    ]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_HISTORY');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PROJECT');
    expect(JSON.stringify(result)).not.toContain('/app/');
    const status = message(chrome, { type: 'AIPG_GET_STATUS' });
    expect(status.status).toBe('protected');
    expect(status.message).toContain('6 of 6 conversation titles');
    expect(status.message).toContain('3 of 3 notebook/project names');
  });

  it('uses opaque Gemini Safe Mode masking and blocks hover reveal', async () => {
    const chrome = runContentScript({ blurEnabled_Gemini: true, hoverRevealEnabled: true, presentationSafeModeEnabled: true }, false, geminiPlatform);
    const list = document.querySelector('mat-nav-list');
    const histories = Array.from({ length: 6 }, (_, index) => addGeminiEntry(list, `PRIVATE_${index}`));
    const project = document.createElement('project-sidenav-list-item');
    project.setAttribute('data-testid', 'notebook-list-entry');
    project.append(addGeminiEntry(project, 'PRIVATE_PROJECT', '/app/project').item);
    list.append(project);
    await tick();
    const title = histories[0].title;
    expect(document.body.getAttribute('data-aipg-safe-mode')).toBe('true');
    expect(window.getComputedStyle(title)).toMatchObject({
      filter: 'none',
      color: 'rgba(0, 0, 0, 0)',
      backgroundColor: 'rgb(17, 17, 17)',
    });
    title.dispatchEvent(new Event('mouseenter'));
    title.focus();
    expect(window.getComputedStyle(title).color).toBe('rgba(0, 0, 0, 0)');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('safe-protected');
    expect(window.getComputedStyle(project.querySelector('[data-aipg-gemini-project-title]')).backgroundColor).toBe('rgb(17, 17, 17)');
    expect(css.slice(css.indexOf('/* Safe Mode'))).not.toContain(':hover');
  });

  it('masks Gemini rows inserted dynamically after the verified history group appears', async () => {
    const chrome = runContentScript({ blurEnabled_Gemini: true }, false, geminiPlatform);
    const list = document.querySelector('mat-nav-list');
    Array.from({ length: 5 }, (_, index) => addGeminiEntry(list, `PRIVATE_${index}`));
    await tick();
    const added = addGeminiEntry(list, 'PRIVATE_DYNAMIC');
    await tick();
    expect(added.title.hasAttribute('data-aipg-gemini-conversation-title')).toBe(true);
    expect(window.getComputedStyle(added.title).filter).toContain('blur(');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('protected');
  });

  it('masks new notebook components, preserves action controls, and keeps protection through rename and switching', async () => {
    const chrome = runContentScript({ blurEnabled_Gemini: true }, false, geminiPlatform);
    const list = document.querySelector('mat-nav-list');
    const project = document.createElement('project-sidenav-list-item');
    project.setAttribute('data-testid', 'notebook-list-entry');
    const entry = addGeminiEntry(project, 'PRIVATE_NOTEBOOK', '/app/notebook');
    project.append(entry.item);
    list.append(project);
    await tick();
    expect(entry.title.hasAttribute('data-aipg-gemini-project-title')).toBe(true);
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('protected');

    entry.title.firstChild.nodeValue = 'RENAMED_PRIVATE_NOTEBOOK';
    await tick();
    expect(entry.title.hasAttribute('data-aipg-gemini-project-title')).toBe(true);
    expect(window.getComputedStyle(entry.title).filter).toContain('blur(');

    entry.link.setAttribute('href', '/app/another-notebook');
    await tick();
    expect(entry.title.hasAttribute('data-aipg-gemini-project-title')).toBe(true);
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('protected');
    expect(window.getComputedStyle(entry.action).filter).not.toContain('blur(');

    const refreshedEntry = addGeminiEntry(project, 'UPDATED_NOTEBOOK', '/library/updated');
    entry.item.replaceWith(refreshedEntry.item);
    await tick();
    expect(refreshedEntry.title.hasAttribute('data-aipg-gemini-project-title')).toBe(true);
    expect(window.getComputedStyle(refreshedEntry.title).filter).toContain('blur(');
  });

  it('does not guess at active notebook headings without verified main-view structure', async () => {
    const chrome = runContentScript({ blurEnabled_Gemini: true, presentationSafeModeEnabled: true }, false, geminiPlatform);
    const heading = document.createElement('h1');
    heading.textContent = 'ACTIVE_NOTEBOOK_TITLE';
    document.body.append(heading);
    await tick();
    const diagnostics = message(chrome, { type: 'AIPG_GET_DIAGNOSTICS' });
    expect(diagnostics.activeNotebookTitleSupported).toBe(false);
    expect(diagnostics.eligibleActiveNotebookTitleEntries).toBe(0);
    expect(heading.hasAttribute('data-aipg-gemini-project-title')).toBe(false);
    expect(window.getComputedStyle(heading).backgroundColor).not.toBe('rgb(17, 17, 17)');
    expect(JSON.stringify(diagnostics)).not.toContain('ACTIVE_NOTEBOOK_TITLE');
  });

  it('re-attaches after Gemini SPA sidebar replacement and protects again after reload', async () => {
    const settings = { blurEnabled_Gemini: true, presentationSafeModeEnabled: true };
    const firstChrome = runContentScript(settings, false, geminiPlatform);
    const oldRoot = document.querySelector('bard-sidenav[role="navigation"]');
    const replacement = document.createElement('bard-sidenav');
    replacement.setAttribute('role', 'navigation');
    replacement.innerHTML = '<mat-nav-list></mat-nav-list>';
    oldRoot.replaceWith(replacement);
    Array.from({ length: 6 }, (_, index) => addGeminiEntry(replacement.querySelector('mat-nav-list'), `PRIVATE_SPA_${index}`));
    await tick();
    expect(message(firstChrome, { type: 'AIPG_GET_STATUS' }).status).toBe('safe-protected');

    const reloadedChrome = runContentScript(settings, false, geminiPlatform);
    const refreshedList = document.querySelector('mat-nav-list');
    const refreshed = Array.from({ length: 6 }, (_, index) => addGeminiEntry(refreshedList, `PRIVATE_REFRESH_${index}`));
    await tick();
    expect(refreshed.every(({ title }) => window.getComputedStyle(title).backgroundColor === 'rgb(17, 17, 17)')).toBe(true);
    expect(message(reloadedChrome, { type: 'AIPG_GET_STATUS' }).status).toBe('safe-protected');
  });

  it('reports an empty Gemini sidebar separately and unknown markup as unverified', async () => {
    const emptyChrome = runContentScript({ blurEnabled_Gemini: true }, false, geminiPlatform);
    await tick();
    expect(message(emptyChrome, { type: 'AIPG_GET_STATUS' }).status).toBe('empty');

    const unknownChrome = runContentScript({ blurEnabled_Gemini: true }, false, geminiPlatform);
    const list = document.querySelector('mat-nav-list');
    const unknown = document.createElement('gem-nav-list-item');
    unknown.innerHTML = '<a href="/app/unknown"><span>UNKNOWN_LABEL</span></a><button></button>';
    list.append(unknown);
    await tick();
    expect(message(unknownChrome, { type: 'AIPG_GET_STATUS' }).status).toBe('unverified');
    expect(unknown.querySelector('a').hasAttribute('data-aipg-gemini-conversation-title')).toBe(false);
  });

  it('keeps notebook labels unclassified until their title-bearing structure is verified', async () => {
    const chrome = runContentScript({ blurEnabled_Gemini: true }, false, geminiPlatform);
    const list = document.querySelector('mat-nav-list');
    Array.from({ length: 6 }, (_, index) => addGeminiEntry(list, `PRIVATE_${index}`));
    const notebook = document.createElement('div');
    notebook.setAttribute('data-testid', 'notebook-title');
    notebook.textContent = 'PRIVATE_NOTEBOOK';
    list.append(notebook);
    await tick();
    const status = message(chrome, { type: 'AIPG_GET_STATUS' });
    expect(status.status).toBe('partially-protected');
    expect(status.unclassifiedCandidateCount).toBe(1);
    expect(notebook.hasAttribute('data-aipg-gemini-project-title')).toBe(false);
    expect(status.message).not.toContain('PRIVATE_NOTEBOOK');
  });

  it('reports only bounded reason codes for a rejected Gemini project candidate', async () => {
    const chrome = runContentScript({ blurEnabled_Gemini: true }, false, geminiPlatform);
    const project = document.createElement('project-sidenav-list-item');
    project.setAttribute('data-testid', 'notebook-list-entry');
    const entry = addGeminiEntry(project, 'PRIVATE_REJECTED_NOTEBOOK', 'https://external.invalid/private');
    project.append(entry.item);
    document.querySelector('mat-nav-list').append(project);
    await tick();
    const diagnostics = message(chrome, { type: 'AIPG_GET_DIAGNOSTICS' });
    expect(diagnostics.geminiProjectClassification).toMatchObject({
      discoveredComponents: 1,
      expectedTitleLeafCount: 1,
      directTextNodeCount: 1,
      acceptedCount: 0,
      rejectedReasonCounts: { unsupported_href_category: 1 },
    });
    expect(entry.title.hasAttribute('data-aipg-gemini-project-title')).toBe(false);
    expect(JSON.stringify(diagnostics)).not.toContain('PRIVATE_REJECTED_NOTEBOOK');
    expect(JSON.stringify(diagnostics)).not.toContain('external.invalid');
  });

  it('protects dynamically inserted titles and detects a changed selector', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    await tick();
    const title = addTitle('New conversation', '/g/private-project-id/c/private-conversation-id');
    expect(window.getComputedStyle(title).filter).toContain('blur(');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).count).toBe(1);
    document.querySelector('nav[role="navigation"]').removeAttribute('role');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('unverified');
  });

  it('applies settings pushed from the popup and does not reveal on keyboard focus', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true, hoverRevealEnabled: false });
    const title = addTitle();
    await tick();
    const response = message(chrome, {
      type: 'AIPG_APPLY_SETTINGS', isEnabled: true, hoverReveal: true,
    });
    expect(response.ok).toBe(true);
    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('true');
    expect(window.getComputedStyle(title).filter).toContain('blur(');
    expect(css).toContain('[data-aipg-enabled="true"][data-aipg-hover-reveal="true"]');
    expect(css).toContain('[data-aipg-gemini-conversation-title]:hover');
    expect(css).not.toContain('[data-aipg-gemini-conversation-title]:focus');
  });

  it('reacts to synchronized preference changes in another open tab', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    const title = addTitle();
    await tick();
    chrome.storageListener({ blurEnabled_ChatGPT: { newValue: false } }, 'sync');
    expect(document.body.getAttribute('data-aipg-enabled')).toBe('false');
    expect(window.getComputedStyle(title).filter).not.toContain('blur(');
  });

  it('handles SPA navigation without observers and verifies new matching content', async () => {
    const chrome = runContentScript({ blurEnabled_ChatGPT: true });
    await tick();
    window.history.replaceState({}, '', '/new-route');
    addTitle('Conversation after navigation');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('protected');
  });

  it('activates Presentation Safe Mode with an opaque mask and overrides hover reveal', async () => {
    const chrome = runContentScript({
      blurEnabled_ChatGPT: true,
      hoverRevealEnabled: true,
      presentationSafeModeEnabled: true,
    });
    const title = addTitle();
    await tick();
    const style = window.getComputedStyle(title);
    expect(document.body.getAttribute('data-aipg-safe-mode')).toBe('true');
    expect(style.filter).toBe('none');
    expect(style.color).toBe('rgba(0, 0, 0, 0)');
    expect(style.backgroundColor).toBe('rgb(17, 17, 17)');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('safe-protected');
    expect(css).toContain(':not([data-aipg-safe-mode="true"])');
  });

  it('disables Safe Mode without altering the saved regular blur preference', async () => {
    const settings = { blurEnabled_ChatGPT: true, presentationSafeModeEnabled: true };
    const chrome = runContentScript(settings);
    const title = addTitle();
    await tick();
    chrome.storageListener({ presentationSafeModeEnabled: { newValue: false } }, 'local');
    expect(document.body.getAttribute('data-aipg-safe-mode')).toBe('false');
    expect(settings.blurEnabled_ChatGPT).toBe(true);
    expect(window.getComputedStyle(title).filter).toContain('blur(');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('protected');
  });

  it('keeps regular preferences intact while Safe Mode is active', async () => {
    const chrome = runContentScript({
      blurEnabled_ChatGPT: false,
      hoverRevealEnabled: true,
      presentationSafeModeEnabled: true,
    });
    const title = addTitle();
    await tick();
    expect(document.body.getAttribute('data-aipg-enabled')).toBe('false');
    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('true');
    expect(window.getComputedStyle(title).backgroundColor).toBe('rgb(17, 17, 17)');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' }).status).toBe('safe-protected');
  });

  it('opaquely masks verified project routes without masking ordinary navigation controls', async () => {
    const chrome = runContentScript({ presentationSafeModeEnabled: true });
    const sidebar = document.querySelector('nav[role="navigation"]');
    const project = document.createElement('a');
    project.href = '/projects/project-id';
    project.textContent = 'Project label';
    const projectConversation = document.createElement('a');
    projectConversation.href = '/c/project-conversation-id';
    projectConversation.textContent = 'Nested conversation';
    const search = document.createElement('button');
    search.dataset.testid = 'search-button';
    search.textContent = 'Search';
    const projectsControl = document.createElement('a');
    projectsControl.href = '/projects';
    projectsControl.dataset.testid = 'projects-button';
    projectsControl.textContent = 'Projects navigation';
    sidebar.append(project, projectConversation, search, projectsControl);
    await tick();
    const projectStyle = window.getComputedStyle(project);
    expect(projectStyle.color).toBe('rgba(0, 0, 0, 0)');
    expect(projectStyle.backgroundColor).toBe('rgb(17, 17, 17)');
    const conversationStyle = window.getComputedStyle(projectConversation);
    expect(conversationStyle.color).toBe('rgba(0, 0, 0, 0)');
    expect(conversationStyle.backgroundColor).toBe('rgb(17, 17, 17)');
    expect(conversationStyle.filter).toBe('none');
    expect(window.getComputedStyle(search).backgroundColor).not.toBe('rgb(17, 17, 17)');
    expect(window.getComputedStyle(projectsControl).backgroundColor).not.toBe('rgb(17, 17, 17)');
    expect(message(chrome, { type: 'AIPG_GET_STATUS' })).toMatchObject({ status: 'safe-protected', count: 2 });
  });

  it('keeps Safe Mode opaque on focused conversation links even when hover reveal is enabled', async () => {
    runContentScript({
      blurEnabled_ChatGPT: true,
      hoverRevealEnabled: true,
      presentationSafeModeEnabled: true,
    });
    const link = addTitle();
    await tick();
    link.focus();
    const style = window.getComputedStyle(link);
    expect(style.color).toBe('rgba(0, 0, 0, 0)');
    expect(style.backgroundColor).toBe('rgb(17, 17, 17)');
    expect(style.filter).toBe('none');
    expect(css).toContain(':not([data-aipg-safe-mode="true"])');
  });

  it('reports Claude protection only when the runtime confirms a masked matching entry', async () => {
    const chrome = runContentScript({ blurEnabled_Claude: true }, false, claudePlatform);
    const link = document.createElement('a');
    link.href = '/chat/abc';
    link.textContent = 'Private Claude chat';
    document.body.append(link);
    await tick();
    expect(window.getComputedStyle(link).filter).toContain('blur(');
    const result = message(chrome, { type: 'AIPG_GET_STATUS' });
    expect(result.status).toBe('protected');
    expect(result.count).toBe(1);
    expect(result.message).toContain('1 sensitive sidebar entry blurred');
  });

  it('reveals the same Claude conversation anchor that receives the blur when hover is enabled', async () => {
    runContentScript({ blurEnabled_Claude: true, hoverRevealEnabled: true }, false, claudePlatform);
    const row = document.createElement('div');
    const link = document.createElement('a');
    link.href = '/chat/pinned-or-dynamic-id';
    const title = document.createElement('span');
    title.textContent = 'Private Claude chat';
    link.append(title);
    row.append(link);
    document.querySelector('nav[role="navigation"]').append(row);
    await tick();

    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('true');
    expect(window.getComputedStyle(link).filter).toContain('blur(');
    expect(css).toContain('body[data-aipg-platform="Claude"][data-aipg-enabled="true"][data-aipg-hover-reveal="true"]:not([data-aipg-safe-mode="true"]) a[href^="/chat/"]:hover');
    expect(css).toContain('body[data-aipg-platform="Claude"][data-aipg-enabled="true"] a[href^="/chat/"] {');
    expect(css).toContain('filter: none !important;');

    // :hover belongs to the anchor, so hovering its title/row descendants also
    // matches the anchor rule; the override must not target only the child.
    const revealTarget = 'body[data-aipg-platform="Claude"][data-aipg-enabled="true"][data-aipg-hover-reveal="true"]:not([data-aipg-safe-mode="true"]) a[href^="/chat/"]';
    document.body.setAttribute('data-aipg-platform', 'Claude');
    document.body.setAttribute('data-aipg-enabled', 'true');
    document.body.setAttribute('data-aipg-hover-reveal', 'true');
    document.body.setAttribute('data-aipg-safe-mode', 'false');
    expect(link.matches(revealTarget)).toBe(true);
    expect(title.matches(revealTarget)).toBe(false);
    expect(css).not.toContain('a[href^="/chat/"] *:hover');
  });

  it('keeps Claude titles blurred when hover reveal is disabled', async () => {
    runContentScript({ blurEnabled_Claude: true, hoverRevealEnabled: false }, false, claudePlatform);
    const link = addTitle('Pinned Claude conversation', '/chat/pinned-id');
    await tick();

    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('false');
    expect(window.getComputedStyle(link).filter).toContain('blur(');
    expect(css).toContain('[data-aipg-hover-reveal="true"]:not([data-aipg-safe-mode="true"]) a[href^="/chat/"]:hover');
  });

  it('keeps Claude titles opaque in Presentation Mode even when saved hover is enabled', async () => {
    const settings = {
      blurEnabled_Claude: true,
      hoverRevealEnabled: true,
      presentationSafeModeEnabled: true,
    };
    runContentScript(settings, false, claudePlatform);
    const link = addTitle('Private Claude conversation', '/chat/dynamic-id');
    await tick();

    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('true');
    expect(document.body.getAttribute('data-aipg-safe-mode')).toBe('true');
    expect(settings.hoverRevealEnabled).toBe(true);
    expect(window.getComputedStyle(link).color).toBe('rgba(0, 0, 0, 0)');
    expect(window.getComputedStyle(link).backgroundColor).toBe('rgb(17, 17, 17)');
    expect(window.getComputedStyle(link).filter).toBe('none');
    expect(css).toContain('body[data-aipg-platform="Claude"][data-aipg-safe-mode="true"] a[href^="/chat/"]');
    expect(css).toContain('body[data-aipg-platform="Claude"][data-aipg-safe-mode="true"] a[href^="/chat/"] *');
    expect(css).toContain(':not([data-aipg-safe-mode="true"]) a[href^="/chat/"]:hover');
  });

  it('keeps Claude hover preference synchronized from storage and popup messages', async () => {
    const chrome = runContentScript({ blurEnabled_Claude: true, hoverRevealEnabled: false }, false, claudePlatform);
    await tick();

    chrome.storageListener({ hoverRevealEnabled: { newValue: true } }, 'sync');
    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('true');
    const response = message(chrome, {
      type: 'AIPG_APPLY_SETTINGS', isEnabled: true, hoverReveal: false, safeMode: false,
    });
    expect(response.ok).toBe(true);
    expect(document.body.getAttribute('data-aipg-hover-reveal')).toBe('false');
    expect(document.body.getAttribute('data-aipg-safe-mode')).toBe('false');
  });
});
