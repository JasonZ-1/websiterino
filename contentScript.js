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
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const btnWidth = 34; // matches CSS
    // Center the button horizontally over the selection rect
    let left = rect.left + scrollX + (rect.width - btnWidth) / 2;
    // Place the button above the selection by default
    let top = rect.top + scrollY - 42;
    const vw = document.documentElement.clientWidth;
    // keep button within viewport horizontally
    if (left + btnWidth > scrollX + vw - 8) left = scrollX + vw - btnWidth - 8;
    if (left < scrollX + 8) left = scrollX + 8;
    // if placing above would go off-screen, place below the selection
    if (top < scrollY + 8) top = rect.bottom + scrollY + 8;

    btn.style.left = Math.round(left) + 'px';
    btn.style.top = Math.round(top) + 'px';
    btn.classList.add('visible');
  }

  function showPanelNear(rect, text) {
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    let left = rect.left + scrollX;
    let top = rect.bottom + scrollY + 10;
    const vw = document.documentElement.clientWidth;
    if (left + 440 > scrollX + vw) left = Math.max(scrollX + 8, scrollX + vw - 440);
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
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        const rect = rectFromPoint(lastMouse.x, lastMouse.y);
        if (rect) {
          // show button using rect and set lastSelection to nearby text if possible
          try {
            const text = sel ? sel.toString().trim() : '';
            lastSelection = text || '';
          } catch (e) { lastSelection = ''; }
          showButtonAtRect(rect);
        }
      }
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
      // Try caretRangeFromPoint (WebKit/Blink)
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range) {
          const rects = range.getClientRects();
          if (rects && rects.length) return rects[0];
        }
      }
      // Try caretPositionFromPoint (Firefox)
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
      // Fallback: elementFromPoint and use its bounding box
      const el = document.elementFromPoint(x, y);
      if (el) {
        const r = el.getBoundingClientRect();
        // If element is large, try to narrow it to a small box near the point
        return { left: x - 8, right: x + 8, top: y - 8, bottom: y + 8, width: 16, height: 16 };
      }
    } catch (e) {}
    return null;
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (lastSelection) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      showPanelNear(rect, lastSelection);
    }
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
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    } catch (e) {}
    window.__websiterinoInjected = false;
  }

  // Track panel position while visible so it follows the selection/caret as the page moves.
  let tracking = false;
  let trackRaf = null;
  let lastTrackedRect = null;

  function updatePanelPositionFromSelection() {
    try {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      if ((!rect || (!rect.width && !rect.height)) && range.getClientRects().length) rect = range.getClientRects()[0];
      if (!rect) return false;
      // compute same panel position logic as showPanelNear
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      let left = rect.left + scrollX;
      let top = rect.bottom + scrollY + 10;
      const vw = document.documentElement.clientWidth;
      if (left + 440 > scrollX + vw) left = Math.max(scrollX + 8, scrollX + vw - 440);
      // only update if position changed
      const newPos = { left: Math.round(left), top: Math.round(top) };
      if (!lastTrackedRect || lastTrackedRect.left !== newPos.left || lastTrackedRect.top !== newPos.top) {
        panel.style.left = newPos.left + 'px';
        panel.style.top = newPos.top + 'px';
        lastTrackedRect = newPos;
      }
      return true;
    } catch (e) { return false; }
  }

  function trackLoop() {
    if (!tracking) return;
    updatePanelPositionFromSelection();
    trackRaf = requestAnimationFrame(trackLoop);
  }

  function startTracking() {
    if (tracking) return;
    tracking = true;
    lastTrackedRect = null;
    // Add scroll/resize listeners so the panel updates immediately during scrolls
    try {
      window.addEventListener('scroll', onScroll, { passive: true });
    } catch (e) {}
    try {
      window.addEventListener('resize', onResize);
    } catch (e) {}
    try {
      document.addEventListener('wheel', onWheel, { passive: true });
    } catch (e) {}
    trackLoop();
  }

  function stopTracking() {
    tracking = false;
    if (trackRaf) {
      cancelAnimationFrame(trackRaf);
      trackRaf = null;
    }
    lastTrackedRect = null;
    try { window.removeEventListener('scroll', onScroll, { passive: true }); } catch (e) {}
    try { window.removeEventListener('resize', onResize); } catch (e) {}
    try { document.removeEventListener('wheel', onWheel, { passive: true }); } catch (e) {}
  }

  function onScroll() { try { updatePanelPositionFromSelection(); } catch (e) {} }
  function onResize() { try { updatePanelPositionFromSelection(); } catch (e) {} }
  function onWheel() { try { updatePanelPositionFromSelection(); } catch (e) {} }

  // Listen for disable message from background to cleanup
  function onMessage(msg) {
    if (msg && msg.type === 'disable-ui') cleanup();
  }
  chrome.runtime.onMessage.addListener(onMessage);

  // Immediately check for an existing selection when the script is injected.
  // This ensures that toggling the extension on will show the button over any highlighted text
  // that already exists on the page.
  try {
    setTimeout(handleSelection, 100);
    // Start tracking by default so the panel/button follow movement even if panel is closed.
    // Tracking runs until the content script is cleaned up or extension is disabled.
    startTracking();
  } catch (e) {}

})();
