import { buildDecodedFrame } from '../engine/frameBuilder';
import type { DecodedField, DecodedFrame, PacketEvent, PacketTone } from '../types/network';

const TONE_HEX: Record<PacketTone, string> = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  rose: '#f43f5e',
  slate: '#64748b',
};

export interface PacketInspectorCallbacks {
  onClose: () => void;
  onNavigate: (delta: -1 | 1) => void;
}

export class PacketInspector {
  private overlay: HTMLElement | null = null;
  private activeLayerId: string | null = null;

  mount(overlay: HTMLElement): void {
    this.overlay = overlay;
  }

  hide(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('is-open');
    this.overlay.setAttribute('aria-hidden', 'true');
  }

  show(
    packet: PacketEvent,
    packetIndex: number,
    totalPackets: number,
    callbacks: PacketInspectorCallbacks
  ): void {
    if (!this.overlay) return;
    this.activeLayerId = null;

    const decoded: DecodedFrame = buildDecodedFrame(packet.frame);
    const totalBytes = decoded.bytes.length;

    // Map each byte offset to its owning layer tone and field index
    const byteLayerTone: PacketTone[] = new Array(totalBytes).fill('slate');
    for (const layer of decoded.layers) {
      for (let i = layer.from; i < layer.to && i < totalBytes; i++) {
        byteLayerTone[i] = layer.tone;
      }
    }

    const byteFieldIdx: number[] = new Array(totalBytes).fill(-1);
    decoded.fields.forEach((field, idx) => {
      for (let i = field.from; i < field.to && i < totalBytes; i++) {
        byteFieldIdx[i] = idx;
      }
    });

    this.overlay.innerHTML = '';
    this.overlay.classList.add('is-open');
    this.overlay.setAttribute('aria-hidden', 'false');

    const panel = document.createElement('div');
    panel.className = 'inspector-panel';

    // Top Header
    const header = document.createElement('div');
    header.className = 'inspector-header';

    const titleArea = document.createElement('div');
    titleArea.className = 'inspector-title-area';

    const badge = document.createElement('span');
    badge.className = 'inspector-proto-badge';
    badge.style.background = TONE_HEX[packet.tone];
    badge.textContent = packet.protoLabel;

    const heading = document.createElement('div');
    heading.className = 'inspector-heading';
    heading.innerHTML = `
      <strong>#${packetIndex + 1} · ${this.escapeHtml(packet.label)}</strong>
      <span class="inspector-meta">${this.escapeHtml(packet.srcAddr)} → ${this.escapeHtml(packet.dstAddr)} · ${totalBytes} bytes no quadro · ${this.escapeHtml(packet.time)}</span>
    `;

    titleArea.appendChild(badge);
    titleArea.appendChild(heading);

    const actions = document.createElement('div');
    actions.className = 'inspector-actions';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn-icon';
    prevBtn.textContent = '← Anterior';
    prevBtn.disabled = packetIndex <= 0;
    prevBtn.addEventListener('click', () => callbacks.onNavigate(-1));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-icon';
    nextBtn.textContent = 'Próximo →';
    nextBtn.disabled = packetIndex >= totalPackets - 1;
    nextBtn.addEventListener('click', () => callbacks.onNavigate(1));

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-icon btn-close';
    closeBtn.textContent = '✕ Fechar';
    closeBtn.addEventListener('click', () => callbacks.onClose());

    actions.append(prevBtn, nextBtn, closeBtn);
    header.append(titleArea, actions);
    panel.appendChild(header);

    // Proportional Layer Bar
    const layerBar = document.createElement('div');
    layerBar.className = 'inspector-layer-bar';
    for (const layer of decoded.layers) {
      const byteCount = Math.max(1, layer.to - layer.from);
      const pct = Math.max(10, (byteCount / Math.max(1, totalBytes)) * 100);
      const seg = document.createElement('button');
      seg.type = 'button';
      seg.className = 'inspector-layer-seg';
      seg.style.flex = `${pct} 1 0`;
      seg.style.borderBottomColor = TONE_HEX[layer.tone];
      seg.innerHTML = `
        <span class="seg-dot" style="background:${TONE_HEX[layer.tone]}"></span>
        <span class="seg-name">${this.escapeHtml(layer.shortName)}</span>
        <span class="seg-bytes">${byteCount} B</span>
      `;
      seg.addEventListener('click', () => {
        this.activeLayerId = this.activeLayerId === layer.id ? null : layer.id;
        this.highlightRange(panel, this.activeLayerId ? layer.from : -1, this.activeLayerId ? layer.to : -1, -1);
      });
      layerBar.appendChild(seg);
    }
    panel.appendChild(layerBar);

    // Split Body: Decoded Tree (left) + Hex/ASCII Dump (right)
    const body = document.createElement('div');
    body.className = 'inspector-body';

    // Left: Decoded Headers
    const treePane = document.createElement('div');
    treePane.className = 'inspector-tree';

    for (const layer of decoded.layers) {
      const details = document.createElement('details');
      details.className = 'inspector-layer-group';
      details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'inspector-layer-summary';
      summary.innerHTML = `
        <span class="layer-pill" style="background:${TONE_HEX[layer.tone]}">${this.escapeHtml(layer.shortName)}</span>
        <span class="layer-title">${this.escapeHtml(layer.name)}</span>
        <span class="layer-sub">${this.escapeHtml(layer.summary)}</span>
      `;
      details.appendChild(summary);

      const list = document.createElement('div');
      list.className = 'inspector-field-list';

      decoded.fields.forEach((field: DecodedField, fieldIdx: number) => {
        if (field.layerId !== layer.id) return;
        const row = document.createElement('div');
        row.className = `inspector-field-row ${field.encrypted ? 'is-encrypted' : ''}`;
        row.dataset.fieldIdx = String(fieldIdx);

        row.innerHTML = `
          <div class="field-top">
            <span class="field-name">${this.escapeHtml(field.name)}</span>
            <code class="field-val">${this.escapeHtml(field.value)}</code>
            <span class="field-range">${field.from}..${Math.max(field.from, field.to - 1)}</span>
          </div>
          ${field.note ? `<div class="field-note">${this.escapeHtml(field.note)}</div>` : ''}
        `;

        row.addEventListener('mouseenter', () => {
          this.highlightRange(panel, field.from, field.to, fieldIdx);
        });
        row.addEventListener('mouseleave', () => {
          this.highlightRange(panel, -1, -1, -1);
        });

        list.appendChild(row);
      });

      details.appendChild(list);
      treePane.appendChild(details);
    }

    // Right: Hex + ASCII Dump
    const hexPane = document.createElement('div');
    hexPane.className = 'inspector-hex-pane';

    const hexHeader = document.createElement('div');
    hexHeader.className = 'hex-pane-header';
    const hoverInfo = document.createElement('span');
    hoverInfo.className = 'hex-hover-info';
    hoverInfo.textContent = 'Passe o mouse sobre um campo ou byte para correlacionar';
    hexHeader.innerHTML = `<span>Hexadecimal &amp; ASCII (16 bytes/linha)</span>`;
    hexHeader.appendChild(hoverInfo);
    hexPane.appendChild(hexHeader);

    const hexGrid = document.createElement('div');
    hexGrid.className = 'hex-dump';

    for (let rowOffset = 0; rowOffset < totalBytes; rowOffset += 16) {
      const lineEl = document.createElement('div');
      lineEl.className = 'hex-row';

      const offsetEl = document.createElement('span');
      offsetEl.className = 'hex-offset';
      offsetEl.textContent = rowOffset.toString(16).padStart(4, '0');
      lineEl.appendChild(offsetEl);

      const bytesCol = document.createElement('div');
      bytesCol.className = 'hex-bytes';

      const asciiCol = document.createElement('div');
      asciiCol.className = 'hex-ascii';

      for (let i = 0; i < 16; i++) {
        const idx = rowOffset + i;
        if (idx >= totalBytes) {
          const pad = document.createElement('span');
          pad.className = 'hex-byte is-pad';
          pad.textContent = '  ';
          bytesCol.appendChild(pad);
          continue;
        }

        const b = decoded.bytes[idx];
        const tone = byteLayerTone[idx];
        const fIdx = byteFieldIdx[idx];

        const bSpan = document.createElement('span');
        bSpan.className = `hex-byte ${b === null ? 'is-opaque' : ''}`;
        bSpan.dataset.byteIdx = String(idx);
        bSpan.style.setProperty('--byte-tone', TONE_HEX[tone]);
        bSpan.textContent = b === null ? '••' : b.toString(16).padStart(2, '0');

        const aSpan = document.createElement('span');
        aSpan.className = `ascii-char ${b === null ? 'is-opaque' : ''}`;
        aSpan.dataset.byteIdx = String(idx);
        aSpan.style.setProperty('--byte-tone', TONE_HEX[tone]);
        aSpan.textContent =
          b === null ? '•' : b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';

        const onEnter = (): void => {
          if (fIdx >= 0) {
            const field = decoded.fields[fIdx];
            this.highlightRange(panel, field.from, field.to, fIdx);
            hoverInfo.textContent = `Byte ${idx} (0x${idx.toString(16).padStart(2, '0')}): ${field.name} = ${field.value}`;
          } else {
            this.highlightRange(panel, idx, idx + 1, -1);
            hoverInfo.textContent = `Byte ${idx}`;
          }
        };
        const onLeave = (): void => {
          this.highlightRange(panel, -1, -1, -1);
          hoverInfo.textContent = 'Passe o mouse sobre um campo ou byte para correlacionar';
        };

        bSpan.addEventListener('mouseenter', onEnter);
        bSpan.addEventListener('mouseleave', onLeave);
        aSpan.addEventListener('mouseenter', onEnter);
        aSpan.addEventListener('mouseleave', onLeave);

        bytesCol.appendChild(bSpan);
        asciiCol.appendChild(aSpan);
      }

      lineEl.append(bytesCol, asciiCol);
      hexGrid.appendChild(lineEl);
    }

    hexPane.appendChild(hexGrid);
    body.append(treePane, hexPane);
    panel.appendChild(body);
    this.overlay.appendChild(panel);
  }

  private highlightRange(panel: HTMLElement, from: number, to: number, fieldIdx: number): void {
    panel.querySelectorAll<HTMLElement>('.inspector-field-row.is-hl').forEach((el) => {
      el.classList.remove('is-hl');
    });
    if (fieldIdx >= 0) {
      const targetRow = panel.querySelector<HTMLElement>(`.inspector-field-row[data-field-idx="${fieldIdx}"]`);
      targetRow?.classList.add('is-hl');
    }

    panel.querySelectorAll<HTMLElement>('.hex-byte, .ascii-char').forEach((el) => {
      const idx = Number(el.dataset.byteIdx);
      if (from >= 0 && idx >= from && idx < to) {
        el.classList.add('is-hl');
      } else {
        el.classList.remove('is-hl');
      }
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
