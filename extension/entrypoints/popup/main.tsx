import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './style.css';

// Check if we're on a Polymarket page and redirect to overlay
async function checkAndRedirectToOverlay() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    if (tab?.id && tab.url?.includes('polymarket.com/event/')) {
      // On a Polymarket event page - trigger the overlay and close popup
      try {
        await browser.tabs.sendMessage(tab.id, { action: 'showOverlay' });
        // Close the popup after triggering overlay
        window.close();
        return true;
      } catch (e) {
        // Content script might not be ready, fall through to popup
        console.log('Overlay not ready, showing popup');
      }
    }
  } catch (e) {
    console.error('Error checking for overlay redirect:', e);
  }
  return false;
}

// Try to redirect to overlay first, then render popup if needed
checkAndRedirectToOverlay().then((redirected) => {
  if (!redirected) {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
});
