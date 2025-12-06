// Content script: show a small action button over selected text and open a box when pressed.
(function () {
  if (window.__websiterinoInjected) return;
  window.__websiterinoInjected = true;

  const STYLE_ID = 'websiterino-style';
  const BUTTON_ID = 'websiterino-select-btn';
  const PANEL_ID = 'websiterino-panel';

  // basic styles for the button and panel
  const css = `
    #${BUTTON_ID} {
      position: absolute; z-index:2147483647; display:inline-flex; align-items:center; justify-content:center;
      width:34px;height:34px;border-radius:8px;background:linear-gradient(180deg,#fff,#eef);
      box-shadow:0 6px 18px rgba(2,8,23,0.45); cursor:pointer; color:#033; font-weight:600; border:0;
      transition:transform .12s ease, opacity .12s; opacity:0; pointer-events:none;
    }
    #${BUTTON_ID}.visible{ opacity:1; pointer-events:auto; transform:translateY(-4px); }
    #${PANEL_ID} { position: absolute; z-index:2147483648; min-width:220px; max-width:420px; background:linear-gradient(180deg,#ffffff,#f6fafc); color:#022; border-radius:10px; box-shadow:0 12px 36px rgba(2,8,23,0.5); padding:12px; font-family:Segoe UI, Roboto, sans-serif; }
    #${PANEL_ID} .close { position:absolute; right:8px; top:6px; border:0; background:transparent; font-size:14px; cursor:pointer }
    #${PANEL_ID} .content { white-space:pre-wrap; word-break:break-word; color:#033; }
  `;

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // Create floating button and panel and attach to body when possible
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.title = 'Open';
  btn.innerText = '?';
  (document.body || document.documentElement).appendChild(btn);

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.display = 'none';
  panel.innerHTML = `<button class="close" aria-label="Close">✕</button><div class="content"></div>`;
  (document.body || document.documentElement).appendChild(panel);

  const contentEl = panel.querySelector('.content');
  const closeBtn = panel.querySelector('.close');

  let lastSelection = '';
  let mouseUpTimer = null;
  let lastMouse = { x: 0, y: 0 };

  function clearUI() {
    btn.classList.remove('visible');
    btn.style.left = '-9999px';
    btn.style.top = '-9999px';
    panel.style.display = 'none';
  }

  function showButtonAtRect(rect) {
    const btnWidth = 34; // matches CSS
    // Use client rect + scroll offsets to compute document coordinates for absolute positioning
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    let left = rect.left + scrollX + (rect.width - btnWidth) / 2;
    let top = rect.top + scrollY - 42;
    const docW = Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth);
    // keep button within document bounds horizontally
    if (left + btnWidth > docW - 8) left = docW - btnWidth - 8;
    if (left < 8) left = 8;
    // if placing above would go off-screen (document top), place below the selection
    if (top < 8) top = rect.bottom + scrollY + 8;

    btn.style.left = Math.round(left) + 'px';
    btn.style.top = Math.round(top) + 'px';
    btn.classList.add('visible');
  }

  function showPanelNear(rect, text) {
    // Use client rect + scroll offsets to position absolutely within the document
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    let left = rect.left + scrollX;
    let top = rect.bottom + scrollY + 10;
    const docW = Math.max(document.documentElement.scrollWidth, document.documentElement.clientWidth);
    if (left + 440 > docW) left = Math.max(8, docW - 440);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    contentEl.textContent = text;
    panel.style.display = 'block';
    startTracking();
  }

  function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { clearUI(); lastSelection = ''; return; }
    const text = sel.toString().trim();
    if (!text) { clearUI(); lastSelection = ''; return; }
    lastSelection = text;
    try {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) {
        showButtonAtRect(rect);
      } else {
        const clientRects = range.getClientRects();
        if (clientRects.length) showButtonAtRect(clientRects[0]);
        else clearUI();
      }
    } catch (e) { clearUI(); }
  }

  // Debounced selection change handler
  function onSelectionChange() {
    if (mouseUpTimer) clearTimeout(mouseUpTimer);
    mouseUpTimer = setTimeout(handleSelection, 150);
  }

  document.addEventListener('selectionchange', onSelectionChange);

  // Track last mouse coordinates to fall back to caret-from-point when selection is not reported
  function onMouseUp(e) {
    lastMouse.x = e.clientX;
    lastMouse.y = e.clientY;
    // small delay to allow editor to update selection state
    setTimeout(() => {
      handleSelection();
      // if no visual selection found, try caret-based rect
      // Do NOT show the button when there's no actual highlighted text.
      // handleSelection() already shows the button when a non-empty selection exists.
    }, 50);
  }

  function onKeyUp(e) {
    // handle keyboard selections (shift+arrows)
    setTimeout(handleSelection, 50);
  }

  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keyup', onKeyUp);

  // Try to compute a reasonable rect from a point when selection APIs fail (works as a fallback in complex editors)
  function rectFromPoint(x, y) {
    try {
      // 1) Preferred: use caretPositionFromPoint (standard alternative). If unavailable,
      // fall back to the robust text-node probing logic below.
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos && pos.offsetNode) {
          const range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.setEnd(pos.offsetNode, pos.offset);
          const rects = range.getClientRects();
          if (rects && rects.length) return rects[0];
        }
      }

      // 2) Robust fallback: find a nearby text node under the point and probe small ranges
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      // Search text nodes inside the element using a TreeWalker
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      let node = walker.currentNode;
      // If currentNode is el itself, advance
      node = walker.nextNode();
      while (node) {
        const txt = node.nodeValue;
        if (txt && txt.trim()) {
          const len = txt.length;
          // sample positions across the text node (avoid probing every char)
          const step = Math.max(1, Math.floor(len / 8));
          for (let i = 0; i < len; i += step) {
            try {
              const r = document.createRange();
              const start = i;
              const end = Math.min(len, i + 1);
              r.setStart(node, start);
              r.setEnd(node, end);
              const rects = r.getClientRects();
              if (rects && rects.length) {
                for (const rc of rects) {
                  if (x >= rc.left && x <= rc.right && y >= rc.top && y <= rc.bottom) {
                    return rc;
                  }
                }
              }
            } catch (e) {
              // ignore bad ranges
            }
          }
        }
        node = walker.nextNode();
      }

      // 3) last-resort: return a small rect centered at the point
      return { left: x - 8, right: x + 8, top: y - 8, bottom: y + 8, width: 16, height: 16 };
    } catch (e) {}
    return null;
  }

  // Helper: try to extract a useful text string from a Range
  function extractTextFromRange(range) {
    try {
      let text = '';
      try { text = range.toString().trim(); } catch (e) { text = ''; }
      if (text) return text;
      // Try cloning contents
      try {
        const frag = range.cloneContents();
        const s = frag.textContent && frag.textContent.trim();
        if (s) return s;
      } catch (e) {}
      // Fallback: ancestor container text near range
      try {
        const node = range.startContainer;
        if (node) {
          let anc = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
          if (anc && anc.textContent) {
            const content = anc.textContent.trim();
            if (content) return content.slice(0, 500);
          }
        }
      } catch (e) {}
    } catch (e) {}
    return '';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    // Prefer explicit selection string, then try extracting from the range
    let text = '';
    try { text = (sel.toString() || '').trim(); } catch (e) { text = ''; }
    if (!text) text = extractTextFromRange(range) || lastSelection || '';
    showPanelNear(rect, text);
  });

  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
  });

  // click outside closes panel
  function onMouseDown(e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.style.display = 'none';
    }
  }
  document.addEventListener('mousedown', onMouseDown);

  // Clean up function to remove UI and listeners
  function cleanup() {
    try {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
      try { window.removeEventListener('scroll', onPageScroll, { passive: true }); } catch (e) {}
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch (e) {}
    window.__websiterinoInjected = false;
  }

  // Instead of tracking during scroll, hide the UI when the page scrolls so listeners remain active.
  function onPageScroll() {
    try {
      // Hide the UI on scroll — keep listeners so new selections still work after scrolling.
      clearUI();
    } catch (e) {}
  }

  // Listen for disable message from background to cleanup
  function onMessage(msg) {
    if (msg && msg.type === 'disable-ui') cleanup();
  }
  chrome.runtime.onMessage.addListener(onMessage);

  // Hide the button when the page scrolls
  try { window.addEventListener('scroll', onPageScroll, { passive: true }); } catch (e) {}

  // Immediately check for an existing selection when the script is injected.
  // This ensures that toggling the extension on will show the button over any highlighted text
  // that already exists on the page.
  try {
    setTimeout(handleSelection, 100);
    // No continuous tracking; UI will be hidden on scroll via `onPageScroll`.
  } catch (e) {}

})();
