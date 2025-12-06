// Popup script: friendly UI and persistent per-site/global toggle
const toggle = document.getElementById('toggle');
const stateText = document.getElementById('stateText');
const switchLabel = document.getElementById('switchLabel');

function updateUI(enabled, scopeText = '') {
  if (enabled) {
    switchLabel.classList.add('on');
    stateText.textContent = scopeText ? `Enabled ${scopeText}` : 'Enabled';
  } else {
    switchLabel.classList.remove('on');
    stateText.textContent = scopeText ? `Disabled ${scopeText}` : 'Disabled';
  }
}

async function getActiveTabOrigin() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return { tab: null, origin: null };
    try {
      const url = new URL(tab.url);
      return { tab, origin: url.origin };
    } catch (_) {
      return { tab, origin: null };
    }
  } catch (e) {
    return { tab: null, origin: null };
  }
}

(async function loadState() {
  const { tab, origin } = await getActiveTabOrigin();
  chrome.storage.sync.get({ sites: {}, enabled: true }, (items) => {
    try {
      const siteEntry = origin ? items.sites[origin] : null;
      const enabled = siteEntry && typeof siteEntry.enabled !== 'undefined' ? !!siteEntry.enabled : !!items.enabled;
      toggle.checked = enabled;
      const scopeText = origin ? '(for this site)' : '(global)';
      updateUI(enabled, scopeText);
    } catch (e) {
      console.error('Error reading storage', e);
    }
  });
})();

toggle.addEventListener('change', async () => {
  const enabled = toggle.checked;
  const { tab, origin } = await getActiveTabOrigin();
  if (origin) {
    chrome.storage.sync.get({ sites: {} }, (items) => {
      const sites = items.sites || {};
      sites[origin] = { enabled: !!enabled };
      chrome.storage.sync.set({ sites }, () => {
        updateUI(enabled, '(for this site)');
        chrome.runtime.sendMessage({ type: 'feature-toggled', origin, enabled });
      });
    });
  } else {
    try {
      await chrome.storage.sync.set({ enabled });
      updateUI(enabled, '(global)');
      chrome.runtime.sendMessage({ type: 'feature-toggled', enabled });
    } catch (e) {
      chrome.storage.sync.set({ enabled }, () => {
        updateUI(enabled, '(global)');
        chrome.runtime.sendMessage({ type: 'feature-toggled', enabled });
      });
    }
  }
});

switchLabel.addEventListener('click', () => toggle.focus());