// Content script: show a small action button over selected text and open a box when pressed.
;(function(){
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
  document.head.appendChild(styleEl);

  // Create floating button
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.title = 'Open';
  btn.innerText = '⋯';
  document.documentElement.appendChild(btn);

  // Create panel
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.display = 'none';
  panel.innerHTML = `<button class="close" aria-label="Close">✕</button><div class="content"></div>`;
  document.documentElement.appendChild(panel);

  const contentEl = panel.querySelector('.content');
  const closeBtn = panel.querySelector('.close');

  let lastSelection = '';

  function clearUI() {
    btn.classList.remove('visible');
    btn.style.left = '-9999px';
    btn.style.top = '-9999px';
    panel.style.display = 'none';
  }

  function showButtonAtRect(rect) {
    // Position button slightly above/right of selection
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    let left = rect.right + scrollX - 34; // align to right
    let top = rect.top + scrollY - 42; // above selection
    // ensure on screen
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (left + 40 > scrollX + vw) left = scrollX + vw - 46;
    if (left < scrollX + 8) left = scrollX + 8;
    if (top < scrollY + 8) top = rect.bottom + scrollY + 8; // place below if too high

    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
    btn.classList.add('visible');
  }

  function showPanelNear(rect, text) {
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    let left = rect.left + scrollX;
    let top = rect.bottom + scrollY + 10;
    // clamp
    const vw = document.documentElement.clientWidth;
    if (left + 440 > scrollX + vw) left = Math.max(scrollX + 8, scrollX + vw - 440);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    contentEl.textContent = text;
    panel.style.display = 'block';
  }

  function handleSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { clearUI(); lastSelection = ''; return; }
    const text = sel.toString().trim();
    if (!text) { clearUI(); lastSelection = ''; return; }
    lastSelection = text;
    // get bounding rect
    try {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) {
        showButtonAtRect(rect);
      } else {
        // fallback: use first client rect
        const clientRects = range.getClientRects();
        if (clientRects.length) showButtonAtRect(clientRects[0]);
        else clearUI();
      }
    } catch (e) { clearUI(); }
  }

  let mouseUpTimer = null;
  document.addEventListener('selectionchange', () => {
    // small debounce
    if (mouseUpTimer) clearTimeout(mouseUpTimer);
    mouseUpTimer = setTimeout(handleSelection, 150);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (lastSelection) {
      // show panel
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      showPanelNear(rect, lastSelection);
    }
  });

  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
  });

  // click outside closes panel and button
  document.addEventListener('mousedown', (e) => {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.style.display = 'none';
    }
  });

  // messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'disable-ui') {
      // cleanup
      try {
        btn.remove(); panel.remove(); styleEl.remove();
      } catch (e) {}
      window.__websiterinoInjected = false;
    }
  });

})();
