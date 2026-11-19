import { NETWORK_NODES } from '../data/nodes';
import type { NodeKind, PacketEvent, PacketTone, ProtocolScenario } from '../types/network';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TONE_HEX: Record<PacketTone, string> = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  rose: '#f43f5e',
  slate: '#64748b',
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

export class SequenceView {
  private container: HTMLElement | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
  }

  render(
    scenario: ProtocolScenario,
    stepIndex: number,
    selectedPacketId: string | null,
    onInspectPacket: (packet: PacketEvent) => void
  ): void {
    if (!this.container) return;
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'sequence-stage';

    // Collect visible packets up to stepIndex (or show all subtly if stepIndex === -1)
    const rows: { pkt: PacketEvent; stepIdx: number; isCurrentStep: boolean }[] = [];
    const maxStep = stepIndex < 0 ? scenario.steps.length - 1 : stepIndex;

    for (let s = 0; s <= maxStep && s < scenario.steps.length; s++) {
      for (const pkt of scenario.steps[s].packets) {
        rows.push({
          pkt,
          stepIdx: s,
          isCurrentStep: stepIndex >= 0 && s === stepIndex,
        });
      }
    }

    const participants: NodeKind[] = scenario.nodes;
    const leftPad = 88;
    const rightPad = 48;
    const colGap = Math.max(135, Math.floor((880 - leftPad - rightPad) / Math.max(1, participants.length - 1)));
    const svgWidth = Math.max(760, leftPad + rightPad + (participants.length - 1) * colGap + 80);
    const headerHeight = 74;
    const rowHeight = 52;
    const svgHeight = Math.max(320, headerHeight + rows.length * rowHeight + 44);

    const colX = new Map<NodeKind, number>();
    participants.forEach((id, i) => {
      colX.set(id, leftPad + 40 + i * colGap);
    });

    const svg = el('svg', {
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      width: '100%',
      class: 'sequence-svg',
      role: 'img',
      'aria-label': `Diagrama de sequência do protocolo ${scenario.name}`,
    });

    // Lifelines & headers
    for (const id of participants) {
      const x = colX.get(id) ?? 0;
      const base = NETWORK_NODES[id];
      const custom = scenario.customLabels?.[id];
      const name = custom?.name ?? base.name;
      const subtitle = custom?.subtitle ?? base.subtitle;

      svg.appendChild(
        el('line', {
          x1: x,
          y1: headerHeight - 8,
          x2: x,
          y2: svgHeight - 16,
          class: 'seq-lifeline',
        })
      );

      const boxW = Math.min(138, colGap - 12);
      svg.appendChild(
        el('rect', {
          x: x - boxW / 2,
          y: 12,
          width: boxW,
          height: 46,
          rx: 8,
          class: 'seq-node-box',
        })
      );

      const tName = el('text', { x, y: 31, 'text-anchor': 'middle', class: 'seq-node-name' });
      tName.textContent = name.length > 18 ? `${name.slice(0, 17)}…` : name;
      svg.appendChild(tName);

      const tSub = el('text', { x, y: 47, 'text-anchor': 'middle', class: 'seq-node-sub' });
      tSub.textContent = subtitle.length > 20 ? `${subtitle.slice(0, 19)}…` : subtitle;
      svg.appendChild(tSub);
    }

    // Message rows
    rows.forEach((row, idx) => {
      const y = headerHeight + 28 + idx * rowHeight;
      const { pkt, isCurrentStep } = row;
      const x1 = colX.get(pkt.from) ?? leftPad;
      const x2 = colX.get(pkt.to) ?? leftPad + colGap;
      const color = TONE_HEX[pkt.tone];
      const isSelected = pkt.id === selectedPacketId;

      const g = el('g', {
        class: `seq-row ${isCurrentStep ? 'is-current' : ''} ${isSelected ? 'is-selected' : ''} ${
          stepIndex < 0 ? 'is-preview' : ''
        }`,
      });
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => onInspectPacket(pkt));

      // Row hover backdrop
      g.appendChild(
        el('rect', {
          x: 12,
          y: y - 22,
          width: svgWidth - 24,
          height: 44,
          rx: 6,
          class: 'seq-row-bg',
        })
      );

      // Timestamp
      const timeTxt = el('text', { x: 24, y: y + 4, class: 'seq-time' });
      timeTxt.textContent = pkt.time;
      g.appendChild(timeTxt);

      // Arrow line
      const dir = x2 >= x1 ? 1 : -1;
      const endX = pkt.lost ? x1 + (x2 - x1) * 0.65 : x2 - dir * 8;

      g.appendChild(
        el('line', {
          x1,
          y1: y,
          x2: endX,
          y2: y,
          stroke: color,
          'stroke-width': isCurrentStep ? 2.6 : 1.9,
          'stroke-dasharray': pkt.lost ? '6 4' : 'none',
        })
      );

      if (pkt.lost) {
        const lostTxt = el('text', {
          x: endX + dir * 10,
          y: y + 5,
          fill: '#f43f5e',
          'font-size': 15,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
        lostTxt.textContent = '✕';
        g.appendChild(lostTxt);
      } else {
        // Arrowhead
        const head = el('polygon', {
          points: `${x2},${y} ${x2 - dir * 10},${y - 5} ${x2 - dir * 10},${y + 5}`,
          fill: color,
        });
        g.appendChild(head);
      }

      // Broadcast secondary target markers
      if (pkt.broadcastTargets) {
        for (const tId of pkt.broadcastTargets) {
          const tx = colX.get(tId);
          if (tx !== undefined) {
            g.appendChild(
              el('circle', {
                cx: tx,
                cy: y,
                r: 5,
                fill: color,
                opacity: 0.85,
              })
            );
          }
        }
      }

      // Pill label centered on arrow
      const midX = (x1 + endX) / 2;
      const label = `${pkt.encrypted ? '🔒 ' : ''}${pkt.label}${pkt.sublabel ? ` · ${pkt.sublabel}` : ''}`;
      const pillW = Math.min(280, Math.max(88, label.length * 6.5 + 18));

      g.appendChild(
        el('rect', {
          x: midX - pillW / 2,
          y: y - 20,
          width: pillW,
          height: 18,
          rx: 9,
          fill: 'var(--bg-surface)',
          stroke: color,
          'stroke-width': 1.2,
        })
      );

      const pillTxt = el('text', {
        x: midX,
        y: y - 8,
        'text-anchor': 'middle',
        class: 'seq-label',
        fill: color,
      });
      pillTxt.textContent = label.length > 38 ? `${label.slice(0, 37)}…` : label;
      g.appendChild(pillTxt);

      svg.appendChild(g);
    });

    wrapper.appendChild(svg);

    const tip = document.createElement('div');
    tip.className = 'seq-footer-tip';
    tip.textContent = 'Dica: clique em qualquer seta para abrir o Inspetor de Pacotes em nível de byte.';
    wrapper.appendChild(tip);

    this.container.appendChild(wrapper);
  }
}
