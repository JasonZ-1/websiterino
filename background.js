// Background service worker (no DOM available here).
// Keep background logic DOM-free. Use popup or content scripts to access `document`.

chrome.runtime.onInstalled.addListener(() => {
	console.log('Websiterino service worker installed');
	// Clean up legacy per-site storage key if present
	try {
		chrome.storage.sync.remove('sites', () => {
			// ignore errors
		});
	} catch (e) {}
});

// Example: listen for messages (popup can send messages here)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || !msg.type) return;

	if (msg.type === 'ping') {
		sendResponse({ pong: true });
		return;
	}

	if (msg.type === 'feature-toggled') {
			// Remove legacy per-site storage to keep storage consistent with global-only mode
			try { chrome.storage.sync.remove('sites', () => {}); } catch (e) {}
		// Popup notifies when user toggles the feature. Inject or disable UI in the active tab.
		(async () => {
			try {
				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
				if (!tab || !tab.id) return;

					if (msg.enabled) {
						// Inject content script into the active tab
						await chrome.scripting.executeScript({
							target: { tabId: tab.id, allFrames: true },
							files: ['contentScript.js']
						});
					} else {
						// Broadcast a disable message to all tabs and run a cleanup script to remove injected UI.
						try {
							const tabs = await chrome.tabs.query({});
							for (const t of tabs) {
								if (!t.id || !t.url) continue;
								// Skip chrome:// and extension pages
								if (!t.url.startsWith('http')) continue;
								try {
									// First, try sending a message to let any content script cleanup itself
									chrome.tabs.sendMessage(t.id, { type: 'disable-ui' });
								} catch (e) {
									// ignore send errors
								}
								// Then, defensively execute a small cleanup function in all frames of the tab to remove DOM nodes
								try {
									await chrome.scripting.executeScript({
										target: { tabId: t.id, allFrames: true },
										func: () => {
											try {
												const ids = ['websiterino-select-btn', 'websiterino-panel', 'websiterino-style'];
												for (const id of ids) {
													const el = document.getElementById(id);
													if (el && el.remove) el.remove();
												}
												try { window.__websiterinoInjected = false; } catch (e) {}
											} catch (e) {}
										}
									});
								} catch (e) {
									// ignore execution errors (e.g., pages we can't script)
								}
							}
						} catch (e) {
							// ignore broadcast errors
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
		chrome.storage.sync.get({ enabled: true }, async (items) => {
			const enabled = !!items.enabled;
			if (enabled) {
				try {
					await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['contentScript.js'] });
				} catch (e) {
					// ignore injection errors (e.g., chrome pages)
				}
			} else {
				// If disabled, send disable message to this tab
				try {
					await chrome.tabs.sendMessage(tabId, { type: 'disable-ui' });
				} catch (e) {
					// ignore send errors
				}
				// Also run a defensive cleanup in all frames of this tab
				try {
					await chrome.scripting.executeScript({
						target: { tabId, allFrames: true },
						func: () => {
							try {
								const ids = ['websiterino-select-btn', 'websiterino-panel', 'websiterino-style'];
								for (const id of ids) {
									const el = document.getElementById(id);
									if (el && el.remove) el.remove();
								}
								try { window.__websiterinoInjected = false; } catch (e) {}
							} catch (e) {}
						}
					});
				} catch (e) {}
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
