import ReactDOM from 'react-dom/client';
import { OverlayApp } from './overlay/OverlayApp';

export default defineContentScript({
  matches: ['*://*.polymarket.com/*'],
  cssInjectionMode: 'ui',
  
  async main(ctx) {
    // Track visibility, root, and profile image
    let isVisible = false;
    let root: ReactDOM.Root | null = null;
    let profileImage: string | null = null;
    
    // Function to extract profile image from Polymarket page
    const getProfileImage = (): string | null => {
      try {
        // Look for common Polymarket profile image selectors
        const selectors = [
          'img[alt*="profile"]',
          'img[alt*="Profile"]',
          'img[src*="profile"]',
          'img[src*="avatar"]',
          'div[class*="avatar"] img',
          'div[class*="profile"] img',
          'div[class*="Profile"] img',
          'div[class*="Avatar"] img',
          'img[style*="border-radius"]',
          'header img',
          'div[class*="EventHeader"] img',
          'div[class*="event-header"] img',
          'div[class*="Event"] img',
          'main img',
          'section img',
        ];

        for (const selector of selectors) {
          const images = document.querySelectorAll(selector);
          for (const img of images) {
            const imgElement = img as HTMLImageElement;
            if (imgElement && imgElement.src) {
              const style = window.getComputedStyle(imgElement);
              const width = parseInt(style.width) || imgElement.width || 0;
              const height = parseInt(style.height) || imgElement.height || 0;
              
              // Check if it's a reasonable size for a profile picture
              if (width >= 30 && width <= 300 && height >= 30 && height <= 300) {
                const borderRadius = style.borderRadius;
                const isCircular = borderRadius && (
                  borderRadius.includes('50%') || 
                  parseInt(borderRadius) >= Math.min(width, height) / 2
                );
                
                if (isCircular || Math.abs(width - height) < width * 0.3) {
                  const src = imgElement.src;
                  if (src && (src.startsWith('http') || src.startsWith('data:')) && !src.includes('placeholder')) {
                    if (imgElement.complete && imgElement.naturalWidth > 0) {
                      return src;
                    }
                    return src;
                  }
                }
              }
            }
          }
        }

        // Fallback: look for any roughly square circular image
        const allImages = document.querySelectorAll('img');
        for (const img of allImages) {
          const imgElement = img as HTMLImageElement;
          if (!imgElement.src) continue;
          
          const style = window.getComputedStyle(imgElement);
          const width = parseInt(style.width) || imgElement.width || 0;
          const height = parseInt(style.height) || imgElement.height || 0;
          
          if (width > 30 && width < 300 && height > 30 && height < 300) {
            const borderRadius = style.borderRadius;
            const isCircular = borderRadius && (
              borderRadius.includes('50%') || 
              parseInt(borderRadius) >= Math.min(width, height) / 2
            );
            
            if (isCircular || Math.abs(width - height) < 30) {
              const src = imgElement.src;
              if (src && (src.startsWith('http') || src.startsWith('data:')) && !src.includes('placeholder')) {
                return src;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error extracting profile image:', error);
      }
      return null;
    };

    // Create the UI container using WXT's shadow DOM helper
    const ui = await createShadowRootUi(ctx, {
      name: 'pindex-overlay',
      position: 'overlay',
      onMount: (container) => {
        // Style the container to be a full-screen overlay container
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.zIndex = '2147483647';
        container.style.pointerEvents = 'none';
        
        // Create wrapper for React
        const wrapper = document.createElement('div');
        wrapper.id = 'pindex-overlay-root';
        wrapper.style.position = 'absolute';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.pointerEvents = 'none';
        container.appendChild(wrapper);
        
        // Create React root
        root = ReactDOM.createRoot(wrapper);
        
        // Initial render (hidden)
        renderApp(false);
        
        return wrapper;
      },
      onRemove: () => {
        root?.unmount();
        root = null;
      },
    });

    // Render function
    const renderApp = (visible: boolean) => {
      // Get fresh profile image when showing
      if (visible) {
        profileImage = getProfileImage();
      }
      
      if (root) {
        root.render(
          <OverlayApp 
            isVisible={visible} 
            onClose={() => {
              isVisible = false;
              renderApp(false);
            }}
            profileImage={profileImage}
          />
        );
      }
    };

    // Mount the UI
    ui.mount();
    
    // Listen for toggle messages from background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'toggleOverlay') {
        isVisible = !isVisible;
        renderApp(isVisible);
        sendResponse({ visible: isVisible });
      } else if (message.action === 'showOverlay') {
        isVisible = true;
        renderApp(true);
        sendResponse({ visible: true });
      } else if (message.action === 'hideOverlay') {
        isVisible = false;
        renderApp(false);
        sendResponse({ visible: false });
      } else if (message.action === 'getOverlayState') {
        sendResponse({ visible: isVisible });
      }
      return true;
    });
  },
});
