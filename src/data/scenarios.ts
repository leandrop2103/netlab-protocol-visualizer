import type { ProtocolScenario } from '../types/network';
import { CORE_SCENARIOS } from './scenariosCore';
import { APP_SCENARIOS } from './scenariosApp';

export const SCENARIOS: ProtocolScenario[] = [
  // Ordenados em trilha didática para aprendizado na empresa
  ...CORE_SCENARIOS.filter((s) => ['ip', 'broadcast', 'gateway', 'icmp', 'dhcp'].includes(s.id)),
  ...APP_SCENARIOS.filter((s) => ['dns', 'tcp', 'udp', 'http', 'https'].includes(s.id)),
  ...APP_SCENARIOS.filter((s) => ['quic', 'websocket', 'ssh', 'wireguard'].includes(s.id)),
  ...CORE_SCENARIOS.filter((s) => ['ipv6', 'bgp'].includes(s.id)),
];

export const SCENARIO_MAP: Record<string, ProtocolScenario> = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s])
);
