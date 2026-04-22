
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Node extends d3.SimulationNodeDatum {
  id: number;
  group: 'agent' | 'liquidity';
  size: number;
  pulseSpeed: number;
  offset: number;
}

// Fix: Explicitly include source and target in the Link interface to ensure TypeScript recognizes them during initialization
interface Link extends d3.SimulationLinkDatum<Node> {
  source: number | string | Node;
  target: number | string | Node;
  value: number;
}

const NetworkVisualizer: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    svg.selectAll("*").remove();

    // Definitions for filters and gradients
    const defs = svg.append('defs');
    
    // Glow effect
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '2.5')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const nodeCount = 80;
    const nodes: Node[] = d3.range(nodeCount).map(i => ({
      id: i,
      group: i % 4 === 0 ? 'agent' : 'liquidity',
      size: Math.random() * 4 + 2,
      pulseSpeed: 0.02 + Math.random() * 0.05,
      offset: Math.random() * Math.PI * 2
    }));

    const links: Link[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const connections = Math.floor(Math.random() * 2) + 1;
      for (let j = 0; j < connections; j++) {
        const target = Math.floor(Math.random() * nodes.length);
        if (target !== i) {
          links.push({ source: i, target: target, value: Math.random() });
        }
      }
    }

    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(150).strength(0.05))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40))
      .force('x', d3.forceX(width / 2).strength(0.01))
      .force('y', d3.forceY(height / 2).strength(0.01));

    const linkGroup = svg.append('g').attr('class', 'links');
    const nodeGroup = svg.append('g').attr('class', 'nodes');
    const packetGroup = svg.append('g').attr('class', 'packets');

    const link = linkGroup.selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#00f2ff')
      .attr('stroke-opacity', 0.1)
      .attr('stroke-width', 1);

    const node = nodeGroup.selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', d => d.size)
      .attr('fill', d => d.group === 'agent' ? '#ffcc00' : '#00f2ff')
      .style('filter', 'url(#glow)')
      .style('cursor', 'pointer');

    // Data packets: small dots moving along links
    const packets = packetGroup.selectAll('circle')
      .data(links.filter(() => Math.random() > 0.7))
      .enter().append('circle')
      .attr('r', 1.5)
      .attr('fill', '#fff')
      .attr('opacity', 0.6);

    let time = 0;
    simulation.on('tick', () => {
      time += 0.016;

      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y)
        .attr('r', (d: any) => d.size + Math.sin(time * d.pulseSpeed * 50 + d.offset) * 1.5)
        .attr('opacity', (d: any) => 0.4 + Math.sin(time * d.pulseSpeed * 50 + d.offset) * 0.2);

      packets.each(function(d: any) {
        const progress = (time * 0.5 + d.value) % 1;
        const x = d.source.x + (d.target.x - d.source.x) * progress;
        const y = d.source.y + (d.target.y - d.source.y) * progress;
        d3.select(this)
          .attr('cx', x)
          .attr('cy', y)
          .attr('opacity', Math.sin(progress * Math.PI) * 0.6);
      });
    });

    const handleMouseMove = (event: MouseEvent) => {
      const [mx, my] = [event.clientX, event.clientY];
      simulation.force('mouse', d3.forceRadial(10, mx, my).strength(-0.8));
      simulation.alphaTarget(0.1).restart();
    };

    const handleMouseLeave = () => {
      simulation.force('mouse', null);
      simulation.alphaTarget(0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      svg.attr('width', w).attr('height', h);
      simulation.force('center', d3.forceCenter(w / 2, h / 2)).restart();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      simulation.stop();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

export default NetworkVisualizer;
