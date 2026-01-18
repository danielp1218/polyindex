import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as Select from '@radix-ui/react-select';
import * as d3 from 'd3';

interface DecisionScreenProps {
  eventTitle: string;
  userSelection: 'yes' | 'no' | null;
  profileImage: string | null;
  onViewNodes: () => void;
}

// Reusable button styles matching landing page
const buttonBase = {
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

export default function DecisionScreen({ eventTitle, userSelection, profileImage, onViewNodes }: DecisionScreenProps) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('trading');
  const [viewNodesHover, setViewNodesHover] = useState(false);
  const [acceptBtnHover, setAcceptBtnHover] = useState(false);
  const [rejectBtnHover, setRejectBtnHover] = useState(false);
  const [strategyHover, setStrategyHover] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Mini-graph node data
  const miniGraphNodes = [
    { id: 'tw', label: 'TW', fullLabel: 'Trump Win Election', x: 70, y: 55 },
    { id: 'tf', label: 'TF', fullLabel: 'Trump takes Florida', x: 270, y: 55 },
  ];

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 340;
    const height = 110;

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'background: transparent; overflow: visible;');

    // Create a group for rendering (no zoom/pan)
    const g = svg.append('g');

    // Create copies of data for D3 (no simulation needed - fixed positions)
    const nodes = miniGraphNodes.map(d => ({ ...d }));
    const links = [{ source: nodes[0], target: nodes[1] }];

    const nodeRadius = 18;

    // Draw link
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1);

    // Draw nodes (stationary - no drag)
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'default');

    // Add circles to nodes
    node.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', '#1e293b')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1);

    // Add text labels
    node.append('text')
      .text((d: any) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#64748b')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('pointer-events', 'none');

    // Add hover tooltip events
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

    // Set fixed positions (no simulation needed)
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y);

    node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
  }, []);

  return (
    <div style={{
      width: '420px',
      minWidth: '420px',
      maxWidth: '420px',
      height: '600px',
      maxHeight: '600px',
      background: '#0a0f1a',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'transparent',
        position: 'relative',
        zIndex: 10,
        gap: '12px',
        minWidth: 0, // Allow flex items to shrink
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px',
          flex: 1,
          minWidth: 0, // Allow title to shrink
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            background: profileImage ? 'transparent' : 'linear-gradient(135deg, #475569, #334155)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            flexShrink: 0, // Prevent icon from shrinking
            overflow: 'hidden',
          }}>
            {profileImage ? (
              <img 
                src={profileImage} 
                alt="Event profile" 
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%',
                }}
                onError={(e) => {
                  // Fallback to flag if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.textContent = '🇺🇸';
                    parent.style.background = 'linear-gradient(135deg, #475569, #334155)';
                  }
                }}
              />
            ) : (
              '🇺🇸'
            )}
          </div>
          <h1 style={{ 
            margin: 0, 
            fontSize: '15px', 
            fontWeight: 600, 
            color: '#f1f5f9',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0, // Allow text to truncate
          }}>
            {eventTitle}
          </h1>
        </div>
        <button
          onClick={onViewNodes}
          onMouseEnter={() => setViewNodesHover(true)}
          onMouseLeave={() => setViewNodesHover(false)}
          style={{
            ...buttonBase,
            padding: '6px 12px',
            fontSize: '11px',
            flexShrink: 0,
            border: viewNodesHover ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: viewNodesHover 
              ? '0 8px 32px rgba(70, 100, 140, 0.3)' 
              : '0 2px 8px rgba(0, 0, 0, 0.15)',
            filter: viewNodesHover ? 'brightness(1.25)' : 'brightness(1)',
          }}
        >
          View Nodes
        </button>
      </div>

      {/* Main Content - Vertical Stack */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '0 20px 16px 20px',
        position: 'relative',
        zIndex: 10,
      }}>
        {/* Strategy Selection - Radix UI Select */}
        <div>
          <div style={{
            fontSize: '9px',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
            fontWeight: 600,
          }}>Strategy</div>
          <Select.Root value={selectedStrategy} onValueChange={setSelectedStrategy}>
            <Select.Trigger
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
                boxShadow: strategyHover 
                  ? '0 8px 32px rgba(70, 100, 140, 0.3)' 
                  : '0 2px 8px rgba(0, 0, 0, 0.15)',
                outline: 'none',
                transition: 'all 0.2s ease',
                filter: strategyHover ? 'brightness(1.25)' : 'brightness(1)',
              }}
            >
              <Select.Value />
              <Select.Icon style={{ color: '#64748b', fontSize: '10px' }}>
                <span>▼</span>
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                align="end"
                style={{
                  background: 'linear-gradient(180deg, #2a3a4a 0%, #1e293b 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                  minWidth: '180px',
                  zIndex: 100,
                }}
              >
                <Select.Viewport>
                  <Select.Item
                    value="trading"
                    style={{
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      outline: 'none',
                      background: selectedStrategy === 'trading' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.filter = 'brightness(1.25)';
                      e.currentTarget.style.boxShadow = 'inset 0 0 20px rgba(70, 100, 140, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = selectedStrategy === 'trading' ? 'rgba(255, 255, 255, 0.05)' : 'transparent';
                      e.currentTarget.style.filter = 'brightness(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <Select.ItemText>Trading</Select.ItemText>
                  </Select.Item>
                  <Select.Item
                    value="hedge"
                    style={{
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      outline: 'none',
                      background: selectedStrategy === 'hedge' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.filter = 'brightness(1.25)';
                      e.currentTarget.style.boxShadow = 'inset 0 0 20px rgba(70, 100, 140, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = selectedStrategy === 'hedge' ? 'rgba(255, 255, 255, 0.05)' : 'transparent';
                      e.currentTarget.style.filter = 'brightness(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <Select.ItemText>Hedge</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        {/* Chain Dependency - Mini Graph (matching VisualizationScreen style) */}
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
            {/* Mini graph visualization - D3 controlled with pan/zoom/drag */}
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
            
            {/* Labels below graph */}
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
            
            {/* Explanation */}
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

        {/* System Decision with Reasoning */}
        <div style={{ marginTop: '16px' }}>
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
        <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '16px' }}>
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
            onClick={() => setAccepted(true)}
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
            onClick={() => setAccepted(false)}
          >
            Reject
          </button>
        </div>
      </div>


    </div>
  );
}
