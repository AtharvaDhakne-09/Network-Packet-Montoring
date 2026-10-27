export type CaptureState = "idle" | "starting" | "running" | "stopping" | "stopped" | "error";

export interface InterfaceInfo {
  id: string;
  name: string;
  description: string;
  network_name: string;
  is_up: boolean;
  is_running: boolean;
  is_loopback: boolean;
  is_wireless: boolean;
  is_connected: boolean;
  addresses: string[];
  ipv4: string[];
  ipv6: string[];
  mac: string | null;
  recommended: boolean;
}

export interface PacketMetadata {
  event_id: string;
  session_id: string;
  timestamp: number;
  src_ip: string | null;
  dst_ip: string | null;
  src_port: number | null;
  dst_port: number | null;
  protocol: string;
  length: number;
  ip_version: number | null;
  tcp_flags: string | null;
  interface: string;
  direction: string | null;
  classification: string;
  flow_id: string | null;
  priority: number;
  priority_reason: string;
}

export interface CaptureSessionInfo {
  session_id: string;
  interface_id: string;
  interface_name: string;
  filter: string;
  status: CaptureState;
  mode: string;
  started_at: number;
  stopped_at: number | null;
  duration: number;
  error: string | null;
  end_reason: string | null;
  retained_packets: number;
  packets_delivered: number;
  packets_ingested: number;
  packets_ignored: number;
  app_queue_dropped: number;
  streamed_packets: number;
  os_packets_received: number | null;
  os_packets_dropped: number | null;
  os_stats_available: boolean;
  max_packets: number;
  max_duration: number;
}

export interface MetricsSnapshot {
  total_packets: number;
  total_bytes: number;
  packets_per_second: number;
  bytes_per_second: number;
  avg_packets_per_second: number;
  avg_bytes_per_second: number;
  protocol_counts: Record<string, number>;
  size_distribution: { bucket: string; count: number }[];
  tcp_count: number;
  udp_count: number;
  icmp_count: number;
  other_count: number;
  unique_ips: number;
  unique_flows: number;
  top_sources: { name: string; value: number }[];
  top_destinations: { name: string; value: number }[];
  top_ports: { name: string; value: number }[];
  top_flows: { name: string; value: number }[];
  series: {
    second: number;
    time: number;
    packets: number;
    bytes: number;
    tcp: number;
    udp: number;
    icmp: number;
    other: number;
  }[];
  first_timestamp: number | null;
  last_timestamp: number | null;
}

export interface HubStats {
  subscribers: number;
  streamed_packets: number;
  dropped_to_clients: number;
  slow_clients: number;
}

export interface CaptureStatus {
  state: CaptureState;
  session: CaptureSessionInfo | null;
  metrics: MetricsSnapshot | null;
  hub: HubStats;
  settings?: Record<string, unknown>;
}

export interface PriorityRule {
  match: "dst_port" | "src_port" | "port" | "protocol" | "classification" | "any";
  value: string;
  priority: number;
  label: string;
  enabled: boolean;
}

export interface AppSettings {
  max_packet_history: number;
  max_capture_duration: number;
  max_capture_packets: number;
  default_filter: string;
  default_capacity: number;
  default_service_rate: number;
  default_rate_mode: "pps" | "bps";
  default_link_rate_mbps: number;
  default_time_scale: number;
  sessions_retained: number;
  chart_refresh_ms: number;
  dashboard_refresh_ms: number;
  animations: boolean;
  priority_rules: PriorityRule[];
}

export interface SettingsResponse {
  settings: AppSettings;
  defaults: AppSettings;
  suggested_priority_rules: PriorityRule[];
  options: {
    rate_modes: string[];
    time_scales: number[];
    priorities: { value: number; label: string }[];
    priority_match_fields: string[];
    bounds: Record<string, [number, number]>;
  };
}

export interface SimulationConfig {
  policy: "fifo" | "priority";
  capacity: number;
  rate_mode: "pps" | "bps";
  service_rate: number;
  link_rate_mbps: number;
  time_scale: number;
  session_id: string | null;
  window: number;
  offset: number;
  priority_rules: PriorityRule[];
  default_priority: number;
  label: string;
}

export interface SimulationMetrics {
  policy: string;
  offered_packets: number;
  accepted_packets: number;
  processed_packets: number;
  dropped_packets: number;
  drop_rate_percent: number;
  still_waiting_packets: number;
  in_service_packets: number;
  average_wait_seconds: number;
  max_wait_seconds: number;
  packet_throughput_pps: number;
  byte_throughput_bps: number;
  processed_bytes: number;
  peak_buffer_utilization_percent: number;
  average_buffer_occupancy: number;
  peak_buffer_occupancy: number;
  buffer_capacity: number;
  server_utilization_percent: number;
  sim_duration_seconds: number;
  accounting_balanced: boolean;
}

export interface QueueSnapshot {
  type: "circular_queue" | "min_heap";
  capacity: number;
  size: number;
  is_empty: boolean;
  is_full: boolean;
  contents?: PacketMetadata[];
  buffer?: { index: number; item: PacketMetadata | null; role: string }[];
  front?: number;
  rear?: number;
  nodes?: {
    index: number;
    priority: number;
    sequence: number;
    parent: number | null;
    left: number | null;
    right: number | null;
    item: PacketMetadata;
  }[];
  highest_priority?: PacketMetadata;
  priority_order?: PacketMetadata[];
  counters: Record<string, number>;
  trace: { op: string; index?: number | null; slot?: number | null; size?: number; priority?: number }[];
  complexity: Record<string, string>;
}

export interface SimulationState {
  sim_id: string;
  status: string;
  paused: boolean;
  config: SimulationConfig;
  source: { session_id: string | null; interface_name: string | null; window: number; offset: number };
  created_at: number;
  error: string | null;
  progress: { offered: number; total: number; sim_time: number; finished: boolean };
  metrics: SimulationMetrics;
  queue: QueueSnapshot | null;
  current_packet: PacketMetadata | null;
  events: {
    type: string;
    event_id: string;
    priority?: number;
    time: number;
    queue_size: number;
    waiting_seconds?: number;
    reason?: string;
  }[];
  trace: { packets: number; first_timestamp: number; last_timestamp: number | null };
}

export interface ComparisonResult {
  trace: { packets: number; capacity: number; rate_mode: string; service_rate: number; link_rate_mbps: number };
  fifo: SimulationMetrics;
  priority: SimulationMetrics;
  explanation: string[];
}

export interface PacketQueryResult {
  session_id: string | null;
  total: number;
  returned: number;
  offset: number;
  limit: number;
  packets: PacketMetadata[];
}
