// Popup script: friendly UI with a single global toggle
const toggle = document.getElementById('toggle');
const stateText = document.getElementById('stateText');
const switchLabel = document.getElementById('switchLabel');

function updateUI(enabled) {
  if (enabled) {
    switchLabel.classList.add('on');
    stateText.textContent = 'Enabled';
  } else {
    switchLabel.classList.remove('on');
    stateText.textContent = 'Disabled';
  }
}

(function loadState() {
  chrome.storage.sync.get({ enabled: true }, (items) => {
    try {
      const enabled = !!items.enabled;
      toggle.checked = enabled;
      updateUI(enabled);
    } catch (e) {
      console.error('Error reading storage', e);
    }
  });
})();

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.storage.sync.set({ enabled }, () => {
    updateUI(enabled);
    chrome.runtime.sendMessage({ type: 'feature-toggled', enabled });
  });
});

switchLabel.addEventListener('click', () => toggle.focus());