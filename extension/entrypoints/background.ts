export default defineBackground(() => {
  // Handle messages from content scripts and popup
  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === 'openPopup') {
      // Store the user selection in storage so popup can access it
      if (message.userSelection) {
        await browser.storage.local.set({ 
          lastUserSelection: message.userSelection,
          selectionTimestamp: Date.now()
        });
      }
      
      // Try to toggle the overlay on the active tab
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url?.includes('polymarket.com')) {
        try {
          await browser.tabs.sendMessage(tab.id, { action: 'showOverlay' });
        } catch (e) {
          // Fallback to popup if content script not ready
          await browser.action.openPopup();
        }
      } else {
        await browser.action.openPopup();
      }
    }
  });

  // Handle extension icon click - toggle overlay
  browser.action.onClicked.addListener(async (tab) => {
    if (tab?.id && tab.url?.includes('polymarket.com')) {
      try {
        await browser.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
      } catch (e) {
        // Content script not loaded, fall back to popup
        console.log('Content script not ready, opening popup');
        await browser.action.openPopup();
      }
    } else {
      // Not on polymarket, just open popup
      await browser.action.openPopup();
    }
  });
});
