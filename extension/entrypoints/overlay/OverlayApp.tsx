import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as d3 from 'd3';

interface OverlayAppProps {
  isVisible: boolean;
  onClose: () => void;
  profileImage?: string | null;
}

type Screen = 'decision' | 'visualize' | 'add';

interface GraphNode {
  id: string;
  label: string;
  imageUrl?: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Reusable button styles matching landing page
const buttonBase: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '8px',
  fontWeight: 500,
  fontSize: '12px',
  cursor: 'pointer',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  background: 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)',
  color: '#e2e8f0',
  transition: 'all 0.15s ease',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
};

export function OverlayApp({ isVisible, onClose, profileImage: initialProfileImage }: OverlayAppProps) {
  const [currentScreen, setCurrentScreen] = useState<Screen>('decision');
  const [userSelection, setUserSelection] = useState<'yes' | 'no' | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(initialProfileImage || null);
  const [eventTitle, setEventTitle] = useState('Market Decision');
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('trading');
  const [strategyOpen, setStrategyOpen] = useState(false);
  
  // Add screen state - moved to top level to prevent re-render issues
  const [newNodeLabel, setNewNodeLabel] = useState('');
  
  // Hover states
  const [viewNodesHover, setViewNodesHover] = useState(false);
  const [acceptBtnHover, setAcceptBtnHover] = useState(false);
  const [rejectBtnHover, setRejectBtnHover] = useState(false);
  const [strategyHover, setStrategyHover] = useState(false);
  const [closeHover, setCloseHover] = useState(false);
  const [backHover, setBackHover] = useState(false);
  const [addHover, setAddHover] = useState(false);
  const [addBtnHover, setAddBtnHover] = useState(false);

  // Graph data
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [{ id: 'root', label: 'Root' }],
    links: [],
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const vizSvgRef = useRef<SVGSVGElement>(null);
  const vizTooltipRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const strategyRef = useRef<HTMLDivElement>(null);

  // Mini-graph node data
  const miniGraphNodes = [
    { id: 'tw', label: 'TW', fullLabel: 'Trump Win Election', x: 70, y: 55 },
    { id: 'tf', label: 'TF', fullLabel: 'Trump takes Florida', x: 270, y: 55 },
  ];

  // Update profile image when prop changes
  useEffect(() => {
    if (initialProfileImage) {
      setProfileImage(initialProfileImage);
    }
  }, [initialProfileImage]);

  // Extract event info from URL and get page info
  useEffect(() => {
    if (!isVisible) return;
    
    if (window.location.pathname.startsWith('/event/')) {
      const slug = window.location.pathname.split('/event/')[1]?.split('?')[0] || '';
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Market';
      setEventTitle(title);
      
      // Initialize graph with event title and profile image
      setGraphData({
        nodes: [{ id: 'root', label: title, imageUrl: profileImage || undefined }],
        links: [],
      });
    }

    // Try to get user selection from storage
    const getPageInfo = async () => {
      try {
        const stored = await browser.storage.local.get(['lastUserSelection', 'selectionTimestamp']);
        if (stored.lastUserSelection && typeof stored.selectionTimestamp === 'number') {
          const age = Date.now() - stored.selectionTimestamp;
          if (age < 30000 && (stored.lastUserSelection === 'yes' || stored.lastUserSelection === 'no')) {
            setUserSelection(stored.lastUserSelection);
          }
        }
      } catch (e) {
        console.error('Error getting stored selection:', e);
      }
    };
    getPageInfo();
  }, [isVisible, profileImage]);

  // Click outside handler for strategy dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (strategyRef.current && !strategyRef.current.contains(event.target as Node)) {
        setStrategyOpen(false);
      }
    }

    if (strategyOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [strategyOpen]);

  // D3 Mini Graph Effect (for decision screen)
  useEffect(() => {
    if (!svgRef.current || !isVisible || currentScreen !== 'decision') return;

    const width = 340;
    const height = 110;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'background: transparent; overflow: visible;');

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const nodes = miniGraphNodes.map(d => ({ ...d }));
    const links = [{ source: nodes[0], target: nodes[1] }];

    const nodeRadius = 18;
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).distance(200))
      .alphaDecay(0.05);

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1);

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'grab')
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    node.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', '#1e293b')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1);

    node.append('text')
      .text((d: any) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#64748b')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('pointer-events', 'none');

    const tooltip = d3.select(tooltipRef.current);
    node
      .on('mouseenter', (event: MouseEvent, d: any) => {
        tooltip
          .style('opacity', '1')
          .style('left', `${event.offsetX + 15}px`)
          .style('top', `${event.offsetY - 5}px`)
          .text(d.fullLabel);
      })
      .on('mousemove', (event: MouseEvent) => {
        tooltip
          .style('left', `${event.offsetX + 15}px`)
          .style('top', `${event.offsetY - 5}px`);
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', '0');
      });

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [isVisible, currentScreen]);

  // D3 Full Visualization Graph (for visualize screen)
  useEffect(() => {
    if (!vizSvgRef.current || !isVisible || currentScreen !== 'visualize') return;

    const width = 380;
    const height = 420;

    d3.select(vizSvgRef.current).selectAll('*').remove();

    const svg = d3.select(vizSvgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'background: transparent; overflow: visible;');

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const nodes = graphData.nodes.map(d => ({ ...d }));
    const links = graphData.links.map(d => ({ ...d }));

    const nodeRadius = 24;
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(28))
      .force('bounds', () => {
        nodes.forEach((d: any) => {
          d.x = Math.max(nodeRadius, Math.min(width - nodeRadius, d.x));
          d.y = Math.max(nodeRadius, Math.min(height - nodeRadius, d.y));
        });
      });

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1);

    const defs = svg.append('defs');
    defs.append('clipPath')
      .attr('id', 'circleClipOverlay')
      .append('circle')
      .attr('r', 20)
      .attr('cx', 0)
      .attr('cy', 0);

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'grab')
      .call(d3.drag<any, any>()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    node.each(function(d: any) {
      const nodeGroup = d3.select(this);
      
      if (d.imageUrl) {
        nodeGroup.append('image')
          .attr('href', d.imageUrl)
          .attr('width', 40)
          .attr('height', 40)
          .attr('x', -20)
          .attr('y', -20)
          .attr('clip-path', 'url(#circleClipOverlay)')
          .attr('preserveAspectRatio', 'xMidYMid slice');
      } else {
        nodeGroup.append('circle')
          .attr('r', 18)
          .attr('fill', '#1e293b')
          .attr('stroke', '#334155')
          .attr('stroke-width', 1);
        
        nodeGroup.append('text')
          .text(d.label.substring(0, 2).toUpperCase())
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#64748b')
          .attr('font-size', '9px')
          .attr('font-weight', '500')
          .attr('pointer-events', 'none');
      }
    });

    const tooltip = d3.select(vizTooltipRef.current);
    node
      .on('mouseenter', (event: MouseEvent, d: any) => {
        tooltip
          .style('opacity', '1')
          .style('left', `${event.offsetX + 15}px`)
          .style('top', `${event.offsetY - 5}px`)
          .text(d.label);
      })
      .on('mousemove', (event: MouseEvent) => {
        tooltip
          .style('left', `${event.offsetX + 15}px`)
          .style('top', `${event.offsetY - 5}px`);
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', '0');
      });

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [isVisible, currentScreen, graphData]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible, onClose]);

  // Drag functionality - null means centered, otherwise use position
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-draggable="true"]')) {
      setIsDragging(true);
      const rect = overlayRef.current?.getBoundingClientRect();
      if (rect) {
        dragOffset.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Add node function
  const addNode = (label: string) => {
    const newNode: GraphNode = {
      id: `node-${Date.now()}`,
      label,
    };
    setGraphData(prev => ({
      nodes: [...prev.nodes, newNode],
      links: prev.nodes.length > 0 
        ? [...prev.links, { source: prev.nodes[0].id, target: newNode.id }]
        : prev.links,
    }));
  };

  if (!isVisible) return null;

  // Render Decision Screen
  const renderDecisionScreen = () => (
    <div style={{
      position: 'relative',
      zIndex: 3,
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '16px 20px',
      overflowY: 'auto',
    }}>
      {/* Strategy Selection - Custom Dropdown */}
      <div ref={strategyRef}>
        <div style={{
          fontSize: '9px',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px',
          fontWeight: 600,
        }}>Strategy</div>
        <button
          onClick={() => setStrategyOpen(!strategyOpen)}
          onMouseEnter={() => setStrategyHover(true)}
          onMouseLeave={() => setStrategyHover(false)}
          style={{
            width: '100%',
            background: 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)',
            color: '#e2e8f0',
            padding: '10px 14px',
            borderRadius: '8px',
            border: strategyHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            fontWeight: 500,
            boxShadow: strategyHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
            outline: 'none',
            transition: 'all 0.2s ease',
            filter: strategyHover ? 'brightness(1.25)' : 'brightness(1)',
            textTransform: 'capitalize',
          }}
        >
          <span>{selectedStrategy}</span>
          <span style={{ 
            color: '#64748b', 
            fontSize: '10px',
            transform: strategyOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}>▼</span>
        </button>
        
        {/* Custom Dropdown Menu */}
        <AnimatePresence>
          {strategyOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              style={{
                marginTop: '4px',
                background: 'linear-gradient(180deg, #2a3a4a 0%, #1e293b 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              }}
            >
              {['trading', 'hedge'].map((strategy) => (
                <button
                  key={strategy}
                  onClick={() => {
                    setSelectedStrategy(strategy);
                    setStrategyOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    outline: 'none',
                    background: selectedStrategy === strategy ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    border: 'none',
                    borderBottom: strategy === 'trading' ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                    textAlign: 'left',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selectedStrategy === strategy ? 'rgba(255, 255, 255, 0.08)' : 'transparent';
                  }}
                >
                  {strategy}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chain Dependency - Mini Graph */}
      <div>
        <div style={{
          fontSize: '9px',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px',
          fontWeight: 600,
        }}>Chain Dependency</div>
        <div style={{
          background: 'transparent',
          borderRadius: '8px',
          border: '1px solid #334155',
          padding: '16px',
        }}>
          <div style={{ position: 'relative' }}>
            <svg ref={svgRef} style={{ overflow: 'visible' }}></svg>
            <div
              ref={tooltipRef}
              style={{
                position: 'absolute',
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#94a3b8',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 500,
                pointerEvents: 'none',
                opacity: 0,
                transition: 'opacity 0.1s',
                maxWidth: '180px',
                wordWrap: 'break-word',
                zIndex: 10,
              }}
            />
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(51, 65, 85, 0.3)',
          }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Source</div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0' }}>Trump Win Election</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: '8px', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>Target</div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#e2e8f0' }}>Trump takes Florida</div>
            </div>
          </div>
          
          <div style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(51, 65, 85, 0.3)',
            fontSize: '10px',
            color: '#64748b',
            lineHeight: 1.4,
          }}>
            Florida's probability curve acts as a high-confidence lead indicator.
          </div>
        </div>
      </div>

      {/* User Selection Display */}
      {userSelection && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0',
          borderBottom: '1px solid #1e293b',
        }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Your position</span>
          <span style={{ 
            fontSize: '11px', 
            color: userSelection === 'yes' ? '#6ee7b7' : '#fca5a5',
            fontWeight: 500,
          }}>
            {userSelection === 'yes' ? 'Yes' : 'No'}
          </span>
        </div>
      )}

      {/* Recommendation */}
      <div>
        <div style={{
          fontSize: '9px',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px',
          fontWeight: 600,
        }}>Recommendation</div>
        <motion.div 
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            padding: '14px 16px',
            background: '#1e293b',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
          }}
        >
          <span style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: '#f1f5f9',
            letterSpacing: '0.2px',
            display: 'block',
            marginBottom: '10px',
          }}>Accept</span>
          <p style={{ 
            margin: 0, 
            fontSize: '11px', 
            color: '#64748b', 
            lineHeight: 1.5,
          }}>
            Institutional volume in Florida has reached critical mass. Probability drift suggests a 4.2% alpha opportunity.
          </p>
        </motion.div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '8px' }}>
        <button
          onMouseEnter={() => setAcceptBtnHover(true)}
          onMouseLeave={() => setAcceptBtnHover(false)}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '8px',
            fontWeight: 500,
            fontSize: '12px',
            cursor: 'pointer',
            border: accepted === true 
              ? '1px solid rgba(110, 231, 183, 0.3)' 
              : acceptBtnHover 
                ? '1px solid rgba(255, 255, 255, 0.3)' 
                : '1px solid rgba(255, 255, 255, 0.1)',
            background: accepted === true 
              ? 'linear-gradient(180deg, #2d4a3e 0%, #1e3a2f 100%)' 
              : 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)',
            color: accepted === true ? '#6ee7b7' : '#e2e8f0',
            transition: 'all 0.2s ease',
            boxShadow: acceptBtnHover && accepted !== true
              ? '0 8px 32px rgba(70, 100, 140, 0.3)' 
              : '0 2px 8px rgba(0, 0, 0, 0.15)',
            filter: acceptBtnHover && accepted !== true ? 'brightness(1.25)' : 'brightness(1)',
          }}
          onClick={() => setAccepted(accepted === true ? null : true)}
        >
          Accept
        </button>
        <button
          onMouseEnter={() => setRejectBtnHover(true)}
          onMouseLeave={() => setRejectBtnHover(false)}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '8px',
            fontWeight: 500,
            fontSize: '12px',
            cursor: 'pointer',
            border: accepted === false 
              ? '1px solid rgba(252, 165, 165, 0.3)' 
              : rejectBtnHover 
                ? '1px solid rgba(255, 255, 255, 0.3)' 
                : '1px solid rgba(255, 255, 255, 0.1)',
            background: accepted === false 
              ? 'linear-gradient(180deg, #4a2d2d 0%, #3a1e1e 100%)' 
              : 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)',
            color: accepted === false ? '#fca5a5' : '#e2e8f0',
            transition: 'all 0.2s ease',
            boxShadow: rejectBtnHover && accepted !== false
              ? '0 8px 32px rgba(70, 100, 140, 0.3)' 
              : '0 2px 8px rgba(0, 0, 0, 0.15)',
            filter: rejectBtnHover && accepted !== false ? 'brightness(1.25)' : 'brightness(1)',
          }}
          onClick={() => setAccepted(accepted === false ? null : false)}
        >
          Reject
        </button>
      </div>
    </div>
  );

  // Render Visualization Screen
  const renderVisualizationScreen = () => (
    <div style={{
      position: 'relative',
      zIndex: 3,
      flex: 1,
      padding: '16px 20px',
      overflowY: 'auto',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ position: 'relative' }}
      >
        <svg ref={vizSvgRef} style={{ overflow: 'visible' }}></svg>
        <div
          ref={vizTooltipRef}
          style={{
            position: 'absolute',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#94a3b8',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 500,
            pointerEvents: 'none',
            opacity: 0,
            transition: 'opacity 0.1s',
            maxWidth: '180px',
            wordWrap: 'break-word',
            zIndex: 10,
          }}
        />
      </motion.div>
      {graphData.nodes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#475569', fontSize: '13px' }}>
          <p style={{ margin: 0 }}>No nodes yet</p>
        </div>
      )}
    </div>
  );

  // Render Add Nodes Screen - state is now at top level
  const renderAddScreen = () => (
    <div style={{
      position: 'relative',
      zIndex: 3,
      flex: 1,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div>
        <div style={{
          fontSize: '9px',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px',
          fontWeight: 600,
        }}>Add Related Market</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={newNodeLabel}
            onChange={(e) => setNewNodeLabel(e.target.value)}
            placeholder="Enter market name..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(30, 41, 59, 0.5)',
              color: '#e2e8f0',
              fontSize: '12px',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newNodeLabel.trim()) {
                addNode(newNodeLabel.trim());
                setNewNodeLabel('');
              }
            }}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (newNodeLabel.trim()) {
                addNode(newNodeLabel.trim());
                setNewNodeLabel('');
              }
            }}
            onMouseEnter={() => setAddBtnHover(true)}
            onMouseLeave={() => setAddBtnHover(false)}
            style={{
              ...buttonBase,
              padding: '10px 16px',
              border: addBtnHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: addBtnHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
              filter: addBtnHover ? 'brightness(1.25)' : 'brightness(1)',
            }}
          >
            Add
          </button>
        </div>
      </div>
      
      <div>
        <div style={{
          fontSize: '9px',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px',
          fontWeight: 600,
        }}>Current Nodes ({graphData.nodes.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
          {graphData.nodes.map((node) => (
            <div
              key={node.id}
              style={{
                padding: '8px 12px',
                background: 'rgba(30, 41, 59, 0.3)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {node.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(4px)',
              zIndex: 99998,
              pointerEvents: 'auto',
            }}
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: position ? position.y : '50%',
              left: position ? position.x : '50%',
              transform: position === null ? 'translate(-50%, -50%)' : 'none',
              width: '420px',
              height: '600px',
              background: 'linear-gradient(145deg, #0f1520 0%, #0a0e16 50%, #080c12 100%)',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.5), 0 25px 80px -12px rgba(0, 0, 0, 0.8), 0 12px 40px -8px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
              zIndex: 99999,
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              color: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
            }}
            onMouseDown={handleMouseDown}
          >
            {/* Texture overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.025,
              pointerEvents: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              mixBlendMode: 'overlay',
              borderRadius: '20px',
              zIndex: 1,
            }} />
            
            {/* Glossy sheen */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '60%',
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 30%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 2,
              borderRadius: '20px 20px 0 0',
            }} />
            
            {/* Header */}
            <div 
              data-draggable="true"
              style={{
                position: 'relative',
                zIndex: 3,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%)',
                cursor: isDragging ? 'grabbing' : 'grab',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: profileImage ? 'transparent' : 'linear-gradient(135deg, #475569, #334155)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {profileImage ? (
                    <img src={profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                      <path d="M3 3v18h18" />
                      <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                    </svg>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#64748b' }}>Pindex</span>
                  <h1 style={{ 
                    margin: 0, 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    color: '#f1f5f9',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {eventTitle}
                  </h1>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {currentScreen === 'decision' && (
                  <button
                    onClick={() => setCurrentScreen('visualize')}
                    onMouseEnter={() => setViewNodesHover(true)}
                    onMouseLeave={() => setViewNodesHover(false)}
                    style={{
                      ...buttonBase,
                      padding: '6px 12px',
                      fontSize: '11px',
                      border: viewNodesHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: viewNodesHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
                      filter: viewNodesHover ? 'brightness(1.25)' : 'brightness(1)',
                    }}
                  >
                    View Nodes
                  </button>
                )}
                <button 
                  onClick={onClose}
                  onMouseEnter={() => setCloseHover(true)}
                  onMouseLeave={() => setCloseHover(false)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: closeHover ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                    border: '1px solid transparent',
                    color: closeHover ? '#94a3b8' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Navigation (for non-decision screens) */}
            {currentScreen !== 'decision' && (
              <div style={{
                position: 'relative',
                zIndex: 3,
                padding: '12px 20px',
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
              }}>
                <button
                  onClick={() => setCurrentScreen('decision')}
                  onMouseEnter={() => setBackHover(true)}
                  onMouseLeave={() => setBackHover(false)}
                  style={{
                    ...buttonBase,
                    padding: '6px 12px',
                    fontSize: '11px',
                    border: backHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: backHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
                    filter: backHover ? 'brightness(1.25)' : 'brightness(1)',
                  }}
                >
                  Back
                </button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentScreen('add');
                  }}
                  onMouseEnter={() => setAddHover(true)}
                  onMouseLeave={() => setAddHover(false)}
                  style={{
                    ...buttonBase,
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: currentScreen === 'add' ? 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)' : addHover ? 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)' : 'linear-gradient(180deg, #3d4f63 0%, #2a3a4a 100%)',
                    color: '#e2e8f0',
                    border: currentScreen === 'add' || addHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: addHover ? '0 8px 32px rgba(70, 100, 140, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
                    filter: addHover && currentScreen !== 'add' ? 'brightness(1.25)' : 'brightness(1)',
                  }}
                >
                  Add
                </button>
              </div>
            )}

            {/* Content */}
            {currentScreen === 'decision' && renderDecisionScreen()}
            {currentScreen === 'visualize' && renderVisualizationScreen()}
            {currentScreen === 'add' && renderAddScreen()}

            {/* Footer */}
            <div style={{
              position: 'relative',
              zIndex: 3,
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255, 255, 255, 0.04)',
              background: 'rgba(0, 0, 0, 0.2)',
            }}>
              <span style={{ fontSize: '9px', color: '#334155', fontWeight: 500 }}>Drag header to move | ESC to close</span>
              <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: '#475569' }}>pindex</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
