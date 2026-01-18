import { useState, useEffect } from 'react';
import './App.css';
import { GraphData } from '@/types/graph';
import { getCurrentPageState, saveCurrentPageState } from '@/utils/eventStorage';
import DecisionScreen from './DecisionScreen.tsx';
import AddNodesScreen from './AddNodesScreen.tsx';
import VisualizationScreen from './VisualizationScreen.tsx';

type Screen = 'decision' | 'add' | 'visualize';

function App() {
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<Screen>('decision');
  const [userSelection, setUserSelection] = useState<'yes' | 'no' | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [marketImageUrl, setMarketImageUrl] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [{ id: 'root', label: 'Root' }],
    links: [],
  });
  const [backHover, setBackHover] = useState(false);
  const [graphHover, setGraphHover] = useState(false);
  const [addHover, setAddHover] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      // Get user selection from storage
      try {
        const stored = await browser.storage.local.get(['lastUserSelection', 'selectionTimestamp']);
        if (stored.lastUserSelection && typeof stored.selectionTimestamp === 'number') {
          // Only use if selection was made in the last 5 seconds (to avoid stale data)
          const age = Date.now() - stored.selectionTimestamp;
          if (age < 5000 && (stored.lastUserSelection === 'yes' || stored.lastUserSelection === 'no')) {
            setUserSelection(stored.lastUserSelection);
          }
        }
      } catch (error) {
        console.error('Error loading user selection:', error);
      }

      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id && tab.url) {
        console.log('Tab URL:', tab.url);
        const isEventPage = tab.url.includes('polymarket.com/event/');
        console.log('Is event page:', isEventPage);
        if (isEventPage) {
          setPageUrl(tab.url);

          // Extract event title from URL for root node
          const slug = tab.url.split('/event/')[1]?.split('?')[0] || '';
          const eventTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Market';

          let currentMarketImageUrl: string | null = null;

          // Also try to get selection and images from content script
          try {
            const response = await browser.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
            if (response?.userSelection) {
              setUserSelection(response.userSelection);
            }
            if (response?.profileImage) {
              setProfileImage(response.profileImage);
            }
            if (response?.marketImageUrl) {
              currentMarketImageUrl = response.marketImageUrl;
              setMarketImageUrl(response.marketImageUrl);
            } else if (response?.profileImage) {
              // Use profileImage as marketImageUrl if marketImageUrl not provided
              currentMarketImageUrl = response.profileImage;
              setMarketImageUrl(response.profileImage);
            }
          } catch (error) {
            console.error('Error getting page info:', error);
          }

          // Try to load saved state, or create initial state with market info
          try {
            const savedState = await getCurrentPageState(tab.url);
            if (savedState && savedState.graphData) {
              setGraphData(savedState.graphData);
            } else {
              // No saved state - create initial graph with market title and image
              setGraphData({
                nodes: [{ id: 'root', label: eventTitle, imageUrl: currentMarketImageUrl || undefined }],
                links: [],
              });
            }
          } catch (error) {
            console.error('Error loading saved state:', error);
            // On error, still set up with market info
            setGraphData({
              nodes: [{ id: 'root', label: eventTitle, imageUrl: currentMarketImageUrl || undefined }],
              links: [],
            });
          }
        } else {
          setPageUrl(null);
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    };

    initialize();
  }, []);

  const saveGraphData = async (newGraphData: GraphData) => {
    setGraphData(newGraphData);
    if (pageUrl) {
      await saveCurrentPageState(pageUrl, { graphData: newGraphData });
    }
  };

  // Extract event title from URL
  const getEventTitle = () => {
    if (!pageUrl) return 'Market Decision';
    const slug = pageUrl.split('/event/')[1]?.split('?')[0] || '';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Market Decision';
  };

  if (loading) {
    return (
      <div style={{ minWidth: '420px', minHeight: '600px', background: '#0a0f1a', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading...
      </div>
    );
  }

  if (!pageUrl) {
    return (
      <div style={{ 
        padding: '32px 24px', 
        minWidth: '320px', 
        minHeight: '200px', 
        background: 'linear-gradient(145deg, #0f1520 0%, #0a0e16 50%, #080c12 100%)', 
        color: '#e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '16px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '8px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
          </svg>
        </div>
        <h2 style={{ 
          fontSize: '16px', 
          fontWeight: 600, 
          margin: 0,
          color: '#f1f5f9',
        }}>PolyIndex</h2>
        <p style={{ 
          fontSize: '13px', 
          color: '#64748b', 
          margin: 0,
          lineHeight: 1.5,
        }}>Navigate to a Polymarket event to get started</p>
        <a 
          href="https://polymarket.com" 
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: '8px',
            padding: '10px 20px',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.5) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '12px',
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          Open Polymarket
        </a>
      </div>
    );
  }

  // Decision Screen (main)
  if (currentScreen === 'decision') {
    return (
      <DecisionScreen
        eventTitle={getEventTitle()}
        userSelection={userSelection}
        profileImage={profileImage}
        onViewNodes={() => setCurrentScreen('visualize')}
      />
    );
  }

  // Nodes screens
  return (
    <div style={{ padding: '16px 20px', width: '420px', minWidth: '420px', maxWidth: '420px', height: '600px', maxHeight: '600px', background: '#0a0f1a', color: '#e2e8f0', boxSizing: 'border-box', overflow: 'hidden' }}>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={() => setCurrentScreen('decision')}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            background: 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)',
            color: '#e2e8f0',
            border: backHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            boxShadow: backHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
            filter: backHover ? 'brightness(1.25)' : 'brightness(1)',
          }}
        >
          Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setCurrentScreen('visualize')}
          onMouseEnter={() => setGraphHover(true)}
          onMouseLeave={() => setGraphHover(false)}
          style={{
            background: currentScreen === 'visualize' 
              ? 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)' 
              : graphHover 
                ? 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)'
                : 'transparent',
            color: currentScreen === 'visualize' || graphHover ? '#e2e8f0' : '#64748b',
            border: currentScreen === 'visualize' || graphHover 
              ? '1px solid rgba(255, 255, 255, 0.3)' 
              : '1px solid transparent',
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            boxShadow: graphHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : currentScreen === 'visualize' ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none',
            filter: graphHover && currentScreen !== 'visualize' ? 'brightness(1.25)' : 'brightness(1)',
          }}
        >
          Graph
        </button>
        <button
          onClick={() => setCurrentScreen('add')}
          onMouseEnter={() => setAddHover(true)}
          onMouseLeave={() => setAddHover(false)}
          style={{
            background: 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)',
            color: '#e2e8f0',
            border: addHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            transition: 'all 0.2s ease',
            boxShadow: addHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
            filter: addHover ? 'brightness(1.25)' : 'brightness(1)',
          }}
        >
          Add
        </button>
      </div>
      
      {currentScreen === 'visualize' ? (
        <VisualizationScreen graphData={graphData} />
      ) : (
        <AddNodesScreen graphData={graphData} onGraphUpdate={saveGraphData} marketImageUrl={marketImageUrl} />
      )}
    </div>
  );
}

export default App;
