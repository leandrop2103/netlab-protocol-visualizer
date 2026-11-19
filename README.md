# NetLab — Visualizador Interativo de Protocolos de Rede

Aplicação web educacional interativa, **100% gratuita, open-source (MIT) e sem necessidade de login ou cadastro**, criada em **TypeScript + Vite** para treinamento interno e aprendizado prático de redes de computadores.

---

## O que o projeto oferece

- **16 protocolos e conceitos essenciais de redes**, organizados em uma trilha didática completa em **português (pt-BR)** — incluindo **IP (IPv4)**, **Broadcast & ARP**, **Gateway Padrão**, **ICMP (Ping & Traceroute)**, além de protocolos de transporte, aplicação e segurança.
- **Topologia de Rede Animada (SVG)**: acompanhe pacotes percorrendo switches, roteadores/gateways, servidores DNS e servidores remotos, com animação de **fan-out em Broadcast** e simulação visual de **perda de pacotes**.
- **Diagrama de Sequência Interativo**: linha do tempo cronológica com setas coloridas entre todos os participantes.
- **Inspetor de Pacotes em Nível de Byte**: decodificação real de quadros **Ethernet II, ARP, IPv4 (com checksum RFC 1071), IPv6, ICMP, TCP, UDP e Aplicação**, com barra proporcional de camadas e **dump Hexadecimal + ASCII sincronizado** (passe o mouse sobre um campo ou byte para destacar os dois lados).
- **Modo Prática (Desafios)**: monte manualmente a sequência de mensagens de qualquer um dos 16 protocolos, receba pontuação automática (0–100%) e consulte o gabarito.
- **Experiência sem burocracia**: zero login, zero paywall, tema claro/escuro, busca rápida (`Ctrl+K`), controle de velocidade (`0.5×` a `2×`), modo foco (`D`) e progresso salvo localmente no navegador (`localStorage`).

---

## Protocolos incluídos (16)

| Categoria | Protocolo / Conceito | Camada OSI | Destaques da Simulação |
| :--- | :--- | :---: | :--- |
| **Fundamentos** | **IP (IPv4)** | L3 Rede | Encapsulamento, decremento de TTL e NAT no Gateway |
| **Fundamentos** | **Broadcast & ARP** | L2 Enlace | `FF:FF:FF:FF:FF:FF`, inundação no Switch vs. bloqueio no Roteador |
| **Fundamentos** | **Gateway Padrão** | L3 Rede | Decisão local vs. remoto (máscara `/24`) e troca de MAC L2 mantendo IP L3 |
| **Fundamentos** | **ICMP** | L3 Rede | Ping (Echo Request/Reply), Traceroute (`TTL=1`) e Port Unreachable |
| **Fundamentos** | **DHCP** | L7 / L2 | Ciclo completo **DORA** (Discover, Offer, Request, Acknowledge) |
| **Fundamentos** | **IPv6** | L3 Rede | Autoconfiguração SLAAC via Router Solicitation (RS) e Router Advertisement (RA) |
| **Fundamentos** | **BGP** | L7 / L4 | Sessão entre Sistemas Autônomos (OPEN, KEEPALIVE, UPDATE) |
| **Transporte** | **TCP** | L4 Transporte | Handshake 3 vias, perda de segmento com retransmissão e encerramento FIN |
| **Transporte** | **UDP** | L4 Transporte | Envio sem conexão (VoIP/streaming) com pacote perdido sem retransmissão |
| **Transporte** | **QUIC / HTTP/3** | L4 / L7 | Conexão rápida sobre UDP com TLS 1.3 integrado e multiplexação |
| **Aplicação** | **DNS** | L7 Aplicação | Consulta recursiva `A` (porta 53 UDP) e resposta com TTL |
| **Aplicação** | **HTTP** | L7 Aplicação | Requisição `GET /` em texto claro e resposta `200 OK` |
| **Aplicação** | **WebSocket** | L7 Aplicação | Upgrade HTTP `101 Switching Protocols` e troca bidirecional full-duplex |
| **Segurança** | **HTTPS / TLS 1.3** | L6 / L7 | Handshake 1-RTT, troca de chaves e dados criptografados |
| **Segurança** | **SSH** | L7 Aplicação | Negociação criptográfica, autenticação e comandos em túnel seguro |
| **Segurança** | **WireGuard (VPN)** | L3 / L4 | Handshake Noise IK e encapsulamento de tráfego interno em túnel UDP |

---

## Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| `Espaço` | Reproduzir / Pausar simulação |
| `→` / `←` | Avançar / Voltar um passo |
| `R` | Reiniciar simulação atual |
| `1` / `2` / `3` | Alternar entre Topologia, Sequência e Prática |
| `Ctrl+K` | Abrir busca rápida de protocolos |
| `L` | Ocultar / mostrar barra lateral |
| `D` | Alternar modo foco (tela cheia no diagrama) |
| `T` | Alternar tema Claro / Escuro |
| `?` | Abrir janela de atalhos |
| `Esc` | Fechar inspetor de pacotes ou janela aberta |

---

## Tecnologias Utilizadas

- **TypeScript** (modo `strict`)
- **Vite** (servidor de desenvolvimento rápido e build otimizado)
- **SVG nativo + CSS moderno** (zero dependências pesadas de UI em runtime)

---

## Como Instalar e Rodar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) **18+** (ou superior) e `npm`.

### 1. Clonar o repositório
```bash
git clone https://github.com/leandrop2103/netlab-protocol-visualizer.git
cd netlab-protocol-visualizer
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Executar em modo de desenvolvimento
```bash
npm run dev
```
A aplicação ficará disponível em `http://localhost:5173`.

### 4. Gerar build de produção (para hospedar na intranet da empresa)
```bash
npm run build
```
Os arquivos estáticos otimizados serão gerados na pasta `dist/` e podem ser servidos por qualquer servidor web (Nginx, Apache, IIS, GitHub Pages, etc.) ou testados localmente com:
```bash
npm run preview
```

### 5. Verificar tipagem TypeScript
```bash
npm run typecheck
```

---

## Estrutura do Projeto

```text
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── LICENSE
└── src/
    ├── main.ts                 # Controlador principal, estado, atalhos e layout
    ├── types/network.ts        # Tipagens TypeScript dos cenários e pacotes
    ├── engine/frameBuilder.ts  # Codificador/decodificador binário de quadros e checksums
    ├── data/
    │   ├── nodes.ts            # Nós da topologia (Estações, Switch, Gateway, DNS, Internet, etc.)
    │   ├── scenariosCore.ts    # Cenários de fundamentos (IP, Broadcast, Gateway, ICMP, DHCP, IPv6, BGP)
    │   ├── scenariosApp.ts     # Cenários de transporte, aplicação e segurança
    │   └── scenarios.ts        # Catálogo unificado na ordem da trilha de estudos
    ├── ui/
    │   ├── topologyView.ts     # Renderizador SVG da topologia com animações e fan-out
    │   ├── sequenceView.ts     # Diagrama de sequência interativo
    │   ├── packetInspector.ts  # Inspetor de pacotes com hex/ASCII sincronizado
    │   └── practiceMode.ts     # Modo prática com correção automática e gabarito
    └── styles/main.css         # Estilos responsivos (tema escuro e claro)
```

---

## Licença

Este projeto está licenciado sob a **Licença MIT** — consulte o arquivo [LICENSE](./LICENSE) para mais detalhes. Livre para uso interno, educacional e comercial.
