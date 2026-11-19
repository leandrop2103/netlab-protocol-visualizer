import './styles/main.css';
import { SCENARIO_MAP, SCENARIOS } from './data/scenarios';
import type {
  PacketEvent,
  PacketTone,
  ProtocolCategory,
  ProtocolProgressStatus,
  ProtocolScenario,
  ViewMode,
} from './types/network';
import { PacketInspector } from './ui/packetInspector';
import { PracticeMode } from './ui/practiceMode';
import { SequenceView } from './ui/sequenceView';
import { TopologyView } from './ui/topologyView';

const STORAGE_THEME = 'netlab_theme';
const STORAGE_PROGRESS = 'netlab_progress';

const OSI_LAYERS = [
  { num: 1, label: 'L1 Física' },
  { num: 2, label: 'L2 Enlace' },
  { num: 3, label: 'L3 Rede' },
  { num: 4, label: 'L4 Transporte' },
  { num: 5, label: 'L5 Sessão' },
  { num: 6, label: 'L6 Apresentação' },
  { num: 7, label: 'L7 Aplicação' },
];

const CATEGORY_LABELS: Record<'all' | ProtocolCategory, string> = {
  all: 'Todos',
  fundamentos: 'Fundamentos',
  transporte: 'Transporte',
  aplicacao: 'Aplicação',
  seguranca: 'Segurança',
};

const TONE_HEX: Record<PacketTone, string> = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  rose: '#f43f5e',
  slate: '#64748b',
};

interface AppState {
  scenarioId: string;
  stepIndex: number; // -1 = overview/idle, 0..N-1 = active step
  viewMode: ViewMode;
  category: 'all' | ProtocolCategory;
  isPlaying: boolean;
  speed: number;
  sidebarHidden: boolean;
  focusMode: boolean;
  theme: 'dark' | 'light';
  inspectedPacketId: string | null;
  progress: Record<string, ProtocolProgressStatus>;
}

class NetLabApp {
  private state: AppState;
  private playTimer: number | null = null;
  private topologyView = new TopologyView();
  private sequenceView = new SequenceView();
  private practiceMode = new PracticeMode();
  private inspector = new PacketInspector();

  // DOM refs
  private root: HTMLElement;
  private osiBarEl!: HTMLElement;
  private modeTabsEl!: HTMLElement;
  private sidebarEl!: HTMLElement;
  private stageBodyEl!: HTMLElement;
  private inspectorOverlayEl!: HTMLElement;
  private detailsEl!: HTMLElement;
  private flowTableBodyEl!: HTMLElement;
  private playbackStatusEl!: HTMLElement;
  private playBtnEl!: HTMLButtonElement;
  private prevBtnEl!: HTMLButtonElement;
  private stepBtnEl!: HTMLButtonElement;
  private speedSelectEl!: HTMLSelectElement;
  private searchModalEl!: HTMLElement;
  private searchInputEl!: HTMLInputElement;
  private searchResultsEl!: HTMLElement;
  private shortcutsModalEl!: HTMLElement;
  private themeBtnEl!: HTMLButtonElement;

  constructor(root: HTMLElement) {
    this.root = root;
    const savedTheme = localStorage.getItem(STORAGE_THEME);
    const theme: 'dark' | 'light' = savedTheme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    let savedProgress: Record<string, ProtocolProgressStatus> = {};
    try {
      const raw = localStorage.getItem(STORAGE_PROGRESS);
      if (raw) savedProgress = JSON.parse(raw) as Record<string, ProtocolProgressStatus>;
    } catch {
      savedProgress = {};
    }

    const hashId = window.location.hash.replace('#', '');
    const initialId = SCENARIO_MAP[hashId] ? hashId : SCENARIOS[0].id;

    this.state = {
      scenarioId: initialId,
      stepIndex: -1,
      viewMode: 'topology',
      category: 'all',
      isPlaying: false,
      speed: 1,
      sidebarHidden: false,
      focusMode: false,
      theme,
      inspectedPacketId: null,
      progress: savedProgress,
    };

    this.buildShell();
    this.bindGlobalEvents();
    this.renderAll(false);
  }

  private get scenario(): ProtocolScenario {
    return SCENARIO_MAP[this.state.scenarioId] ?? SCENARIOS[0];
  }

  private get emittedPackets(): PacketEvent[] {
    const sc = this.scenario;
    if (this.state.stepIndex < 0) return [];
    const list: PacketEvent[] = [];
    for (let i = 0; i <= this.state.stepIndex && i < sc.steps.length; i++) {
      list.push(...sc.steps[i].packets);
    }
    return list;
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <div class="netlab-app">
        <header class="topbar">
          <div class="topbar-left">
            <div class="brand" title="NetLab — Visualizador Interativo de Protocolos de Rede">
              <svg class="brand-icon" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#2563eb"/>
                <circle cx="9" cy="16" r="3" fill="#fff"/>
                <circle cx="23" cy="9.5" r="3" fill="#93c5fd"/>
                <circle cx="23" cy="22.5" r="3" fill="#34d399"/>
                <path d="M12 14.8 L20.2 10.6 M12 17.2 L20.2 21.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span class="brand-name">NetLab</span>
              <span class="brand-badge">Livre · Interno</span>
            </div>
            <div class="osi-strip" id="osi-strip" aria-label="Camada do Modelo OSI"></div>
          </div>

          <div class="topbar-center">
            <div class="mode-tabs" id="mode-tabs" role="tablist">
              <button type="button" class="mode-tab" data-mode="topology" role="tab">Topologia</button>
              <button type="button" class="mode-tab" data-mode="sequence" role="tab">Sequência</button>
              <button type="button" class="mode-tab" data-mode="practice" role="tab">Prática</button>
            </div>
          </div>

          <div class="topbar-right">
            <button type="button" class="top-btn search-trigger" id="btn-search" title="Buscar protocolo (Ctrl+K)">
              <span>🔍 Buscar</span>
              <kbd>Ctrl+K</kbd>
            </button>
            <button type="button" class="top-btn" id="btn-toggle-sidebar" title="Alternar barra lateral (L)">☰</button>
            <button type="button" class="top-btn" id="btn-focus" title="Modo foco (D)">⛶</button>
            <button type="button" class="top-btn" id="btn-shortcuts" title="Atalhos de teclado (?)">?</button>
            <button type="button" class="top-btn" id="btn-theme" title="Alternar tema claro/escuro (T)">☀️</button>
          </div>
        </header>

        <div class="workspace">
          <aside class="sidebar" id="sidebar"></aside>

          <main class="center-column">
            <section class="stage-card">
              <div class="stage-body" id="stage-body"></div>
              <div class="inspector-overlay" id="inspector-overlay" aria-hidden="true"></div>
            </section>

            <section class="flow-card">
              <div class="flow-toolbar">
                <div class="playback-group">
                  <button type="button" class="ctrl-btn" id="btn-prev" title="Passo anterior (←)">⏮ Anterior</button>
                  <button type="button" class="ctrl-btn is-primary" id="btn-play" title="Reproduzir / Pausar (Espaço)">▶ Reproduzir</button>
                  <button type="button" class="ctrl-btn" id="btn-step" title="Próximo passo (→)">Passo ⏭</button>
                  <button type="button" class="ctrl-btn" id="btn-reset" title="Reiniciar (R)">↺ Reiniciar</button>
                </div>
                <div class="playback-meta">
                  <span class="step-counter" id="playback-status">Pronto</span>
                  <label class="speed-control">
                    <span>Velocidade:</span>
                    <select id="speed-select" aria-label="Velocidade da simulação">
                      <option value="0.5">0.5×</option>
                      <option value="1" selected>1×</option>
                      <option value="1.5">1.5×</option>
                      <option value="2">2×</option>
                    </select>
                  </label>
                </div>
              </div>

              <div class="flow-table-wrap">
                <table class="flow-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tempo</th>
                      <th>Origem</th>
                      <th>Destino</th>
                      <th>Protocolo</th>
                      <th>Tam.</th>
                      <th>Resumo (clique para inspecionar bytes)</th>
                    </tr>
                  </thead>
                  <tbody id="flow-table-body"></tbody>
                </table>
              </div>
            </section>
          </main>

          <aside class="details-panel" id="details-panel"></aside>
        </div>

        <!-- Modal de Busca Rápida (Ctrl+K) -->
        <div class="modal-backdrop" id="search-modal" aria-hidden="true">
          <div class="modal-box">
            <div class="modal-search-bar">
              <span>🔍</span>
              <input type="text" id="search-input" placeholder="Buscar protocolo (ex.: IP, Broadcast, Gateway, ICMP, TLS, TCP, DNS...)" autocomplete="off" />
              <kbd>Esc</kbd>
            </div>
            <div class="modal-search-results" id="search-results"></div>
          </div>
        </div>

        <!-- Modal de Atalhos (?) -->
        <div class="modal-backdrop" id="shortcuts-modal" aria-hidden="true">
          <div class="modal-box modal-shortcuts">
            <div class="modal-header">
              <h3>Atalhos de Teclado</h3>
              <button type="button" class="btn-icon" id="btn-close-shortcuts">✕</button>
            </div>
            <div class="shortcuts-grid">
              <div><kbd>Espaço</kbd><span>Reproduzir / Pausar simulação</span></div>
              <div><kbd>→</kbd><span>Avançar um passo</span></div>
              <div><kbd>←</kbd><span>Voltar um passo</span></div>
              <div><kbd>R</kbd><span>Reiniciar simulação</span></div>
              <div><kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd><span>Topologia / Sequência / Prática</span></div>
              <div><kbd>Ctrl</kbd>+<kbd>K</kbd><span>Busca rápida de protocolos</span></div>
              <div><kbd>L</kbd><span>Ocultar / mostrar barra lateral</span></div>
              <div><kbd>D</kbd><span>Alternar modo foco</span></div>
              <div><kbd>T</kbd><span>Alternar tema claro / escuro</span></div>
              <div><kbd>Esc</kbd><span>Fechar inspetor ou janela</span></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.osiBarEl = this.q('#osi-strip');
    this.modeTabsEl = this.q('#mode-tabs');
    this.sidebarEl = this.q('#sidebar');
    this.stageBodyEl = this.q('#stage-body');
    this.inspectorOverlayEl = this.q('#inspector-overlay');
    this.detailsEl = this.q('#details-panel');
    this.flowTableBodyEl = this.q('#flow-table-body');
    this.playbackStatusEl = this.q('#playback-status');
    this.playBtnEl = this.q('#btn-play') as HTMLButtonElement;
    this.prevBtnEl = this.q('#btn-prev') as HTMLButtonElement;
    this.stepBtnEl = this.q('#btn-step') as HTMLButtonElement;
    this.speedSelectEl = this.q('#speed-select') as HTMLSelectElement;
    this.searchModalEl = this.q('#search-modal');
    this.searchInputEl = this.q('#search-input') as HTMLInputElement;
    this.searchResultsEl = this.q('#search-results');
    this.shortcutsModalEl = this.q('#shortcuts-modal');
    this.themeBtnEl = this.q('#btn-theme') as HTMLButtonElement;

    this.topologyView.mount(this.stageBodyEl);
    this.sequenceView.mount(this.stageBodyEl);
    this.practiceMode.mount(this.stageBodyEl);
    this.inspector.mount(this.inspectorOverlayEl);

    // Wire static toolbar controls
    this.modeTabsEl.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as ViewMode;
        this.setViewMode(mode);
      });
    });

    this.q('#btn-search').addEventListener('click', () => this.openSearchModal());
    this.q('#btn-toggle-sidebar').addEventListener('click', () => this.toggleSidebar());
    this.q('#btn-focus').addEventListener('click', () => this.toggleFocusMode());
    this.q('#btn-shortcuts').addEventListener('click', () => this.toggleShortcutsModal(true));
    this.q('#btn-close-shortcuts').addEventListener('click', () => this.toggleShortcutsModal(false));
    this.themeBtnEl.addEventListener('click', () => this.toggleTheme());

    this.playBtnEl.addEventListener('click', () => this.togglePlay());
    this.prevBtnEl.addEventListener('click', () => this.stepPrev());
    this.stepBtnEl.addEventListener('click', () => this.stepNext());
    this.q('#btn-reset').addEventListener('click', () => this.resetSimulation());

    this.speedSelectEl.addEventListener('change', () => {
      this.state.speed = Number(this.speedSelectEl.value) || 1;
      if (this.state.isPlaying) {
        this.scheduleNextPlayTick();
      }
    });

    // Modal backdrop close
    this.searchModalEl.addEventListener('click', (e) => {
      if (e.target === this.searchModalEl) this.closeSearchModal();
    });
    this.shortcutsModalEl.addEventListener('click', (e) => {
      if (e.target === this.shortcutsModalEl) this.toggleShortcutsModal(false);
    });
    this.inspectorOverlayEl.addEventListener('click', (e) => {
      if (e.target === this.inspectorOverlayEl) this.closeInspector();
    });

    this.searchInputEl.addEventListener('input', () => this.renderSearchResults());
    this.searchInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = this.searchResultsEl.querySelector<HTMLButtonElement>('.search-item');
        first?.click();
      }
    });
  }

  private bindGlobalEvents(): void {
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openSearchModal();
        return;
      }

      if (e.key === 'Escape') {
        if (this.searchModalEl.classList.contains('is-open')) {
          this.closeSearchModal();
        } else if (this.shortcutsModalEl.classList.contains('is-open')) {
          this.toggleShortcutsModal(false);
        } else if (this.state.inspectedPacketId) {
          this.closeInspector();
        }
        return;
      }

      if (inInput) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.stepNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.stepPrev();
          break;
        case 'r':
        case 'R':
          this.resetSimulation();
          break;
        case '1':
          this.setViewMode('topology');
          break;
        case '2':
          this.setViewMode('sequence');
          break;
        case '3':
          this.setViewMode('practice');
          break;
        case 'l':
        case 'L':
          this.toggleSidebar();
          break;
        case 'd':
        case 'D':
          this.toggleFocusMode();
          break;
        case 't':
        case 'T':
          this.toggleTheme();
          break;
        case '?':
          this.toggleShortcutsModal(true);
          break;
      }
    });
  }

  private q(selector: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Elemento não encontrado: ${selector}`);
    return el;
  }

  private selectScenario(id: string): void {
    if (!SCENARIO_MAP[id]) return;
    this.stopPlay();
    this.closeInspector();
    this.state.scenarioId = id;
    this.state.stepIndex = -1;
    window.history.replaceState(null, '', `#${id}`);
    this.renderAll(false);
  }

  private setViewMode(mode: ViewMode): void {
    this.state.viewMode = mode;
    if (mode === 'practice') {
      this.stopPlay();
      this.closeInspector();
    }
    this.renderAll(false);
  }

  private toggleSidebar(): void {
    this.state.sidebarHidden = !this.state.sidebarHidden;
    this.applyLayoutClasses();
  }

  private toggleFocusMode(): void {
    this.state.focusMode = !this.state.focusMode;
    this.applyLayoutClasses();
  }

  private toggleTheme(): void {
    this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.state.theme);
    localStorage.setItem(STORAGE_THEME, this.state.theme);
    this.renderThemeButton();
  }

  private applyLayoutClasses(): void {
    const appEl = this.q('.netlab-app');
    appEl.classList.toggle('is-sidebar-hidden', this.state.sidebarHidden);
    appEl.classList.toggle('is-focus', this.state.focusMode);
  }

  private markProgress(scenarioId: string, status: ProtocolProgressStatus): void {
    const current = this.state.progress[scenarioId];
    if (current === 'done' && status === 'progress') return;
    this.state.progress[scenarioId] = status;
    try {
      localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(this.state.progress));
    } catch {
      // ignore storage quota errors
    }
  }

  private goToStep(index: number, animate = true): void {
    const sc = this.scenario;
    const clamped = Math.max(-1, Math.min(sc.steps.length - 1, index));
    this.state.stepIndex = clamped;
    if (clamped >= 0) {
      this.markProgress(sc.id, clamped === sc.steps.length - 1 ? 'done' : 'progress');
    }
    this.renderAll(animate);
  }

  private stepNext(): void {
    const sc = this.scenario;
    if (this.state.viewMode === 'practice') this.state.viewMode = 'topology';
    if (this.state.stepIndex < sc.steps.length - 1) {
      this.goToStep(this.state.stepIndex + 1, true);
    } else {
      this.stopPlay();
    }
  }

  private stepPrev(): void {
    this.stopPlay();
    if (this.state.viewMode === 'practice') this.state.viewMode = 'topology';
    if (this.state.stepIndex >= 0) {
      this.goToStep(this.state.stepIndex - 1, false);
    }
  }

  private resetSimulation(): void {
    this.stopPlay();
    this.closeInspector();
    this.state.stepIndex = -1;
    this.renderAll(false);
  }

  private togglePlay(): void {
    if (this.state.viewMode === 'practice') {
      this.state.viewMode = 'topology';
    }
    if (this.state.isPlaying) {
      this.stopPlay();
    } else {
      const sc = this.scenario;
      if (this.state.stepIndex >= sc.steps.length - 1) {
        this.state.stepIndex = -1;
      }
      this.state.isPlaying = true;
      this.stepNext();
      this.scheduleNextPlayTick();
    }
    this.renderPlaybackControls();
  }

  private stopPlay(): void {
    this.state.isPlaying = false;
    if (this.playTimer !== null) {
      window.clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    this.renderPlaybackControls();
  }

  private scheduleNextPlayTick(): void {
    if (this.playTimer !== null) {
      window.clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    if (!this.state.isPlaying) return;
    const delay = Math.round(2650 / Math.max(0.25, this.state.speed));
    this.playTimer = window.setTimeout(() => {
      if (!this.state.isPlaying) return;
      if (this.state.stepIndex < this.scenario.steps.length - 1) {
        this.stepNext();
        this.scheduleNextPlayTick();
      } else {
        this.stopPlay();
      }
    }, delay);
  }

  private openInspector(packet: PacketEvent): void {
    this.stopPlay();
    this.state.inspectedPacketId = packet.id;
    const allPkts = this.emittedPackets.length > 0 ? this.emittedPackets : this.scenario.steps.flatMap((s) => s.packets);
    const idx = Math.max(0, allPkts.findIndex((p) => p.id === packet.id));

    this.inspector.show(packet, idx, allPkts.length, {
      onClose: () => this.closeInspector(),
      onNavigate: (delta) => {
        const nextIdx = idx + delta;
        if (nextIdx >= 0 && nextIdx < allPkts.length) {
          this.openInspector(allPkts[nextIdx]);
        }
      },
    });
    this.renderFlowTable();
  }

  private closeInspector(): void {
    this.state.inspectedPacketId = null;
    this.inspector.hide();
    this.renderFlowTable();
  }

  private openSearchModal(): void {
    this.searchModalEl.classList.add('is-open');
    this.searchModalEl.setAttribute('aria-hidden', 'false');
    this.searchInputEl.value = '';
    this.renderSearchResults();
    window.setTimeout(() => this.searchInputEl.focus(), 20);
  }

  private closeSearchModal(): void {
    this.searchModalEl.classList.remove('is-open');
    this.searchModalEl.setAttribute('aria-hidden', 'true');
  }

  private toggleShortcutsModal(open: boolean): void {
    this.shortcutsModalEl.classList.toggle('is-open', open);
    this.shortcutsModalEl.setAttribute('aria-hidden', String(!open));
  }

  private renderSearchResults(): void {
    const q = this.searchInputEl.value.trim().toLowerCase();
    const matches = SCENARIOS.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.fullName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.rfc.toLowerCase().includes(q) ||
        s.defaultPort.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });

    this.searchResultsEl.innerHTML = '';
    if (matches.length === 0) {
      this.searchResultsEl.innerHTML = `<div class="search-empty">Nenhum protocolo encontrado para "${this.escapeHtml(q)}".</div>`;
      return;
    }

    for (const sc of matches) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-item';
      btn.innerHTML = `
        <div class="search-item-main">
          <strong>${this.escapeHtml(sc.name)}</strong>
          <span class="search-item-sub">${this.escapeHtml(sc.fullName)}</span>
        </div>
        <div class="search-item-meta">
          <span class="osi-chip">L${sc.osiLayer}</span>
          <span>${this.escapeHtml(sc.rfc)}</span>
        </div>
      `;
      btn.addEventListener('click', () => {
        this.closeSearchModal();
        this.selectScenario(sc.id);
      });
      this.searchResultsEl.appendChild(btn);
    }
  }

  private renderAll(animateStage: boolean): void {
    this.applyLayoutClasses();
    this.renderThemeButton();
    this.renderOsiBar();
    this.renderModeTabs();
    this.renderSidebar();
    this.renderStage(animateStage);
    this.renderPlaybackControls();
    this.renderFlowTable();
    this.renderDetailsPanel();
  }

  private renderThemeButton(): void {
    this.themeBtnEl.textContent = this.state.theme === 'dark' ? '☀️' : '🌙';
    this.themeBtnEl.title =
      this.state.theme === 'dark' ? 'Mudar para tema claro (T)' : 'Mudar para tema escuro (T)';
  }

  private renderOsiBar(): void {
    const activeLayer = this.scenario.osiLayer;
    this.osiBarEl.innerHTML = '';
    for (const l of OSI_LAYERS) {
      const span = document.createElement('span');
      span.className = `osi-pill ${l.num === activeLayer ? 'is-active' : ''}`;
      span.textContent = `L${l.num}`;
      span.title = l.label;
      this.osiBarEl.appendChild(span);
    }
  }

  private renderModeTabs(): void {
    this.modeTabsEl.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((btn) => {
      const active = btn.dataset.mode === this.state.viewMode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  private renderSidebar(): void {
    const doneCount = SCENARIOS.filter((s) => this.state.progress[s.id] === 'done').length;
    const pct = Math.round((doneCount / SCENARIOS.length) * 100);

    this.sidebarEl.innerHTML = '';

    // Progress header
    const prog = document.createElement('div');
    prog.className = 'sidebar-progress';
    prog.innerHTML = `
      <div class="progress-top">
        <span>Trilha de Estudos</span>
        <strong>${doneCount}/${SCENARIOS.length}</strong>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    `;
    this.sidebarEl.appendChild(prog);

    // Category filter chips
    const cats = document.createElement('div');
    cats.className = 'category-filters';
    const keys: ('all' | ProtocolCategory)[] = ['all', 'fundamentos', 'transporte', 'aplicacao', 'seguranca'];
    for (const key of keys) {
      const count = key === 'all' ? SCENARIOS.length : SCENARIOS.filter((s) => s.category === key).length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cat-chip ${this.state.category === key ? 'is-active' : ''}`;
      btn.textContent = `${CATEGORY_LABELS[key]} (${count})`;
      btn.addEventListener('click', () => {
        this.state.category = key;
        this.renderSidebar();
      });
      cats.appendChild(btn);
    }
    this.sidebarEl.appendChild(cats);

    // Protocol list
    const list = document.createElement('div');
    list.className = 'protocol-list';

    const visible =
      this.state.category === 'all'
        ? SCENARIOS
        : SCENARIOS.filter((s) => s.category === this.state.category);

    for (const sc of visible) {
      const isSelected = sc.id === this.state.scenarioId;
      const status = this.state.progress[sc.id] ?? 'new';

      const item = document.createElement('div');
      item.className = `proto-item ${isSelected ? 'is-selected' : ''}`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'proto-btn';
      btn.innerHTML = `
        <span class="status-dot is-${status}" title="${
          status === 'done' ? 'Concluído' : status === 'progress' ? 'Em andamento' : 'Não iniciado'
        }"></span>
        <span class="proto-info">
          <strong>${this.escapeHtml(sc.name)}</strong>
          <small>${this.escapeHtml(sc.osiLabel)} · ${this.escapeHtml(sc.defaultPort)}</small>
        </span>
        <span class="proto-steps-count">${sc.steps.length}p</span>
      `;
      btn.addEventListener('click', () => this.selectScenario(sc.id));
      item.appendChild(btn);

      // Expand steps when selected
      if (isSelected) {
        const stepsList = document.createElement('div');
        stepsList.className = 'proto-steps-list';
        sc.steps.forEach((st, idx) => {
          const stBtn = document.createElement('button');
          stBtn.type = 'button';
          stBtn.className = `step-nav-btn ${this.state.stepIndex === idx ? 'is-active' : ''} ${
            this.state.stepIndex > idx ? 'is-passed' : ''
          }`;
          stBtn.innerHTML = `<span class="step-num">${idx + 1}</span><span>${this.escapeHtml(st.title)}</span>`;
          stBtn.addEventListener('click', () => {
            this.stopPlay();
            if (this.state.viewMode === 'practice') this.state.viewMode = 'topology';
            this.goToStep(idx, true);
          });
          stepsList.appendChild(stBtn);
        });
        item.appendChild(stepsList);
      }

      list.appendChild(item);
    }

    this.sidebarEl.appendChild(list);
  }

  private renderStage(animate: boolean): void {
    this.topologyView.destroy();
    const sc = this.scenario;
    if (this.state.viewMode === 'topology') {
      this.topologyView.render(sc, this.state.stepIndex, this.state.speed, animate, (pkt) =>
        this.openInspector(pkt)
      );
    } else if (this.state.viewMode === 'sequence') {
      this.sequenceView.render(sc, this.state.stepIndex, this.state.inspectedPacketId, (pkt) =>
        this.openInspector(pkt)
      );
    } else {
      this.practiceMode.render(sc);
    }
  }

  private renderPlaybackControls(): void {
    const sc = this.scenario;
    const total = sc.steps.length;
    this.playBtnEl.textContent = this.state.isPlaying ? '⏸ Pausar' : '▶ Reproduzir';
    this.prevBtnEl.disabled = this.state.stepIndex < 0;
    this.stepBtnEl.disabled = this.state.stepIndex >= total - 1;
    this.playbackStatusEl.textContent =
      this.state.stepIndex < 0
        ? `Pronto · ${total} passos`
        : `Passo ${this.state.stepIndex + 1} de ${total}`;
  }

  private renderFlowTable(): void {
    const pkts = this.emittedPackets;
    this.flowTableBodyEl.innerHTML = '';

    if (pkts.length === 0) {
      this.flowTableBodyEl.innerHTML = `
        <tr class="flow-empty-row">
          <td colspan="7">Nenhum pacote transmitido ainda. Pressione <strong>Reproduzir</strong> ou <strong>Passo</strong> para observar o tráfego em tempo real.</td>
        </tr>
      `;
      return;
    }

    pkts.forEach((pkt, idx) => {
      const tr = document.createElement('tr');
      tr.className = `flow-row ${pkt.id === this.state.inspectedPacketId ? 'is-selected' : ''} ${
        pkt.lost ? 'is-lost' : ''
      }`;
      tr.innerHTML = `
        <td class="mono">${idx + 1}</td>
        <td class="mono">${this.escapeHtml(pkt.time)}</td>
        <td class="mono">${this.escapeHtml(pkt.srcAddr)}</td>
        <td class="mono">${this.escapeHtml(pkt.dstAddr)}</td>
        <td><span class="proto-pill" style="background:${TONE_HEX[pkt.tone]}">${this.escapeHtml(pkt.protoLabel)}</span></td>
        <td class="mono">${pkt.sizeBytes} B</td>
        <td class="flow-info-cell">${pkt.encrypted ? '🔒 ' : ''}${pkt.lost ? '✕ [PERDIDO] ' : ''}${this.escapeHtml(pkt.info)}</td>
      `;
      tr.addEventListener('click', () => this.openInspector(pkt));
      this.flowTableBodyEl.appendChild(tr);
    });

    // Auto-scroll to latest packet
    const wrap = this.flowTableBodyEl.closest('.flow-table-wrap');
    if (wrap) {
      wrap.scrollTop = wrap.scrollHeight;
    }
  }

  private renderDetailsPanel(): void {
    const sc = this.scenario;
    this.detailsEl.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'details-content';

    if (this.state.stepIndex < 0) {
      card.innerHTML = `
        <div class="details-badge">Visão Geral · ${this.escapeHtml(sc.osiLabel)}</div>
        <h1 class="details-title">${this.escapeHtml(sc.name)}</h1>
        <p class="details-subtitle">${this.escapeHtml(sc.fullName)}</p>
        <p class="details-desc">${this.escapeHtml(sc.description)}</p>

        <div class="meta-grid">
          <div class="meta-item"><span>Porta Padrão</span><strong>${this.escapeHtml(sc.defaultPort)}</strong></div>
          <div class="meta-item"><span>Transporte</span><strong>${this.escapeHtml(sc.transport)}</strong></div>
          <div class="meta-item"><span>Especificação</span><strong>${this.escapeHtml(sc.rfc)}</strong></div>
          <div class="meta-item"><span>Passos</span><strong>${sc.steps.length} etapas</strong></div>
        </div>

        <div class="facts-box">
          <h3>O que você vai aprender</h3>
          <p class="summary-text">${this.escapeHtml(sc.summary.text)}</p>
          <dl class="facts-list">
            ${sc.summary.facts
              .map(([k, v]) => `<div class="fact-row"><dt>${this.escapeHtml(k)}</dt><dd>${this.escapeHtml(v)}</dd></div>`)
              .join('')}
          </dl>
        </div>
      `;
    } else {
      const step = sc.steps[this.state.stepIndex];
      const isLast = this.state.stepIndex === sc.steps.length - 1;

      card.innerHTML = `
        <div class="details-badge">Passo ${this.state.stepIndex + 1} de ${sc.steps.length} · ${this.escapeHtml(sc.name)}</div>
        <h2 class="details-title">${this.escapeHtml(step.title)}</h2>
        <p class="details-subtitle">${this.escapeHtml(step.subtitle)}</p>
        <p class="details-desc">${this.escapeHtml(step.explanation)}</p>

        <div class="facts-box">
          <h3>Detalhes Técnicos</h3>
          <dl class="facts-list">
            ${step.facts
              .map(([k, v]) => `<div class="fact-row"><dt>${this.escapeHtml(k)}</dt><dd>${this.escapeHtml(v)}</dd></div>`)
              .join('')}
          </dl>
        </div>
      `;

      // Quick inspect buttons for packets in this step
      if (step.packets.length > 0) {
        const pktSection = document.createElement('div');
        pktSection.className = 'step-packets-box';
        pktSection.innerHTML = `<h3>Pacotes nesta etapa</h3>`;
        for (const pkt of step.packets) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'inspect-quick-btn';
          btn.innerHTML = `
            <span class="proto-pill" style="background:${TONE_HEX[pkt.tone]}">${this.escapeHtml(pkt.protoLabel)}</span>
            <span class="iq-label">${this.escapeHtml(pkt.label)}</span>
            <span class="iq-cta">Inspecionar →</span>
          `;
          btn.addEventListener('click', () => this.openInspector(pkt));
          pktSection.appendChild(btn);
        }
        card.appendChild(pktSection);
      }

      // Final summary card on last step
      if (isLast) {
        const sumCard = document.createElement('div');
        sumCard.className = 'final-summary-card';
        sumCard.innerHTML = `
          <div class="summary-badge">✓ Simulação concluída</div>
          <h3>${this.escapeHtml(sc.summary.title)}</h3>
          <p>${this.escapeHtml(sc.summary.text)}</p>
        `;
        const practiceCta = document.createElement('button');
        practiceCta.type = 'button';
        practiceCta.className = 'btn-primary full-width';
        practiceCta.textContent = '🎯 Testar conhecimentos no Modo Prática';
        practiceCta.addEventListener('click', () => this.setViewMode('practice'));
        sumCard.appendChild(practiceCta);
        card.appendChild(sumCard);
      }
    }

    this.detailsEl.appendChild(card);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

const appRoot = document.getElementById('app');
if (appRoot) {
  new NetLabApp(appRoot);
}
