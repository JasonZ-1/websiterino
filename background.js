// Background service worker (no DOM available here).
// Keep background logic DOM-free. Use popup or content scripts to access `document`.

chrome.runtime.onInstalled.addListener(() => {
	console.log('Websiterino service worker installed');
});

// Example: listen for messages (popup can send messages here)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || !msg.type) return;

	if (msg.type === 'ping') {
		sendResponse({ pong: true });
		return;
	}

	if (msg.type === 'feature-toggled') {
		// Popup notifies when user toggles the feature. Inject or disable UI in the active tab.
		(async () => {
			try {
				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
				if (!tab || !tab.id) return;

				if (msg.enabled) {
					// Inject content script into the active tab
					await chrome.scripting.executeScript({
						target: { tabId: tab.id },
						files: ['contentScript.js']
					});
				} else {
					// Ask the content script to remove its UI if present
					try {
						chrome.tabs.sendMessage(tab.id, { type: 'disable-ui' });
					} catch (e) {
						// ignore
					}
				}
			} catch (err) {
				console.error('feature-toggled handler error', err);
			}
		})();
	}
});

// When a tab becomes active or finishes loading, auto-inject the content script if site is enabled.
async function maybeInjectForTab(tabId, changeInfo, tab) {
	try {
		// Get the tab URL
		const url = (tab && tab.url) || (changeInfo && changeInfo.url) || null;
		if (!url) return;
		let origin;
		try { origin = new URL(url).origin; } catch { return; }

		chrome.storage.sync.get({ sites: {}, enabled: true }, async (items) => {
			const siteEntry = items.sites && items.sites[origin];
			const enabled = siteEntry && typeof siteEntry.enabled !== 'undefined' ? !!siteEntry.enabled : !!items.enabled;
			if (enabled) {
				try {
					await chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] });
				} catch (e) {
					// ignore injection errors (e.g., chrome pages)
				}
			} else {
				// If disabled, send disable message
				try { chrome.tabs.sendMessage(tabId, { type: 'disable-ui' }); } catch (e) {}
			}
		});
	} catch (e) {
		console.error('maybeInjectForTab error', e);
	}
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
	try {
		const tab = await chrome.tabs.get(activeInfo.tabId);
		maybeInjectForTab(activeInfo.tabId, {}, tab);
	} catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete' || changeInfo.url) maybeInjectForTab(tabId, changeInfo, tab);
});
