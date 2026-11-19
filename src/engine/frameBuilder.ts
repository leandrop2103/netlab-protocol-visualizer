import type { DecodedField, DecodedFrame, DecodedLayer, FrameHeaderSpec, PacketTone } from '../types/network';

class ByteWriter {
  readonly bytes: (number | null)[] = [];
  readonly fields: DecodedField[] = [];

  constructor(private readonly layerId: string) {}

  get length(): number {
    return this.bytes.length;
  }

  u8(val: number): this {
    this.bytes.push(val & 0xff);
    return this;
  }

  u16(val: number): this {
    this.bytes.push((val >>> 8) & 0xff, val & 0xff);
    return this;
  }

  u32(val: number): this {
    this.bytes.push((val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
    return this;
  }

  raw(arr: number[]): this {
    for (const b of arr) this.bytes.push(b & 0xff);
    return this;
  }

  ascii(text: string): this {
    const encoded = new TextEncoder().encode(text);
    for (const b of encoded) this.bytes.push(b);
    return this;
  }

  opaque(count: number): this {
    for (let i = 0; i < count; i++) this.bytes.push(null);
    return this;
  }

  field(name: string, value: string, write: () => void, note?: string, encrypted = false): this {
    const from = this.length;
    write();
    this.fields.push({
      name,
      value,
      note,
      from,
      to: this.length,
      layerId: this.layerId,
      encrypted,
    });
    return this;
  }
}

function parseMac(mac: string): number[] {
  return mac.split(':').map((hex) => parseInt(hex, 16) & 0xff);
}

function parseIpv4(ip: string): number[] {
  return ip.split('.').map((octet) => Number(octet) & 0xff);
}

function parseIpv6(ip: string): number[] {
  const [left, right] = ip.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const missing = Math.max(0, 8 - leftParts.length - rightParts.length);
  const full = [...leftParts, ...Array<string>(missing).fill('0'), ...rightParts];
  const out: number[] = [];
  for (const part of full.slice(0, 8)) {
    const n = parseInt(part || '0', 16);
    out.push((n >>> 8) & 0xff, n & 0xff);
  }
  return out;
}

function hex(val: number, width = 4): string {
  return `0x${val.toString(16).padStart(width, '0')}`;
}

/** Calcula checksum de complemento de um (RFC 1071) */
function internetChecksum(bytes: (number | null)[]): number | null {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const hi = bytes[i];
    const lo = i + 1 < bytes.length ? bytes[i + 1] : 0;
    if (hi === null || lo === null) return null;
    sum += (hi << 8) | lo;
  }
  while (sum > 0xffff) {
    sum = (sum & 0xffff) + (sum >>> 16);
  }
  return ~sum & 0xffff;
}

interface BuiltSegment {
  id: string;
  name: string;
  shortName: string;
  tone: PacketTone;
  summary: string;
  writer: ByteWriter;
}

export function buildDecodedFrame(spec: FrameHeaderSpec): DecodedFrame {
  const segments: BuiltSegment[] = [];

  // 1. Camada de Aplicação (construída primeiro para calcular tamanhos das camadas abaixo)
  let appSegment: BuiltSegment | null = null;
  if (spec.app) {
    const w = new ByteWriter('app');
    if (spec.app.encrypted) {
      const len = spec.app.encryptedBytes ?? 48;
      w.field(
        'Carga útil criptografada',
        `${len} bytes cifrados`,
        () => w.opaque(len),
        'Dados protegidos por criptografia; apenas origem e destino possuem a chave para ler.',
        true
      );
      for (const f of spec.app.fields) {
        w.field(f.name, f.value, () => {}, f.note, true);
      }
    } else {
      for (const f of spec.app.fields) {
        const text = f.ascii ?? `${f.name}: ${f.value}\r\n`;
        w.field(f.name, f.value, () => w.ascii(text), f.note);
      }
    }
    appSegment = {
      id: 'app',
      name: `${spec.app.protocolName} · ${w.length} bytes`,
      shortName: spec.app.protocolName,
      tone: spec.app.encrypted ? 'cyan' : 'violet',
      summary: spec.app.summary,
      writer: w,
    };
  }

  // 2. Camada de Transporte ou ICMP
  let l4Segment: BuiltSegment | null = null;
  const appLen = appSegment ? appSegment.writer.length : 0;

  if (spec.tcp) {
    const tcp = spec.tcp;
    const w = new ByteWriter('tcp');
    const flagMap: Record<string, number> = { FIN: 1, SYN: 2, RST: 4, PSH: 8, ACK: 16 };
    const flagBits = tcp.flags.reduce((acc, f) => acc | (flagMap[f] ?? 0), 0);
    const flagsLabel = tcp.flags.join(', ') || 'nenhuma';
    const win = tcp.window ?? 64240;

    w.field('Porta de origem', String(tcp.srcPort), () => w.u16(tcp.srcPort), 'Identifica o processo/soquete no remetente.');
    w.field('Porta de destino', String(tcp.dstPort), () => w.u16(tcp.dstPort), 'Identifica o serviço de destino (ex.: 80 HTTP, 443 HTTPS, 22 SSH).');
    w.field('Número de sequência', `${tcp.seq} (relativo)`, () => w.u32(100000 + tcp.seq), 'Posição do primeiro byte de dados deste segmento no fluxo.');
    w.field('Número de confirmação (ACK)', tcp.flags.includes('ACK') ? `${tcp.ack} (relativo)` : '0 (não usado)', () => w.u32(tcp.flags.includes('ACK') ? 200000 + tcp.ack : 0), 'Próximo byte que este lado espera receber.');
    w.field('Tamanho do cabeçalho', '20 bytes (5 palavras de 32 bits)', () => w.u8(0x50), 'Cabeçalho TCP padrão sem opções extras.');
    w.field('Flags TCP', `${hex(flagBits, 2)} (${flagsLabel})`, () => w.u8(flagBits), 'Controla o estado da conexão (abertura, envio imediato, confirmação ou encerramento).');
    w.field('Janela (Window)', `${win.toLocaleString('pt-BR')} bytes`, () => w.u16(win), 'Espaço disponível no buffer de recepção para controle de fluxo.');
    w.field('Checksum TCP', 'Calculado sobre pseudo-cabeçalho + segmento', () => w.u16(0x4a2f), 'Detecta corrupção no cabeçalho e nos dados.');
    w.field('Ponteiro urgente', '0', () => w.u16(0));

    l4Segment = {
      id: 'tcp',
      name: `TCP · ${w.length} bytes`,
      shortName: 'TCP',
      tone: 'emerald',
      summary: `${tcp.srcPort} → ${tcp.dstPort} [${flagsLabel}]`,
      writer: w,
    };
  } else if (spec.udp) {
    const udp = spec.udp;
    const w = new ByteWriter('udp');
    const totalLen = 8 + appLen;
    w.field('Porta de origem', String(udp.srcPort), () => w.u16(udp.srcPort), 'Porta efêmera ou de serviço do remetente.');
    w.field('Porta de destino', String(udp.dstPort), () => w.u16(udp.dstPort), 'Porta do serviço UDP no destino (ex.: 53 DNS, 67/68 DHCP, 443 QUIC).');
    w.field('Comprimento UDP', `${totalLen} bytes`, () => w.u16(totalLen), 'Soma dos 8 bytes do cabeçalho UDP mais os dados.');
    w.field('Checksum UDP', '0x8b14', () => w.u16(0x8b14), 'Verificação de integridade do datagrama.');

    l4Segment = {
      id: 'udp',
      name: 'UDP · 8 bytes',
      shortName: 'UDP',
      tone: 'emerald',
      summary: `${udp.srcPort} → ${udp.dstPort} (${totalLen} B)`,
      writer: w,
    };
  } else if (spec.icmp) {
    const icmp = spec.icmp;
    const w = new ByteWriter('icmp');
    const typeNames: Record<number, string> = {
      0: 'Echo Reply (Resposta de Ping)',
      3: 'Destination Unreachable (Destino Inalcançável)',
      8: 'Echo Request (Requisição de Ping)',
      11: 'Time Exceeded (TTL expirou no roteador)',
      133: 'Router Solicitation (ICMPv6)',
      134: 'Router Advertisement (ICMPv6)',
    };
    const typeDesc = typeNames[icmp.type] ?? `Tipo ${icmp.type}`;
    w.field('Tipo ICMP', `${icmp.type} — ${typeDesc}`, () => w.u8(icmp.type), 'Define o propósito da mensagem de controle ou diagnóstico.');
    w.field('Código', String(icmp.code), () => w.u8(icmp.code), 'Subtipo que detalha o motivo da mensagem.');
    const cksumIdx = w.length;
    w.field('Checksum ICMP', '', () => w.u16(0), 'Cobre todo o cabeçalho e dados da mensagem ICMP.');
    w.field('Identificador', hex(icmp.identifier ?? 0x0401), () => w.u16(icmp.identifier ?? 0x0401), 'Associa respostas à sessão de ping correta.');
    w.field('Sequência', String(icmp.sequence ?? 1), () => w.u16(icmp.sequence ?? 1), 'Incrementa a cada tentativa para detectar perdas e medir RTT.');
    if (icmp.payloadText) {
      w.field('Dados de teste', `"${icmp.payloadText}" (${icmp.payloadText.length} bytes)`, () => w.ascii(icmp.payloadText!), 'Preenchimento ecoado de volta pelo destino.');
    }
    const cs = internetChecksum(w.bytes) ?? 0;
    w.bytes[cksumIdx] = (cs >>> 8) & 0xff;
    w.bytes[cksumIdx + 1] = cs & 0xff;
    const csField = w.fields.find((f) => f.name === 'Checksum ICMP');
    if (csField) csField.value = hex(cs);

    l4Segment = {
      id: 'icmp',
      name: `ICMP · ${w.length} bytes`,
      shortName: 'ICMP',
      tone: 'amber',
      summary: typeDesc,
      writer: w,
    };
  }

  // 3. Camada de Rede (ARP, IPv4 ou IPv6)
  const ethType = spec.ethType ?? (spec.arp ? 'arp' : spec.ipv6 ? 'ipv6' : 'ipv4');
  let l3Segment: BuiltSegment | null = null;

  if (spec.arp) {
    const arp = spec.arp;
    const w = new ByteWriter('arp');
    w.field('Tipo de hardware', '1 (Ethernet)', () => w.u16(1));
    w.field('Tipo de protocolo', '0x0800 (IPv4)', () => w.u16(0x0800));
    w.field('Tamanhos de endereço', '6 bytes (MAC), 4 bytes (IPv4)', () => w.u8(6).u8(4));
    w.field(
      'Operação',
      arp.operation === 1 ? '1 (Requisição — quem possui este IP?)' : '2 (Resposta — este IP está neste MAC)',
      () => w.u16(arp.operation),
      arp.operation === 1 ? 'Enviado em broadcast para toda a rede local.' : 'Enviado em unicast diretamente para quem perguntou.'
    );
    w.field('MAC remetente', arp.senderMac, () => w.raw(parseMac(arp.senderMac)));
    w.field('IP remetente', arp.senderIp, () => w.raw(parseIpv4(arp.senderIp)));
    w.field('MAC destino', arp.targetMac, () => w.raw(parseMac(arp.targetMac)), arp.operation === 1 ? 'Zerado porque é justamente o endereço que queremos descobrir.' : undefined);
    w.field('IP destino', arp.targetIp, () => w.raw(parseIpv4(arp.targetIp)));

    l3Segment = {
      id: 'arp',
      name: `ARP · 28 bytes`,
      shortName: 'ARP',
      tone: 'amber',
      summary: arp.operation === 1 ? `Quem tem ${arp.targetIp}?` : `${arp.senderIp} está em ${arp.senderMac}`,
      writer: w,
    };
  } else if (spec.ipv4) {
    const ip = spec.ipv4;
    const w = new ByteWriter('ipv4');
    const l4Len = (l4Segment ? l4Segment.writer.length : 0) + appLen;
    const totalLen = 20 + l4Len;
    const protoNames: Record<number, string> = { 1: '1 (ICMP)', 6: '6 (TCP)', 17: '17 (UDP)' };
    const isBroadcastIp = ip.dstIp === '255.255.255.255' || ip.dstIp.endsWith('.255');

    w.field('Versão / IHL', 'IPv4 (4), cabeçalho de 20 bytes', () => w.u8(0x45), 'Versão 4 sem opções adicionais.');
    w.field('DSCP / ECN', '0x00 (tráfego padrão)', () => w.u8(0));
    w.field('Comprimento total', `${totalLen} bytes`, () => w.u16(totalLen), 'Tamanho do cabeçalho IPv4 somado à carga útil.');
    w.field('Identificação', '0x3c91', () => w.u16(0x3c91), 'Usado para remontar pacotes caso ocorra fragmentação.');
    w.field(
      'Flags / Fragmento',
      ip.dontFragment !== false ? 'DF (Não fragmentar)' : '0x0000 (Fragmentação permitida)',
      () => w.u16(ip.dontFragment !== false ? 0x4000 : 0)
    );
    w.field('TTL (Tempo de Vida)', String(ip.ttl), () => w.u8(ip.ttl), 'Decrementado em 1 a cada roteador; evita loops infinitos na rede.');
    w.field('Protocolo encapsulado', protoNames[ip.protocol] ?? String(ip.protocol), () => w.u8(ip.protocol));
    const cksumIdx = w.length;
    w.field('Checksum do cabeçalho', '', () => w.u16(0), 'Recalculado por cada roteador após diminuir o TTL.');
    w.field('IP de origem', ip.srcIp, () => w.raw(parseIpv4(ip.srcIp)));
    w.field(
      'IP de destino',
      isBroadcastIp ? `${ip.dstIp} (Broadcast)` : ip.dstIp,
      () => w.raw(parseIpv4(ip.dstIp)),
      isBroadcastIp ? 'Endereço de difusão: todos os dispositivos na sub-rede recebem este pacote.' : undefined
    );

    const cs = internetChecksum(w.bytes) ?? 0;
    w.bytes[cksumIdx] = (cs >>> 8) & 0xff;
    w.bytes[cksumIdx + 1] = cs & 0xff;
    const csField = w.fields.find((f) => f.name === 'Checksum do cabeçalho');
    if (csField) csField.value = hex(cs);

    l3Segment = {
      id: 'ipv4',
      name: 'IPv4 · 20 bytes',
      shortName: 'IPv4',
      tone: 'blue',
      summary: `${ip.srcIp} → ${ip.dstIp} (TTL ${ip.ttl})`,
      writer: w,
    };
  } else if (spec.ipv6) {
    const ip6 = spec.ipv6;
    const w = new ByteWriter('ipv6');
    const payloadLen = (l4Segment ? l4Segment.writer.length : 0) + appLen;
    const nextNames: Record<number, string> = { 6: '6 (TCP)', 17: '17 (UDP)', 58: '58 (ICMPv6)' };

    w.field('Versão / Classe / Fluxo', 'IPv6 (6), tráfego padrão', () => w.u32(0x60000000));
    w.field('Comprimento da carga', `${payloadLen} bytes`, () => w.u16(payloadLen));
    w.field('Próximo cabeçalho', nextNames[ip6.nextHeader] ?? String(ip6.nextHeader), () => w.u8(ip6.nextHeader));
    w.field('Limite de saltos (Hop Limit)', String(ip6.hopLimit), () => w.u8(ip6.hopLimit), 'Equivalente ao TTL do IPv4.');
    w.field('Endereço IPv6 de origem', ip6.srcIp, () => w.raw(parseIpv6(ip6.srcIp)));
    w.field('Endereço IPv6 de destino', ip6.dstIp, () => w.raw(parseIpv6(ip6.dstIp)));

    l3Segment = {
      id: 'ipv6',
      name: 'IPv6 · 40 bytes',
      shortName: 'IPv6',
      tone: 'blue',
      summary: `${ip6.srcIp} → ${ip6.dstIp}`,
      writer: w,
    };
  }

  // 4. Camada de Enlace — Ethernet II (14 bytes)
  const ethWriter = new ByteWriter('eth');
  const dstMac = spec.ethDstMac ?? (spec.arp?.operation === 1 ? 'ff:ff:ff:ff:ff:ff' : '00:1a:2b:3c:4d:01');
  const srcMac = spec.ethSrcMac ?? '00:1a:2b:3c:4d:10';
  const etherTypeCode = ethType === 'arp' ? 0x0806 : ethType === 'ipv6' ? 0x86dd : 0x0800;
  const etherTypeName = ethType === 'arp' ? '0x0806 (ARP)' : ethType === 'ipv6' ? '0x86dd (IPv6)' : '0x0800 (IPv4)';
  const isBroadcastMac = dstMac.toLowerCase() === 'ff:ff:ff:ff:ff:ff';

  ethWriter.field(
    'MAC de destino',
    isBroadcastMac ? `${dstMac} (Broadcast L2)` : dstMac,
    () => ethWriter.raw(parseMac(dstMac)),
    isBroadcastMac
      ? 'O switch replica este quadro em todas as portas da VLAN/rede local.'
      : 'Endereço físico da próxima interface no enlace local (ex.: placa do Gateway ou host local).'
  );
  ethWriter.field('MAC de origem', srcMac, () => ethWriter.raw(parseMac(srcMac)), 'Placa de rede do dispositivo que transmitiu o quadro.');
  ethWriter.field('EtherType', etherTypeName, () => ethWriter.u16(etherTypeCode), 'Indica qual protocolo da camada superior está encapsulado.');

  segments.push({
    id: 'eth',
    name: 'Ethernet II · 14 bytes',
    shortName: 'Ethernet',
    tone: 'slate',
    summary: `${srcMac} → ${dstMac}`,
    writer: ethWriter,
  });

  if (l3Segment) segments.push(l3Segment);
  if (l4Segment) segments.push(l4Segment);
  if (appSegment) segments.push(appSegment);

  // Combina todas as camadas em um único buffer de bytes com offsets exatos
  const bytes: (number | null)[] = [];
  const layers: DecodedLayer[] = [];
  const fields: DecodedField[] = [];

  for (const seg of segments) {
    const start = bytes.length;
    bytes.push(...seg.writer.bytes);
    const end = bytes.length;
    layers.push({
      id: seg.id,
      name: seg.name,
      shortName: seg.shortName,
      tone: seg.tone,
      from: start,
      to: end,
      summary: seg.summary,
    });
    for (const f of seg.writer.fields) {
      fields.push({
        ...f,
        from: f.from + start,
        to: f.to + start,
      });
    }
  }

  return { bytes, layers, fields };
}
