(() => {
  const platforms = globalThis.AIPG_PLATFORMS || [];
  const platform = platforms.find((item) => item.hostnames.includes(window.location.hostname));
  if (!platform) return;

  const hoverStorageKey = globalThis.AIPG_HOVER_STORAGE_KEY || 'hoverRevealEnabled';
  const safeModeStorageKey = globalThis.AIPG_SAFE_MODE_STORAGE_KEY || 'presentationSafeModeEnabled';

  let initialized = false;
  let settingsRestored = false;
  let storageFailed = false;
  let settingsRevision = 0;
  let isEnabled = false;
  let hoverReveal = false;
  let safeMode = false;
  let initializationError = '';

  const setAttribute = (name, value) => {
    if (!document.body) return;
    if (value === null) document.body.removeAttribute(name);
    else document.body.setAttribute(name, value);
  };

  const applySettings = () => {
    setAttribute('data-aipg-platform', platform.id);
    setAttribute('data-aipg-enabled', String(isEnabled));
    setAttribute('data-aipg-hover-reveal', String(hoverReveal));
    setAttribute('data-aipg-safe-mode', String(safeMode));
    initialized = true;
    setAttribute('data-aipg-ready', 'true');
  };

  const readStorage = (area, keys) => new Promise((resolve, reject) => {
    try {
      chrome.storage[area].get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || `Unable to read ${area} settings`));
        else resolve(result || {});
      });
    } catch (error) {
      reject(error);
    }
  });

  const routeCategory = (element) => {
    const href = element.getAttribute('href');
    if (!href) return null;
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      if (/^\/c\/[^/]+/.test(url.pathname)) return 'conversation';
      if (/^\/g\/[^/]+\/c\/[^/]+/.test(url.pathname)) return 'project-conversation';
      if (/^\/g\/[^/]+\/?$/.test(url.pathname)) return 'project';
      if (/^\/projects?\/[^/]+/.test(url.pathname)) return 'project';
      if (/^\/folders?\/[^/]+/.test(url.pathname)) return 'folder';
      return null;
    } catch {
      return null;
    }
  };

  const markerCategory = (value = '') => {
    if (/sidebar/i.test(value)) return 'sidebar-marker';
    if (/button/i.test(value)) return 'button-marker';
    if (/recent/i.test(value)) return 'recent-marker';
    if (/pinned/i.test(value)) return 'pinned-marker';
    if (/history|conversation|chat/i.test(value)) return 'history-marker';
    if (/project/i.test(value)) return 'project-marker';
    if (/folder/i.test(value)) return 'folder-marker';
    if (/notebook/i.test(value)) return 'notebook-marker';
    return value ? 'other-marker' : 'none';
  };

  const roleCategory = (value) => {
    if (['navigation', 'menu', 'menubar', 'tree', 'treeitem', 'list', 'listitem'].includes(value)) return value;
    return value ? 'other' : 'none';
  };

  const childShape = (element) => Array.from(element.children)
    .slice(0, 8)
    .map((child) => child.tagName.toLowerCase());



  const hrefShapeCategory = (element) => {
    const href = element.getAttribute('href');
    if (!href) return 'none';
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return 'external';
      const firstSegment = url.pathname.split('/').filter(Boolean)[0] || '';
      return ['app', 'chat', 'conversation', 'project', 'projects', 'folder', 'folders', 'c', 'g']
        .includes(firstSegment.toLowerCase()) ? firstSegment.toLowerCase() : 'other';
    } catch {
      return 'invalid';
    }
  };

  const queryMatches = (selector) => {
    if (!selector) return [];
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return null;
    }
  };

  const geminiTitlePathLeaf = (item) => {
    const link = Array.from(item.children).find((child) => child.tagName === 'A');
    if (!link) return null;
    let current = link;
    for (let depth = 0; depth < 4; depth += 1) {
      current = Array.from(current.children).find((child) => child.tagName === 'SPAN');
      if (!current) return null;
    }
    return current;
  };

  const hasDirectTextNode = (element) => Array.from(element.childNodes)
    .some((node) => node.nodeType === 3);
  const geminiTitleLeaf = (item) => {
    const leaf = geminiTitlePathLeaf(item);
    return leaf && hasDirectTextNode(leaf) ? leaf : null;
  };

  const hasNotebookAncestor = (item, root) => {
    let current = item;
    while (current && current !== root) {
      const marker = markerCategory(current.getAttribute('data-testid') || current.getAttribute('aria-label'));
      if (marker === 'notebook-marker') return true;
      current = current.parentElement;
    }
    return false;
  };

  const refreshGeminiTitleMarkers = () => {
    if (platform.id !== 'Gemini') return;
    const root = document.querySelector(platform.sidebarSelector);
    if (!root) return;
    const desired = new Map();
    const projectClassification = {
      discoveredComponents: 0,
      expectedTitleLeafCount: 0,
      directTextNodeCount: 0,
      notebookAncestorMarkerCount: 0,
      acceptedCount: 0,
      markerAssignedCount: 0,
      computedMaskedCount: 0,
      rejectedReasonCounts: {},
    };
    const rejectProject = (reason) => {
      projectClassification.rejectedReasonCounts[reason] = (projectClassification.rejectedReasonCounts[reason] || 0) + 1;
    };
    const add = (item, marker) => {
      const link = Array.from(item.children).find((child) => child.tagName === 'A');
      const title = geminiTitleLeaf(item);
      if (!link || !title) return;
      const hrefCategory = hrefShapeCategory(link);
      if (!['app', 'chat', 'conversation', 'project', 'projects', 'folder', 'folders', 'c', 'g'].includes(hrefCategory)) return;
      desired.set(title, marker);
    };

    // The verified history group is the large mat-nav-list: unlike ordinary
    // navigation groups, it contains many gem-nav-list-item rows with a
    // per-entry action button. Require that group shape before classifying
    // any row, then mark only the verified direct-text title leaf.
    for (const list of root.querySelectorAll('mat-nav-list')) {
      const candidates = Array.from(list.querySelectorAll('gem-nav-list-item'))
        .filter((item) => !item.closest('project-sidenav-list-item')
          && !hasNotebookAncestor(item, root)
          && geminiTitleLeaf(item)
          && hrefShapeCategory(Array.from(item.children).find((child) => child.tagName === 'A') || item) === 'app');
      const actionCount = candidates.filter((item) => item.querySelector('button')).length;
      if (candidates.length >= 5 && actionCount >= 5) {
        candidates.forEach((item) => add(item, 'data-aipg-gemini-conversation-title'));
      }
    }

    // Projects have a distinct verified component boundary, so mask their
    // own title leaf but not nested conversation rows or action controls.
    const projectComponents = Array.from(root.querySelectorAll('project-sidenav-list-item'));
    projectClassification.discoveredComponents = projectComponents.length;
    for (const project of projectComponents) {
      const item = Array.from(project.children).find((child) => child.tagName === 'GEM-NAV-LIST-ITEM');
      if (!item) {
        rejectProject('expected_component_child_missing');
        continue;
      }
      const leaf = geminiTitlePathLeaf(item);
      if (!leaf) {
        rejectProject('verified_title_path_missing');
        continue;
      }
      projectClassification.expectedTitleLeafCount += 1;
      if (!hasDirectTextNode(leaf)) {
        rejectProject('direct_text_node_missing');
        continue;
      }
      projectClassification.directTextNodeCount += 1;
      if (hasNotebookAncestor(item, root)) projectClassification.notebookAncestorMarkerCount += 1;
      const link = Array.from(item.children).find((child) => child.tagName === 'A');
      if (!link) {
        rejectProject('direct_link_missing');
        continue;
      }
      const hrefCategory = hrefShapeCategory(link);
      // A project component boundary plus the verified title-leaf structure
      // identifies the label. Gemini may use a route segment outside the
      // conversation allowlist, so require only a valid same-origin href here.
      if (['none', 'external', 'invalid'].includes(hrefCategory)) {
        rejectProject('unsupported_href_category');
        continue;
      }
      desired.set(leaf, 'data-aipg-gemini-project-title');
      projectClassification.acceptedCount += 1;
    }

    for (const marker of ['data-aipg-gemini-conversation-title', 'data-aipg-gemini-project-title']) {
      for (const element of root.querySelectorAll(`[${marker}]`)) {
        if (desired.get(element) !== marker) element.removeAttribute(marker);
      }
    }
    desired.forEach((marker, element) => element.setAttribute(marker, 'true'));
    for (const project of projectComponents) {
      const item = Array.from(project.children).find((child) => child.tagName === 'GEM-NAV-LIST-ITEM');
      const leaf = item && geminiTitleLeaf(item);
      if (!leaf || !desired.has(leaf)) continue;
      if (leaf.getAttribute('data-aipg-gemini-project-title') === 'true') projectClassification.markerAssignedCount += 1;
      if (isElementMasked(leaf)) projectClassification.computedMaskedCount += 1;
    }
    geminiProjectClassification = projectClassification;
  };

  let geminiProjectClassification = {
    discoveredComponents: 0,
    expectedTitleLeafCount: 0,
    directTextNodeCount: 0,
    notebookAncestorMarkerCount: 0,
    acceptedCount: 0,
    markerAssignedCount: 0,
    computedMaskedCount: 0,
    rejectedReasonCounts: {},
  };

  let geminiObserver = null;
  let geminiDocumentObserver = null;
  let geminiParentObserver = null;
  let geminiObserverRoot = null;
  let geminiRefreshQueued = false;
  const queueGeminiRefresh = () => {
    if (geminiRefreshQueued) return;
    geminiRefreshQueued = true;
    queueMicrotask(() => {
      geminiRefreshQueued = false;
      refreshGeminiTitleMarkers();
    });
  };
  const observeGeminiSidebar = () => {
    if (platform.id !== 'Gemini' || !document.documentElement) return;
    const root = document.querySelector(platform.sidebarSelector);
    if (!root) {
      if (!geminiDocumentObserver) {
        geminiDocumentObserver = new MutationObserver(() => {
          if (document.querySelector(platform.sidebarSelector)) observeGeminiSidebar();
        });
        geminiDocumentObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      return;
    }
    geminiDocumentObserver?.disconnect();
    geminiDocumentObserver = null;
    if (root !== geminiObserverRoot) {
      geminiObserver?.disconnect();
      geminiObserverRoot = root;
      geminiObserver = new MutationObserver(queueGeminiRefresh);
      geminiObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'data-testid', 'aria-label'] });
      geminiParentObserver?.disconnect();
      if (root.parentElement) {
        geminiParentObserver = new MutationObserver(observeGeminiSidebar);
        geminiParentObserver.observe(root.parentElement, { childList: true });
      }
    }
    refreshGeminiTitleMarkers();
  };

  const chatGPTProjectRowMarker = 'data-aipg-chatgpt-project-row';
  const chatGPTProjectTitleMarker = 'data-aipg-chatgpt-project-title';
  const isProjectAction = (element) => (element.getAttribute('aria-label') || '').startsWith('Project actions for ');
  const isProjectNewChat = (element) => (element.getAttribute('aria-label') || '').startsWith('New chat in ');
  const chatGPTProjectClassification = {
    projectActionControlCount: 0,
    discoveredComponents: 0,
    interactiveRowCount: 0,
    nativeButtonRowCount: 0,
    roleButtonRowCount: 0,
    expectedTitleLeafCount: 0,
    titleLeafCount: 0,
    directTextNodeCount: 0,
    acceptedCount: 0,
    markerAssignedCount: 0,
    computedMaskedCount: 0,
    rejectedReasonCounts: {},
    structureSamples: [],
  };

  const findChatGPTProjectRow = (action, root) => {
    let current = action.parentElement;
    while (current && current !== root) {
      const controls = Array.from(current.querySelectorAll('[aria-label]'));
      const hasActions = controls.some(isProjectAction);
      const hasNewChat = controls.some(isProjectNewChat);
      if (current.matches('button, [role="button"]') && hasActions && hasNewChat) return current;
      current = current.parentElement;
    }
    return null;
  };

  const projectTitleTextNodes = (row) => {
    const result = [];
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent && node.nodeValue.trim()) {
        let current = parent;
        let insideControl = false;
        while (current && current !== row) {
          if (current.matches('button, [role="button"]') || current.hasAttribute(chatGPTProjectTitleMarker)) {
            insideControl = true;
            break;
          }
          if (current.matches('a[href]') && ['conversation', 'project-conversation'].includes(routeCategory(current))) {
            insideControl = true;
            break;
          }
          current = current.parentElement;
        }
        if (!insideControl && !parent.hasAttribute(chatGPTProjectTitleMarker)) result.push(node);
      }
      node = walker.nextNode();
    }
    return result;
  };

  const wrapProjectTitleText = (textNode) => {
    const marker = document.createElement('span');
    marker.setAttribute(chatGPTProjectTitleMarker, 'true');
    textNode.parentNode.replaceChild(marker, textNode);
    marker.appendChild(textNode);
    return marker;
  };

  const clearChatGPTProjectRow = (row) => {
    row.removeAttribute(chatGPTProjectRowMarker);
    for (const marker of Array.from(row.querySelectorAll(`[${chatGPTProjectTitleMarker}]`))) {
      const parent = marker.parentNode;
      if (!parent) continue;
      while (marker.firstChild) parent.insertBefore(marker.firstChild, marker);
      marker.remove();
    }
  };

  const refreshChatGPTProjectMarkers = () => {
    if (platform.id !== 'ChatGPT') return;
    const root = document.querySelector(platform.sidebarSelector);
    if (!root) return;
    const rejectedReasonCounts = {};
    const reject = (reason) => {
      rejectedReasonCounts[reason] = (rejectedReasonCounts[reason] || 0) + 1;
    };
    const actions = Array.from(root.querySelectorAll('[aria-label]')).filter(isProjectAction);
    const candidates = new Set();
    for (const action of actions) {
      const row = findChatGPTProjectRow(action, root);
      if (row) candidates.add(row);
      else reject('project_row_not_found');
    }
    for (const stale of Array.from(root.querySelectorAll(`[${chatGPTProjectRowMarker}]`))) {
      if (!candidates.has(stale)) clearChatGPTProjectRow(stale);
    }

    let expectedTitleLeafCount = 0;
    let directTextNodeCount = 0;
    let acceptedCount = 0;
    let markerAssignedCount = 0;
    let computedMaskedCount = 0;
    let nativeButtonRowCount = 0;
    let roleButtonRowCount = 0;
    let titleLeafCount = 0;
    for (const row of candidates) {
      let titleMarkers = Array.from(row.querySelectorAll(`[${chatGPTProjectTitleMarker}]`));
      if (titleMarkers.length === 0) {
        const textNodes = projectTitleTextNodes(row);
        directTextNodeCount += textNodes.length;
        if (textNodes.length === 0) {
          reject('project_title_text_missing');
          continue;
        }
        titleMarkers = textNodes.map(wrapProjectTitleText);
      } else {
        directTextNodeCount += titleMarkers.length;
      }
      expectedTitleLeafCount += 1;
      titleLeafCount += titleMarkers.length;
      if (row.tagName === 'BUTTON') nativeButtonRowCount += 1;
      if (row.getAttribute('role') === 'button') roleButtonRowCount += 1;
      row.setAttribute(chatGPTProjectRowMarker, 'true');
      acceptedCount += 1;
      if (row.getAttribute(chatGPTProjectRowMarker) === 'true'
        && titleMarkers.every((element) => element.getAttribute(chatGPTProjectTitleMarker) === 'true')) {
        markerAssignedCount += 1;
      }
      if (titleMarkers.length > 0 && titleMarkers.every(isElementMasked)) computedMaskedCount += 1;
    }
    const structureSamples = Array.from(candidates).slice(0, 12).map((row) => ({
      tag: row.tagName.toLowerCase(),
      role: roleCategory(row.getAttribute('role')),
      childElementTags: childShape(row),
      childAnchorCount: row.querySelectorAll('a[href]').length,
      descendantButtonCount: row.querySelectorAll('button').length,
      hasExpandedState: row.hasAttribute('aria-expanded'),
      titleLeafMarkerCount: row.querySelectorAll(`[${chatGPTProjectTitleMarker}]`).length,
      directTextNodeCount: Array.from(row.querySelectorAll(`[${chatGPTProjectTitleMarker}]`))
        .reduce((total, leaf) => total + Array.from(leaf.childNodes).filter((node) => node.nodeType === 3 && node.nodeValue.trim()).length, 0),
    }));
    Object.assign(chatGPTProjectClassification, {
      projectActionControlCount: actions.length,
      discoveredComponents: actions.length,
      interactiveRowCount: candidates.size,
      nativeButtonRowCount,
      roleButtonRowCount,
      expectedTitleLeafCount,
      titleLeafCount,
      directTextNodeCount,
      acceptedCount,
      markerAssignedCount,
      computedMaskedCount,
      rejectedReasonCounts,
      structureSamples,
    });
  };

  let chatGPTObserver = null;
  let chatGPTDocumentObserver = null;
  let chatGPTParentObserver = null;
  let chatGPTObserverRoot = null;
  let chatGPTRefreshQueued = false;
  const queueChatGPTRefresh = () => {
    if (chatGPTRefreshQueued) return;
    chatGPTRefreshQueued = true;
    queueMicrotask(() => {
      chatGPTRefreshQueued = false;
      refreshChatGPTProjectMarkers();
    });
  };
  const observeChatGPTSidebar = () => {
    if (platform.id !== 'ChatGPT' || !document.documentElement) return;
    const root = document.querySelector(platform.sidebarSelector);
    if (!root) {
      if (!chatGPTDocumentObserver) {
        chatGPTDocumentObserver = new MutationObserver(() => {
          if (document.querySelector(platform.sidebarSelector)) observeChatGPTSidebar();
        });
        chatGPTDocumentObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      return;
    }
    chatGPTDocumentObserver?.disconnect();
    chatGPTDocumentObserver = null;
    if (root !== chatGPTObserverRoot) {
      chatGPTObserver?.disconnect();
      chatGPTObserverRoot = root;
      chatGPTObserver = new MutationObserver(queueChatGPTRefresh);
      chatGPTObserver.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'data-testid'],
      });
      chatGPTParentObserver?.disconnect();
      if (root.parentElement) {
        chatGPTParentObserver = new MutationObserver(observeChatGPTSidebar);
        chatGPTParentObserver.observe(root.parentElement, { childList: true });
      }
    }
    refreshChatGPTProjectMarkers();
  };

  const selectSensitiveElements = () => {
    refreshChatGPTProjectMarkers();
    refreshGeminiTitleMarkers();
    const conversations = queryMatches(platform.conversationSelector || platform.titleSelector) || [];
    const projects = queryMatches(platform.projectSelector) || [];
    const sensitive = queryMatches(platform.sensitiveSelector || platform.titleSelector) || [];
    const conversationSet = new Set(conversations);
    const projectSet = new Set(projects);
    const all = Array.from(new Set([...sensitive, ...conversations, ...projects]));
    return { all, conversations: Array.from(conversationSet), projects: Array.from(projectSet) };
  };

  const isElementMasked = (element) => {
    if (element.hasAttribute(chatGPTProjectRowMarker)) {
      const titleLeaves = Array.from(element.querySelectorAll(`[${chatGPTProjectTitleMarker}]`));
      return titleLeaves.length > 0 && titleLeaves.every(isElementMasked);
    }
    const style = window.getComputedStyle(element);
    return safeMode
      ? style.color === 'rgba(0, 0, 0, 0)' && style.backgroundColor === 'rgb(17, 17, 17)'
      : isEnabled && (style.filter || '').includes('blur(');
  };

  const getUnclassifiedCandidateCount = (conversationElements, projectElements) => {
    const classified = new Set([...conversationElements, ...projectElements]);
    if (platform.id === 'Gemini') {
      const componentItems = Array.from(document.querySelectorAll(
        'bard-sidenav[role="navigation"] gem-nav-list-item, bard-sidenav[role="navigation"] project-sidenav-list-item',
      ));
      const notebookItems = Array.from(document.querySelectorAll('bard-sidenav[role="navigation"] [data-testid], bard-sidenav[role="navigation"] [aria-label]'))
        .filter((element) => markerCategory(element.getAttribute('data-testid') || element.getAttribute('aria-label')) === 'notebook-marker'
          && !element.matches('button, [role="button"]'));
      const itemContainers = Array.from(new Set([...componentItems, ...notebookItems]));
      return itemContainers.filter((item) => !Array.from(classified).some((target) => item === target || item.contains(target))).length;
    }
    const rejectedProjectCandidates = platform.id === 'ChatGPT'
      ? Object.values(chatGPTProjectClassification.rejectedReasonCounts).reduce((total, count) => total + count, 0)
      : 0;
    const roots = platform.sidebarSelector ? queryMatches(platform.sidebarSelector) || [] : [];
    let count = 0;
    for (const root of roots) {
      for (const link of root.querySelectorAll('a[href]')) {
        if (classified.has(link) || routeCategory(link)) continue;
        let node = link;
        let candidate = false;
        while (node && node !== root) {
          const marker = markerCategory(node.getAttribute('data-testid'));
          if (['history-marker', 'project-marker', 'folder-marker', 'recent-marker', 'pinned-marker'].includes(marker)) {
            candidate = true;
            break;
          }
          node = node.parentElement;
        }
        if (candidate) count += 1;
      }
    }
    return count + rejectedProjectCandidates;
  };

  const hasSidebarEntries = (root) => root.querySelectorAll(
    'a[href], button, [role="button"], [role="treeitem"], gem-nav-list-item, project-sidenav-list-item',
  ).length > 0;

  const getCoverage = () => {
    const entries = selectSensitiveElements();
    const unmasked = entries.all.filter((element) => !isElementMasked(element));
    const maskedSet = new Set(entries.all.filter(isElementMasked));
    return {
      ...entries,
      maskedCount: maskedSet.size,
      unmaskedCount: unmasked.length,
      maskedConversations: entries.conversations.filter((element) => maskedSet.has(element)).length,
      maskedProjects: entries.projects.filter((element) => maskedSet.has(element)).length,
      unmaskedConversations: entries.conversations.filter((element) => !maskedSet.has(element)).length,
      unmaskedProjects: entries.projects.filter((element) => !maskedSet.has(element)).length,
      unclassifiedCandidates: getUnclassifiedCandidateCount(entries.conversations, entries.projects),
    };
  };



  const getStatus = () => {
    if (!initialized) return { status: 'initializing', message: 'Reading saved privacy settings.' };
    if (storageFailed) {
      return {
        status: 'error',
        message: initializationError || 'Saved settings could not be read. Content remains masked.',
        safeMode,
      };
    }
    if (!isEnabled && !safeMode) {
      return { status: 'disabled', message: 'Privacy protection is disabled.', safeMode: false };
    }

    try {
      const stylesheetLoaded = window.getComputedStyle(document.documentElement)
        .getPropertyValue('--aipg-privacy-stylesheet-loaded').trim() === '1';
      if (!stylesheetLoaded) {
        return { status: 'error', safeMode, message: 'The privacy stylesheet is not active; masking cannot be verified.' };
      }
      const coverage = getCoverage();
      if (coverage.all.length === 0
        && (coverage.unclassifiedCandidates === 0 || platform.id !== 'ChatGPT')) {
        const roots = platform.sidebarSelector
          ? Array.from(document.querySelectorAll(platform.sidebarSelector))
          : [];
        const sidebarExists = roots.length > 0;
        const sidebarIsEmpty = sidebarExists && !roots.some(hasSidebarEntries);
        return {
          status: sidebarIsEmpty ? 'empty' : 'unverified',
          count: 0,
          safeMode,
          message: sidebarIsEmpty
            ? 'The sidebar is present and contains no navigation links.'
            : sidebarExists
              ? 'Sidebar navigation is present, but no sensitive entries matched. Protection cannot be verified; the site selectors may need updating.'
            : 'The expected sidebar container was not found. The site layout may have changed, so protection cannot be verified.',
        };
      }

      if (coverage.unmaskedCount > 0 || coverage.unclassifiedCandidates > 0) {
        const intentionallyRevealed = !safeMode && hoverReveal
          && coverage.all.some((element) => !isElementMasked(element) && element.matches(':hover'));
        const noTargetsMasked = coverage.unmaskedCount > 0 && coverage.maskedCount === 0;
        return {
          status: intentionallyRevealed ? 'revealed' : noTargetsMasked ? 'error' : 'partially-protected',
          count: coverage.all.length,
          verifiedCount: coverage.maskedCount,
          unmaskedCount: coverage.unmaskedCount,
          unclassifiedCandidateCount: coverage.unclassifiedCandidates,
          safeMode,
          message: intentionallyRevealed
            ? 'A matching title is temporarily visible because hover reveal is enabled.'
            : noTargetsMasked
              ? 'Sensitive sidebar entries were found, but the masking styles are not applied.'
              : platform.id === 'Gemini'
                ? `${coverage.maskedConversations} of ${coverage.conversations.length} conversation titles and ${coverage.maskedProjects} of ${coverage.projects.length} notebook/project names are masked; ${coverage.unmaskedCount} identified entries remain visible and ${coverage.unclassifiedCandidates} candidates are unclassified.`
                : platform.id === 'ChatGPT'
                  ? `${coverage.maskedConversations} of ${coverage.conversations.length} conversation titles and ${coverage.maskedProjects} of ${coverage.projects.length} project names are masked; ${coverage.unmaskedCount} identified entries remain visible and ${coverage.unclassifiedCandidates} project candidates are unclassified.`
                : `${coverage.maskedCount} of ${coverage.all.length} identified entries are masked; ${coverage.unmaskedCount} remain unmasked and ${coverage.unclassifiedCandidates} candidates are unclassified.`,
        };
      }

      return {
        status: safeMode ? 'safe-protected' : 'protected',
        count: coverage.maskedCount,
        safeMode,
        message: safeMode
          ? platform.id === 'Gemini'
            ? `${coverage.maskedConversations} of ${coverage.conversations.length} conversation titles and ${coverage.maskedProjects} of ${coverage.projects.length} notebook/project names are opaquely masked. Hover and keyboard-focus reveal are overridden.`
            : platform.id === 'ChatGPT'
              ? `${coverage.maskedConversations} of ${coverage.conversations.length} conversation titles and ${coverage.maskedProjects} of ${coverage.projects.length} project names are opaquely masked. Hover and keyboard-focus reveal are overridden.`
            : `${coverage.maskedCount} identified sidebar entr${coverage.maskedCount === 1 ? 'y' : 'ies'} opaquely masked. Hover and keyboard-focus reveal are overridden.`
          : platform.id === 'Gemini'
            ? `${coverage.maskedConversations} of ${coverage.conversations.length} conversation titles and ${coverage.maskedProjects} of ${coverage.projects.length} notebook/project names are blurred.`
            : platform.id === 'ChatGPT'
              ? `${coverage.maskedConversations} of ${coverage.conversations.length} conversation titles and ${coverage.maskedProjects} of ${coverage.projects.length} project names are blurred.`
            : `${coverage.maskedCount} sensitive sidebar entr${coverage.maskedCount === 1 ? 'y' : 'ies'} blurred.`,
      };
    } catch {
      return { status: 'error', safeMode, message: 'Protection status could not be checked.' };
    }
  };

  const onStorageChanged = (changes, namespace) => {
    if ((namespace !== 'sync' && namespace !== 'local') || !changes) return;
    try {
      let relevant = false;
      if (namespace === 'sync') {
        if (changes[platform.storageKey]) {
          isEnabled = Boolean(changes[platform.storageKey].newValue);
          relevant = true;
        }
        if (changes[hoverStorageKey]) {
          hoverReveal = Boolean(changes[hoverStorageKey].newValue);
          relevant = true;
        }
      }
      if (namespace === 'local' && changes[safeModeStorageKey]) {
        safeMode = Boolean(changes[safeModeStorageKey].newValue);
        relevant = true;
      }
      if (relevant) {
        settingsRevision += 1;
        if (initialized) applySettings();
      }
    } catch {
      storageFailed = true;
      initializationError = 'A saved setting could not be applied.';
    }
  };

  try {
    chrome.storage.onChanged.addListener(onStorageChanged);
  } catch {
    storageFailed = true;
    initializationError = 'Storage change monitoring is unavailable.';
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === 'AIPG_GET_STATUS') {
        sendResponse(getStatus());
        return false;
      }

      if (message?.type === 'AIPG_APPLY_SETTINGS') {
        if (typeof message.isEnabled === 'boolean') isEnabled = message.isEnabled;
        if (typeof message.hoverReveal === 'boolean') hoverReveal = message.hoverReveal;
        if (typeof message.safeMode === 'boolean') safeMode = message.safeMode;
        if (initialized) applySettings();
        sendResponse({ ok: true, status: getStatus() });
      }
      return false;
    });
  } catch (error) {
    storageFailed = true;
    initializationError = error.message || 'Page communication could not be initialized.';
  }

  const initialize = async () => {
    const revisionAtStart = settingsRevision;
    try {
      const [syncSettings, localSettings] = await Promise.all([
        readStorage('sync', [platform.storageKey, hoverStorageKey]),
        readStorage('local', [safeModeStorageKey]),
      ]);
      if (settingsRevision === revisionAtStart) {
        isEnabled = Boolean(syncSettings[platform.storageKey]);
        hoverReveal = Boolean(syncSettings[hoverStorageKey]);
        safeMode = Boolean(localSettings[safeModeStorageKey]);
      }
      storageFailed = false;
      settingsRestored = true;
      initializationError = '';
      applySettings();
    } catch (error) {
      // Fail closed if either setting store is unavailable.
      storageFailed = true;
      settingsRestored = false;
      initializationError = error.message || 'Saved settings could not be read.';
      isEnabled = true;
      safeMode = true;
      hoverReveal = false;
      applySettings();
    }
  };

  // The manifest stylesheet protects the document before body creation and
  // while both setting stores are read.
  if (platform.id === 'ChatGPT') observeChatGPTSidebar();
  if (platform.id === 'Gemini') observeGeminiSidebar();
  if (document.body) initialize();
  else document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
