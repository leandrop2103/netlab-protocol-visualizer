import { NETWORK_NODES } from '../data/nodes';
import type { NodeKind, PacketEvent, PacketTone, ProtocolScenario } from '../types/network';

interface PlacedMessage {
  label: string;
  tone: PacketTone;
  from: NodeKind;
  to: NodeKind;
}

const TONE_HEX: Record<PacketTone, string> = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  rose: '#f43f5e',
  slate: '#64748b',
};

export class PracticeMode {
  private container: HTMLElement | null = null;
  private scenarioId = '';
  private selectedChip: { label: string; tone: PacketTone } | null = null;
  private pendingFrom: NodeKind | null = null;
  private placed: PlacedMessage[] = [];
  private gradedResult: { score: number; details: { ok: boolean; text: string }[] } | null = null;
  private showSolution = false;

  mount(container: HTMLElement): void {
    this.container = container;
  }

  resetForScenario(scenario: ProtocolScenario): void {
    if (this.scenarioId !== scenario.id) {
      this.scenarioId = scenario.id;
      this.selectedChip = null;
      this.pendingFrom = null;
      this.placed = [];
      this.gradedResult = null;
      this.showSolution = false;
    }
  }

  render(scenario: ProtocolScenario): void {
    if (!this.container) return;
    this.resetForScenario(scenario);
    this.container.innerHTML = '';

    const expectedPackets: PacketEvent[] = scenario.steps.flatMap((s) => s.packets);

    // Unique message chips sorted alphabetically so user doesn't just click in order
    const chipMap = new Map<string, PacketTone>();
    for (const pkt of expectedPackets) {
      if (!chipMap.has(pkt.label)) {
        chipMap.set(pkt.label, pkt.tone);
      }
    }
    const chips = Array.from(chipMap.entries())
      .map(([label, tone]) => ({ label, tone }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    if (!this.selectedChip && chips.length > 0) {
      this.selectedChip = chips[0];
    }

    const root = document.createElement('div');
    root.className = 'practice-stage';

    // Top instructions
    const top = document.createElement('div');
    top.className = 'practice-header';
    top.innerHTML = `
      <div>
        <h2>Modo Prática · ${this.escapeHtml(scenario.name)}</h2>
        <p>Monte a sequência esperada de <strong>${expectedPackets.length} mensagens</strong>: escolha o pacote abaixo e clique no nó de <strong>Origem</strong> e depois no nó de <strong>Destino</strong>.</p>
      </div>
    `;

    const controls = document.createElement('div');
    controls.className = 'practice-controls';

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'btn-secondary';
    undoBtn.textContent = '↶ Desfazer';
    undoBtn.disabled = this.placed.length === 0;
    undoBtn.addEventListener('click', () => {
      this.placed.pop();
      this.gradedResult = null;
      this.render(scenario);
    });

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn-secondary';
    clearBtn.textContent = 'Limpar';
    clearBtn.disabled = this.placed.length === 0;
    clearBtn.addEventListener('click', () => {
      this.placed = [];
      this.pendingFrom = null;
      this.gradedResult = null;
      this.render(scenario);
    });

    const solutionBtn = document.createElement('button');
    solutionBtn.type = 'button';
    solutionBtn.className = 'btn-secondary';
    solutionBtn.textContent = this.showSolution ? 'Ocultar Gabarito' : 'Ver Gabarito';
    solutionBtn.addEventListener('click', () => {
      this.showSolution = !this.showSolution;
      this.render(scenario);
    });

    const gradeBtn = document.createElement('button');
    gradeBtn.type = 'button';
    gradeBtn.className = 'btn-primary';
    gradeBtn.textContent = '✓ Verificar Resposta';
    gradeBtn.disabled = this.placed.length === 0;
    gradeBtn.addEventListener('click', () => {
      this.grade(expectedPackets);
      this.render(scenario);
    });

    controls.append(undoBtn, clearBtn, solutionBtn, gradeBtn);
    top.appendChild(controls);
    root.appendChild(top);

    // Message Chip Palette
    const palette = document.createElement('div');
    palette.className = 'practice-palette';
    const palLabel = document.createElement('span');
    palLabel.className = 'palette-label';
    palLabel.textContent = '1. Escolha o pacote:';
    palette.appendChild(palLabel);

    for (const chip of chips) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isSel = this.selectedChip?.label === chip.label;
      btn.className = `practice-chip ${isSel ? 'is-selected' : ''}`;
      btn.style.setProperty('--chip-color', TONE_HEX[chip.tone]);
      btn.textContent = chip.label;
      btn.addEventListener('click', () => {
        this.selectedChip = chip;
        this.render(scenario);
      });
      palette.appendChild(btn);
    }
    root.appendChild(palette);

    // Interactive Node Selector Bar
    const nodesBar = document.createElement('div');
    nodesBar.className = 'practice-nodes-bar';
    const stepPrompt = document.createElement('div');
    stepPrompt.className = 'practice-step-prompt';
    if (this.pendingFrom) {
      const fromName = scenario.customLabels?.[this.pendingFrom]?.name ?? NETWORK_NODES[this.pendingFrom].name;
      stepPrompt.innerHTML = `2. Origem selecionada: <strong>${this.escapeHtml(fromName)}</strong> → Agora clique no nó de <strong>Destino</strong>.`;
    } else {
      stepPrompt.innerHTML = `2. Clique no nó de <strong>Origem</strong> para adicionar <strong>${this.escapeHtml(this.selectedChip?.label ?? '')}</strong>:`;
    }
    nodesBar.appendChild(stepPrompt);

    const nodesGrid = document.createElement('div');
    nodesGrid.className = 'practice-nodes-grid';

    for (const nodeId of scenario.nodes) {
      const base = NETWORK_NODES[nodeId];
      const name = scenario.customLabels?.[nodeId]?.name ?? base.name;
      const sub = scenario.customLabels?.[nodeId]?.subtitle ?? base.subtitle;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `practice-node-btn ${this.pendingFrom === nodeId ? 'is-origin' : ''}`;
      btn.innerHTML = `<strong>${this.escapeHtml(name)}</strong><span>${this.escapeHtml(sub)}</span>`;
      btn.addEventListener('click', () => {
        if (!this.selectedChip) return;
        if (!this.pendingFrom) {
          this.pendingFrom = nodeId;
          this.render(scenario);
        } else if (this.pendingFrom === nodeId) {
          this.pendingFrom = null;
          this.render(scenario);
        } else {
          this.placed.push({
            label: this.selectedChip.label,
            tone: this.selectedChip.tone,
            from: this.pendingFrom,
            to: nodeId,
          });
          this.pendingFrom = null;
          this.gradedResult = null;
          this.render(scenario);
        }
      });
      nodesGrid.appendChild(btn);
    }
    nodesBar.appendChild(nodesGrid);
    root.appendChild(nodesBar);

    // User's Placed Sequence List
    const board = document.createElement('div');
    board.className = 'practice-board';

    const boardTitle = document.createElement('div');
    boardTitle.className = 'practice-board-title';
    boardTitle.textContent = `Sua sequência (${this.placed.length} / ${expectedPackets.length} mensagens)`;
    board.appendChild(boardTitle);

    if (this.placed.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'practice-empty';
      empty.textContent = 'Nenhuma mensagem adicionada ainda. Selecione um pacote e clique em Origem → Destino.';
      board.appendChild(empty);
    } else {
      const list = document.createElement('ol');
      list.className = 'practice-placed-list';
      this.placed.forEach((msg, idx) => {
        const fromName = scenario.customLabels?.[msg.from]?.name ?? NETWORK_NODES[msg.from].name;
        const toName = scenario.customLabels?.[msg.to]?.name ?? NETWORK_NODES[msg.to].name;
        const li = document.createElement('li');
        li.className = 'practice-placed-item';
        li.innerHTML = `
          <span class="placed-idx">${idx + 1}</span>
          <span class="placed-pill" style="background:${TONE_HEX[msg.tone]}">${this.escapeHtml(msg.label)}</span>
          <span class="placed-route">${this.escapeHtml(fromName)} → ${this.escapeHtml(toName)}</span>
        `;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn-remove-mini';
        del.title = 'Remover mensagem';
        del.textContent = '✕';
        del.addEventListener('click', () => {
          this.placed.splice(idx, 1);
          this.gradedResult = null;
          this.render(scenario);
        });
        li.appendChild(del);
        list.appendChild(li);
      });
      board.appendChild(list);
    }
    root.appendChild(board);

    // Grading Feedback
    if (this.gradedResult) {
      const resBox = document.createElement('div');
      resBox.className = `practice-result ${this.gradedResult.score === 100 ? 'is-perfect' : ''}`;
      resBox.innerHTML = `
        <div class="result-score">Pontuação: <strong>${this.gradedResult.score}%</strong> ${
          this.gradedResult.score === 100 ? '— Excelente! Sequência perfeita.' : '— Revise os itens marcados abaixo.'
        }</div>
      `;
      const ul = document.createElement('ul');
      ul.className = 'result-list';
      for (const d of this.gradedResult.details) {
        const li = document.createElement('li');
        li.className = d.ok ? 'is-ok' : 'is-err';
        li.textContent = `${d.ok ? '✓' : '✕'} ${d.text}`;
        ul.appendChild(li);
      }
      resBox.appendChild(ul);
      root.appendChild(resBox);
    }

    // Reference Solution
    if (this.showSolution) {
      const solBox = document.createElement('div');
      solBox.className = 'practice-solution';
      solBox.innerHTML = `<h4>Gabarito oficial · ${this.escapeHtml(scenario.name)}</h4>`;
      const ol = document.createElement('ol');
      for (const pkt of expectedPackets) {
        const fromName = scenario.customLabels?.[pkt.from]?.name ?? NETWORK_NODES[pkt.from].name;
        const toName = scenario.customLabels?.[pkt.to]?.name ?? NETWORK_NODES[pkt.to].name;
        const li = document.createElement('li');
        li.innerHTML = `<strong>${this.escapeHtml(pkt.label)}</strong>: ${this.escapeHtml(fromName)} → ${this.escapeHtml(toName)}`;
        ol.appendChild(li);
      }
      solBox.appendChild(ol);
      root.appendChild(solBox);
    }

    this.container.appendChild(root);
  }

  private grade(expected: PacketEvent[]): void {
    const details: { ok: boolean; text: string }[] = [];
    let hits = 0;

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const got = this.placed[i];
      if (!got) {
        details.push({
          ok: false,
          text: `Passo ${i + 1}: faltou "${exp.label}" (${NETWORK_NODES[exp.from].name} → ${NETWORK_NODES[exp.to].name}).`,
        });
        continue;
      }
      const ok = got.label === exp.label && got.from === exp.from && got.to === exp.to;
      if (ok) {
        hits++;
        details.push({ ok: true, text: `Passo ${i + 1}: "${got.label}" correto!` });
      } else {
        details.push({
          ok: false,
          text: `Passo ${i + 1}: você colocou "${got.label}" (${NETWORK_NODES[got.from].name} → ${NETWORK_NODES[got.to].name}), esperado "${exp.label}" (${NETWORK_NODES[exp.from].name} → ${NETWORK_NODES[exp.to].name}).`,
        });
      }
    }

    if (this.placed.length > expected.length) {
      details.push({
        ok: false,
        text: `Você adicionou ${this.placed.length - expected.length} mensagem(ns) extra(s) além do esperado.`,
      });
    }

    const penalty = Math.max(0, this.placed.length - expected.length);
    const score = Math.max(0, Math.round((hits / Math.max(1, expected.length + penalty)) * 100));
    this.gradedResult = { score, details };
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
