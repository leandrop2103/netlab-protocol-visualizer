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

const COS30 = 0.8660254;
const SIN30 = 0.5;

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

/** Projeta coordenadas 3D (x direita-baixo, y esquerda-baixo, z altura) em 2D isométrico */
function isoPt(x: number, y: number, z: number): [number, number] {
  const sx = (x - y) * COS30;
  const sy = (x + y) * SIN30 - z;
  return [Number(sx.toFixed(1)), Number(sy.toFixed(1))];
}

function pts(list: [number, number][]): string {
  return list.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Constrói um bloco 3D isométrico (faces topo, esquerda e direita) em estilo blueprint */
function appendIsoBox(
  parent: SVGGElement,
  dx: number,
  dy: number,
  dz: number,
  w: number,
  d: number,
  h: number
): void {
  const hw = w / 2;
  const hd = d / 2;
  const x0 = dx - hw;
  const x1 = dx + hw;
  const y0 = dy - hd;
  const y1 = dy + hd;
  const z0 = dz;
  const z1 = dz + h;

  const pTop = [isoPt(x0, y0, z1), isoPt(x1, y0, z1), isoPt(x1, y1, z1), isoPt(x0, y1, z1)];
  const pLeft = [isoPt(x0, y1, z1), isoPt(x1, y1, z1), isoPt(x1, y1, z0), isoPt(x0, y1, z0)];
  const pRight = [isoPt(x1, y0, z1), isoPt(x1, y1, z1), isoPt(x1, y1, z0), isoPt(x1, y0, z0)];

  parent.appendChild(el('polygon', { points: pts(pLeft), class: 'iso-face-left' }));
  parent.appendChild(el('polygon', { points: pts(pRight), class: 'iso-face-right' }));
  parent.appendChild(el('polygon', { points: pts(pTop), class: 'iso-face-top' }));
}

function createIsometricDevice(kind: NodeKind): SVGGElement {
  const g = el('g', { class: 'iso-device', transform: 'scale(1.42)' });

  // Sombra elíptica isométrica na base
  g.appendChild(el('ellipse', { cx: 0, cy: 14, rx: 34, ry: 16, class: 'iso-shadow' }));

  switch (kind) {
    case 'client':
    case 'hostB': {
      // Notebook isométrico 3D
      appendIsoBox(g, 0, 2, 0, 32, 24, 3);
      // Teclado (linhas finas sobre a base)
      const k1 = isoPt(-10, -4, 3.2);
      const k2 = isoPt(10, -4, 3.2);
      const k3 = isoPt(-10, 2, 3.2);
      const k4 = isoPt(10, 2, 3.2);
      g.appendChild(el('line', { x1: k1[0], y1: k1[1], x2: k2[0], y2: k2[1], class: 'iso-detail' }));
      g.appendChild(el('line', { x1: k3[0], y1: k3[1], x2: k4[0], y2: k4[1], class: 'iso-detail' }));

      // Tampa / Tela aberta inclinada
      const sBL = isoPt(-16, -10, 3);
      const sBR = isoPt(16, -10, 3);
      const sTR = isoPt(16, -15, 25);
      const sTL = isoPt(-16, -15, 25);
      g.appendChild(el('polygon', { points: pts([sBL, sBR, sTR, sTL]), class: 'iso-screen' }));

      // Linhas de código/UI na tela
      const l1 = isoPt(-10, -13, 18);
      const l2 = isoPt(6, -13, 18);
      const l3 = isoPt(-10, -12, 12);
      const l4 = isoPt(10, -12, 12);
      g.appendChild(el('line', { x1: l1[0], y1: l1[1], x2: l2[0], y2: l2[1], class: 'iso-accent-line' }));
      g.appendChild(el('line', { x1: l3[0], y1: l3[1], x2: l4[0], y2: l4[1], class: 'iso-detail' }));
      break;
    }

    case 'hostC': {
      // Impressora / Host periférico isométrico
      appendIsoBox(g, 0, 0, 0, 30, 22, 14);
      // Bandeja de papel superior
      const p1 = isoPt(-8, -6, 14);
      const p2 = isoPt(8, -6, 14);
      const p3 = isoPt(8, -10, 24);
      const p4 = isoPt(-8, -10, 24);
      g.appendChild(el('polygon', { points: pts([p1, p2, p3, p4]), class: 'iso-screen' }));
      // LED frontal
      const led = isoPt(9, 11, 9);
      g.appendChild(el('circle', { cx: led[0], cy: led[1], r: 2, class: 'iso-led' }));
      break;
    }

    case 'switch': {
      // Switch Camada 2 isométrico largo com portas frontais
      appendIsoBox(g, 0, 0, 0, 42, 24, 9);
      // 5 portas Ethernet na face frontal esquerda
      for (let i = 0; i < 5; i++) {
        const px = -14 + i * 7;
        const p = isoPt(px, 12, 4.5);
        g.appendChild(el('circle', { cx: p[0], cy: p[1], r: 1.7, class: 'iso-led' }));
      }
      // Setas de comutação no topo
      const a1 = isoPt(-10, -3, 9.5);
      const a2 = isoPt(10, -3, 9.5);
      const a3 = isoPt(10, 3, 9.5);
      const a4 = isoPt(-10, 3, 9.5);
      g.appendChild(el('line', { x1: a1[0], y1: a1[1], x2: a2[0], y2: a2[1], class: 'iso-accent-line' }));
      g.appendChild(el('line', { x1: a3[0], y1: a3[1], x2: a4[0], y2: a4[1], class: 'iso-accent-line' }));
      break;
    }

    case 'gateway': {
      // Roteador / Gateway isométrico com 2 antenas verticais
      appendIsoBox(g, 0, 0, 0, 32, 24, 11);
      // Antena traseira esquerda
      const ant1B = isoPt(-11, -9, 11);
      const ant1T = isoPt(-11, -9, 31);
      g.appendChild(el('line', { x1: ant1B[0], y1: ant1B[1], x2: ant1T[0], y2: ant1T[1], class: 'iso-antenna' }));
      g.appendChild(el('circle', { cx: ant1T[0], cy: ant1T[1], r: 2.2, class: 'iso-led' }));
      // Antena traseira direita
      const ant2B = isoPt(11, -9, 11);
      const ant2T = isoPt(11, -9, 31);
      g.appendChild(el('line', { x1: ant2B[0], y1: ant2B[1], x2: ant2T[0], y2: ant2T[1], class: 'iso-antenna' }));
      g.appendChild(el('circle', { cx: ant2T[0], cy: ant2T[1], r: 2.2, class: 'iso-led' }));
      // LEDs frontais
      for (let i = 0; i < 4; i++) {
        const l = isoPt(-9 + i * 6, 12, 5.5);
        g.appendChild(el('circle', { cx: l[0], cy: l[1], r: 1.5, class: 'iso-led' }));
      }
      break;
    }

    case 'internet': {
      // Nuvem blueprint com globo wireframe no centro
      g.appendChild(
        el('path', {
          d: 'M-24 10 H24 C32 10 37 4 36 -3 C35 -10 29 -14 22 -13 C19 -23 8 -29 -3 -26 C-12 -24 -18 -17 -19 -9 C-27 -9 -33 -3 -32 4 C-31 8 -28 10 -24 10 Z',
          class: 'iso-cloud',
        })
      );
      g.appendChild(el('circle', { cx: 0, cy: -6, r: 10, class: 'iso-detail' }));
      g.appendChild(el('ellipse', { cx: 0, cy: -6, rx: 4.5, ry: 10, class: 'iso-detail' }));
      g.appendChild(el('line', { x1: -10, y1: -6, x2: 10, y2: -6, class: 'iso-detail' }));
      break;
    }

    case 'dns': {
      // Servidor DNS isométrico compacto (2 unidades empilhadas)
      appendIsoBox(g, 0, 0, 0, 26, 22, 10);
      appendIsoBox(g, 0, 0, 11, 26, 22, 10);
      for (const z of [5, 16]) {
        const l1 = isoPt(-7, 11, z);
        const l2 = isoPt(6, 11, z);
        g.appendChild(el('line', { x1: l1[0], y1: l1[1], x2: l2[0], y2: l2[1], class: 'iso-detail' }));
        const dot = isoPt(9, 11, z);
        g.appendChild(el('circle', { cx: dot[0], cy: dot[1], r: 1.6, class: 'iso-led' }));
      }
      break;
    }

    case 'server':
    case 'remote': {
      // Rack / Torre de Servidor isométrica 3D
      appendIsoBox(g, 0, 0, 0, 28, 24, 34);
      // 4 baias horizontais na face frontal
      for (const z of [7, 14, 21, 28]) {
        const a = isoPt(-11, 12, z);
        const b = isoPt(7, 12, z);
        g.appendChild(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'iso-detail' }));
        const led = isoPt(10, 12, z);
        g.appendChild(el('circle', { cx: led[0], cy: led[1], r: 1.6, class: 'iso-led' }));
      }
      break;
    }
  }

  return g;
}

interface SegmentPoint {
  x: number;
  y: number;
}

function interpolatePolyline(points: SegmentPoint[], t: number): SegmentPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const clamped = Math.max(0, Math.min(1, t));
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return points[0];
  let target = clamped * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const localT = lengths[i] === 0 ? 1 : target / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * localT,
        y: points[i].y + (points[i + 1].y - points[i].y) * localT,
      };
    }
    target -= lengths[i];
  }
  return points[points.length - 1];
}

export class TopologyView {
  private container: HTMLElement | null = null;
  private packetLayer: SVGGElement | null = null;
  private linkElements = new Map<string, SVGLineElement>();
  private rafId: number | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private linkKey(a: NodeKind, b: NodeKind): string {
    return a < b ? `${a}--${b}` : `${b}--${a}`;
  }

  render(
    scenario: ProtocolScenario,
    stepIndex: number,
    speed: number,
    animate: boolean,
    onInspectPacket: (packet: PacketEvent) => void
  ): void {
    if (!this.container) return;
    this.destroy();
    this.container.innerHTML = '';
    this.linkElements.clear();

    const wrapper = document.createElement('div');
    wrapper.className = 'topology-stage';

    const svg = el('svg', {
      viewBox: '0 0 1000 520',
      class: 'topology-svg',
      role: 'img',
      'aria-label': `Mapa isométrico de rede do protocolo ${scenario.name}`,
    });

    // Defs: grade isométrica blueprint (sem filtros feGaussianBlur pesados para manter 60fps constantes)
    const defs = el('defs');
    const isoGrid = el('pattern', {
      id: 'netlab-iso-grid',
      width: 60,
      height: 34.64,
      patternUnits: 'userSpaceOnUse',
    });
    isoGrid.appendChild(
      el('path', {
        d: 'M0 17.32 L30 0 L60 17.32 L30 34.64 Z',
        fill: 'none',
        stroke: 'var(--iso-grid-line)',
        'stroke-width': 0.9,
      })
    );
    defs.appendChild(isoGrid);
    svg.appendChild(defs);

    // Fundo com grade isométrica
    svg.appendChild(el('rect', { x: 0, y: 0, width: 1000, height: 520, fill: 'url(#netlab-iso-grid)' }));

    // Zona da LAN em perspectiva sutil quando Switch + Gateway estão presentes
    const hasLan = scenario.nodes.includes('switch') && scenario.nodes.includes('gateway');
    if (hasLan) {
      svg.appendChild(
        el('rect', {
          x: 42,
          y: 34,
          width: 532,
          height: 454,
          rx: 18,
          class: 'topo-zone-lan',
        })
      );
      const zoneLabel = el('text', { x: 58, y: 56, class: 'topo-zone-label' });
      zoneLabel.textContent = 'REDE LOCAL (LAN · 192.168.1.0/24 · DOMÍNIO DE BROADCAST)';
      svg.appendChild(zoneLabel);
    }

    // Camada de links
    const linksGroup = el('g', { class: 'topo-links' });
    for (const [aId, bId] of scenario.links) {
      const a = NETWORK_NODES[aId];
      const b = NETWORK_NODES[bId];
      const line = el('line', {
        x1: a.x,
        y1: a.y + 8,
        x2: b.x,
        y2: b.y + 8,
        class: 'topo-link',
      });
      this.linkElements.set(this.linkKey(aId, bId), line);
      linksGroup.appendChild(line);
    }
    svg.appendChild(linksGroup);

    // Nós e links ativos no passo atual
    const activeStep = stepIndex >= 0 && stepIndex < scenario.steps.length ? scenario.steps[stepIndex] : null;
    const activeNodes = new Set<NodeKind>();
    if (activeStep) {
      for (const pkt of activeStep.packets) {
        pkt.path.forEach((n) => activeNodes.add(n));
        pkt.broadcastTargets?.forEach((n) => activeNodes.add(n));
        for (let i = 0; i < pkt.path.length - 1; i++) {
          const line = this.linkElements.get(this.linkKey(pkt.path[i], pkt.path[i + 1]));
          if (line) {
            line.classList.add('is-active');
            line.style.stroke = TONE_HEX[pkt.tone];
          }
        }
        if (pkt.broadcastTargets && pkt.path.length >= 2) {
          const hub = pkt.path[1];
          for (const target of pkt.broadcastTargets) {
            const line = this.linkElements.get(this.linkKey(hub, target));
            if (line) {
              line.classList.add('is-active');
              line.style.stroke = TONE_HEX[pkt.tone];
            }
          }
        }
      }
    }

    // Camada de nós isométricos 3D
    const nodesGroup = el('g', { class: 'topo-nodes' });
    for (const nodeId of scenario.nodes) {
      const base = NETWORK_NODES[nodeId];
      const custom = scenario.customLabels?.[nodeId];
      const name = custom?.name ?? base.name;
      const subtitle = custom?.subtitle ?? base.subtitle;
      const isActive = activeNodes.has(nodeId);

      const g = el('g', {
        transform: `translate(${base.x}, ${base.y})`,
        class: `topo-node ${isActive ? 'is-active' : ''}`,
      });

      const titleEl = el('title');
      titleEl.textContent = `${name}\nIP: ${base.ip}\nMAC: ${base.mac}`;
      g.appendChild(titleEl);

      // Anel de destaque isométrico na base quando o nó está ativo
      if (isActive) {
        g.appendChild(el('ellipse', { cx: 0, cy: 19, rx: 56, ry: 27, class: 'iso-active-ring' }));
      }

      g.appendChild(createIsometricDevice(nodeId));

      // Rótulos limpos abaixo da base 3D ampliada
      const nameText = el('text', { x: 0, y: 56, 'text-anchor': 'middle', class: 'topo-node-name' });
      nameText.textContent = name;
      g.appendChild(nameText);

      const subText = el('text', { x: 0, y: 71, 'text-anchor': 'middle', class: 'topo-node-sub' });
      subText.textContent = subtitle;
      g.appendChild(subText);

      nodesGroup.appendChild(g);
    }
    svg.appendChild(nodesGroup);

    // Callout do passo (posicionado acima do dispositivo 3D ampliado sem sobrepor texto)
    if (activeStep?.callout) {
      const targetNode = NETWORK_NODES[activeStep.callout.node];
      if (targetNode) {
        const toneColor = TONE_HEX[activeStep.callout.tone];
        const textLen = Math.min(350, Math.max(175, activeStep.callout.text.length * 7.1 + 24));
        const cx = Math.max(textLen / 2 + 14, Math.min(1000 - textLen / 2 - 14, targetNode.x));
        const cy = targetNode.y < 145 ? targetNode.y + 92 : targetNode.y - 68;

        const calloutG = el('g', { transform: `translate(${cx}, ${cy})`, class: 'topo-callout' });
        calloutG.appendChild(
          el('rect', {
            x: -textLen / 2,
            y: -14,
            width: textLen,
            height: 26,
            rx: 13,
            fill: 'var(--bg-elevated)',
            stroke: toneColor,
            'stroke-width': 1.4,
          })
        );
        const calloutText = el('text', { x: 0, y: 3, 'text-anchor': 'middle', class: 'topo-callout-text' });
        calloutText.style.fill = toneColor;
        calloutText.textContent = activeStep.callout.text;
        calloutG.appendChild(calloutText);
        svg.appendChild(calloutG);
      }
    }

    // Camada de pacotes animados
    this.packetLayer = el('g', { class: 'topo-packets' });
    svg.appendChild(this.packetLayer);

    wrapper.appendChild(svg);

    // Legenda inferior
    if (scenario.legend.length > 0) {
      const legend = document.createElement('div');
      legend.className = 'topo-legend';
      for (const item of scenario.legend) {
        const chip = document.createElement('span');
        chip.className = 'topo-legend-item';
        const dot = document.createElement('span');
        dot.className = 'topo-legend-dot';
        dot.style.background = TONE_HEX[item.tone];
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(item.label));
        legend.appendChild(chip);
      }
      wrapper.appendChild(legend);
    }

    if (!activeStep) {
      const hint = document.createElement('div');
      hint.className = 'topo-idle-hint';
      hint.innerHTML = `Clique em <strong>Reproduzir</strong> ou <strong>Passo</strong> (ou pressione <kbd>Espaço</kbd>) para iniciar a simulação de <strong>${scenario.name}</strong>.`;
      wrapper.appendChild(hint);
    }

    this.container.appendChild(wrapper);

    if (activeStep && activeStep.packets.length > 0) {
      this.animatePackets(activeStep.packets, speed, animate, onInspectPacket);
    }
  }

  private createPacketMarker(pkt: PacketEvent, onInspect: (p: PacketEvent) => void, secondary = false): SVGGElement {
    const color = TONE_HEX[pkt.tone];
    const g = el('g', { class: `topo-pkt-pill ${secondary ? 'is-secondary' : ''}` });

    // Halo leve sem filtro SVG (mantém 60fps lisos durante toda a trajetória)
    g.appendChild(
      el('circle', {
        cx: 0,
        cy: 0,
        r: secondary ? 11 : 14,
        fill: color,
        opacity: 0.24,
      })
    );
    g.appendChild(
      el('circle', {
        cx: 0,
        cy: 0,
        r: secondary ? 6 : 7.5,
        fill: color,
      })
    );
    g.appendChild(el('circle', { cx: 0, cy: 0, r: 2.8, fill: '#ffffff' }));

    // Etiqueta compacta flutuando acima do orbe (para não cobrir os textos dos nós)
    if (!secondary) {
      const labelText = pkt.encrypted ? `🔒 ${pkt.label}` : pkt.label;
      const width = Math.max(82, Math.min(195, labelText.length * 7 + 20));

      g.appendChild(
        el('rect', {
          x: -width / 2,
          y: -38,
          width,
          height: 23,
          rx: 7,
          fill: color,
          class: 'topo-pkt-rect',
        })
      );

      const txt = el('text', { x: 0, y: -23, 'text-anchor': 'middle', class: 'topo-pkt-text' });
      txt.textContent = labelText;
      g.appendChild(txt);
    }

    g.style.cursor = 'pointer';
    const title = el('title');
    title.textContent = `${pkt.label} (${pkt.sizeBytes} B) — Clique para inspecionar bytes`;
    g.appendChild(title);
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      onInspect(pkt);
    });

    return g;
  }

  private animatePackets(
    packets: PacketEvent[],
    speed: number,
    animate: boolean,
    onInspect: (p: PacketEvent) => void
  ): void {
    const layer = this.packetLayer;
    if (!layer) return;

    interface AnimatedTrack {
      pill: SVGGElement;
      points: SegmentPoint[];
      lost: boolean;
      delayMs: number;
      durationMs: number;
      lostMark?: SVGGElement;
    }

    interface AnimatedRipple {
      el: SVGEllipseElement;
      delayMs: number;
      durationMs: number;
    }

    const tracks: AnimatedTrack[] = [];
    const ripples: AnimatedRipple[] = [];
    const baseDuration = 1450 / Math.max(0.25, speed);

    packets.forEach((pkt, idx) => {
      const mainPoints = pkt.path.map((n) => ({ x: NETWORK_NODES[n].x, y: NETWORK_NODES[n].y + 10 }));
      const marker = this.createPacketMarker(pkt, onInspect, false);
      layer.appendChild(marker);

      let lostMark: SVGGElement | undefined;
      if (pkt.lost) {
        lostMark = el('g', { class: 'topo-lost-mark', opacity: 0 });
        lostMark.appendChild(el('circle', { cx: 0, cy: 0, r: 15, fill: '#f43f5e' }));
        const xTxt = el('text', { x: 0, y: 5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 15, 'font-weight': 700 });
        xTxt.textContent = '✕';
        lostMark.appendChild(xTxt);
        layer.appendChild(lostMark);
      }

      tracks.push({
        pill: marker,
        points: mainPoints,
        lost: Boolean(pkt.lost),
        delayMs: idx * (baseDuration * 0.42),
        durationMs: baseDuration,
        lostMark,
      });

      // Fan-out de Broadcast a partir do Switch com onda expansiva suave
      if (pkt.broadcastTargets && pkt.path.length >= 2) {
        const hub = NETWORK_NODES[pkt.path[1]];
        const ripple = el('ellipse', {
          cx: hub.x,
          cy: hub.y + 14,
          rx: 28,
          ry: 14,
          fill: 'none',
          stroke: TONE_HEX[pkt.tone],
          'stroke-width': 2,
          opacity: 0,
        });
        layer.appendChild(ripple);
        ripples.push({
          el: ripple,
          delayMs: idx * (baseDuration * 0.42) + baseDuration * 0.36,
          durationMs: baseDuration * 0.65,
        });

        for (const targetId of pkt.broadcastTargets) {
          const target = NETWORK_NODES[targetId];
          const copyOrb = this.createPacketMarker(pkt, onInspect, true);
          layer.appendChild(copyOrb);
          tracks.push({
            pill: copyOrb,
            points: [
              { x: hub.x, y: hub.y + 10 },
              { x: target.x, y: target.y + 10 },
            ],
            lost: false,
            delayMs: idx * (baseDuration * 0.42) + baseDuration * 0.38,
            durationMs: baseDuration * 0.62,
          });
        }
      }
    });

    const placeAt = (track: AnimatedTrack, progress: number): void => {
      const effectiveProgress = track.lost ? Math.min(0.62, progress) : progress;
      const pos = interpolatePolyline(track.points, effectiveProgress);
      track.pill.setAttribute('transform', `translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
      if (track.lost && track.lostMark) {
        if (progress >= 0.62) {
          track.pill.setAttribute('opacity', '0.5');
          track.lostMark.setAttribute('opacity', '1');
          track.lostMark.setAttribute('transform', `translate(${pos.x.toFixed(2)}, ${(pos.y - 50).toFixed(2)})`);
        } else {
          track.pill.setAttribute('opacity', '1');
          track.lostMark.setAttribute('opacity', '0');
        }
      }
    };

    if (!animate) {
      for (const tr of tracks) {
        placeAt(tr, tr.lost ? 0.62 : 0.72);
      }
      return;
    }

    // Smooth ease-in-out sine para aceleração e desaceleração naturais
    const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

    const startTime = performance.now();
    const tick = (now: number): void => {
      let allDone = true;
      for (const tr of tracks) {
        const elapsed = now - startTime - tr.delayMs;
        if (elapsed < 0) {
          tr.pill.setAttribute('opacity', '0');
          allDone = false;
          continue;
        }
        const raw = Math.min(1, elapsed / tr.durationMs);
        // Fade-in suave nos primeiros 12% do trajeto
        const fade = Math.min(1, raw / 0.12);
        tr.pill.setAttribute('opacity', fade.toFixed(2));
        const eased = easeInOutSine(raw);
        const finalT = tr.lost ? eased : eased * 0.75;
        placeAt(tr, finalT);
        if (raw < 1) allDone = false;
      }

      for (const rp of ripples) {
        const elapsed = now - startTime - rp.delayMs;
        if (elapsed < 0) {
          rp.el.setAttribute('opacity', '0');
          allDone = false;
          continue;
        }
        const raw = Math.min(1, elapsed / rp.durationMs);
        const rx = 28 + raw * 85;
        const ry = 14 + raw * 42;
        rp.el.setAttribute('rx', rx.toFixed(1));
        rp.el.setAttribute('ry', ry.toFixed(1));
        rp.el.setAttribute('opacity', ((1 - raw) * 0.8).toFixed(2));
        if (raw < 1) allDone = false;
      }

      if (!allDone) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }
}
