export type ProtocolCategory = 'fundamentos' | 'transporte' | 'aplicacao' | 'seguranca';

export type PacketTone = 'blue' | 'emerald' | 'amber' | 'violet' | 'cyan' | 'rose' | 'slate';

export type NodeKind = 'client' | 'hostB' | 'hostC' | 'switch' | 'gateway' | 'dns' | 'internet' | 'server' | 'remote';

export interface NetworkNode {
  id: NodeKind;
  name: string;
  subtitle: string;
  ip: string;
  mac: string;
  x: number; // 0..1000 viewBox
  y: number; // 0..520 viewBox
}

export interface FrameHeaderSpec {
  ethSrcMac?: string;
  ethDstMac?: string;
  ethType?: 'ipv4' | 'ipv6' | 'arp';
  arp?: {
    operation: 1 | 2;
    senderMac: string;
    senderIp: string;
    targetMac: string;
    targetIp: string;
  };
  ipv4?: {
    srcIp: string;
    dstIp: string;
    ttl: number;
    protocol: 1 | 6 | 17; // ICMP=1, TCP=6, UDP=17
    dontFragment?: boolean;
  };
  ipv6?: {
    srcIp: string;
    dstIp: string;
    hopLimit: number;
    nextHeader: 58 | 6 | 17;
  };
  icmp?: {
    type: number;
    code: number;
    identifier?: number;
    sequence?: number;
    payloadText?: string;
  };
  tcp?: {
    srcPort: number;
    dstPort: number;
    seq: number;
    ack: number;
    flags: ('SYN' | 'ACK' | 'PSH' | 'FIN' | 'RST')[];
    window?: number;
  };
  udp?: {
    srcPort: number;
    dstPort: number;
  };
  app?: {
    protocolName: string;
    summary: string;
    encrypted?: boolean;
    encryptedBytes?: number;
    fields: { name: string; value: string; note?: string; ascii?: string }[];
  };
}

export interface PacketEvent {
  id: string;
  from: NodeKind;
  to: NodeKind;
  /** Nós extras atingidos quando o pacote é um Broadcast na LAN */
  broadcastTargets?: NodeKind[];
  /** Caminho explícito de saltos na topologia */
  path: NodeKind[];
  label: string;
  sublabel?: string;
  tone: PacketTone;
  time: string;
  srcAddr: string;
  dstAddr: string;
  protoLabel: string;
  info: string;
  sizeBytes: number;
  encrypted?: boolean;
  lost?: boolean;
  frame: FrameHeaderSpec;
}

export interface ProtocolStep {
  title: string;
  subtitle: string;
  explanation: string;
  facts: [string, string][];
  /** Destaque visual opcional sobre um nó na topologia */
  callout?: {
    node: NodeKind;
    text: string;
    tone: PacketTone;
  };
  packets: PacketEvent[];
}

export interface ProtocolScenario {
  id: string;
  name: string;
  fullName: string;
  category: ProtocolCategory;
  osiLayer: number; // 1..7
  osiLabel: string;
  defaultPort: string;
  transport: string;
  rfc: string;
  description: string;
  nodes: NodeKind[];
  customLabels?: Partial<Record<NodeKind, { name: string; subtitle: string }>>;
  links: [NodeKind, NodeKind][];
  legend: { tone: PacketTone; label: string }[];
  steps: ProtocolStep[];
  summary: {
    title: string;
    text: string;
    facts: [string, string][];
  };
}

export interface DecodedField {
  name: string;
  value: string;
  note?: string;
  from: number;
  to: number;
  layerId: string;
  encrypted?: boolean;
}

export interface DecodedLayer {
  id: string;
  name: string;
  shortName: string;
  tone: PacketTone;
  from: number;
  to: number;
  summary: string;
}

export interface DecodedFrame {
  bytes: (number | null)[];
  layers: DecodedLayer[];
  fields: DecodedField[];
}

export type ViewMode = 'topology' | 'sequence' | 'practice';
export type ProtocolProgressStatus = 'new' | 'progress' | 'done';
