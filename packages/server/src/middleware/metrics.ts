// Prometheus metrics endpoint for monitoring.
// Exposes /metrics endpoint with application metrics.

let metricsEnabled = false;

interface Metric {
  name: string;
  help: string;
  type: string;
  value: number;
  labels?: Record<string, string>;
}

const metrics: Map<string, Metric> = new Map();

function setMetric(name: string, value: number, help: string = '', type: string = 'gauge') {
  metrics.set(name, { name, help, type, value });
}

function incrementMetric(name: string, help: string = '', type: string = 'counter') {
  const existing = metrics.get(name);
  if (existing) {
    existing.value++;
  } else {
    metrics.set(name, { name, help, type, value: 1 });
  }
}

export function initMetrics() {
  if (metricsEnabled) return;
  metricsEnabled = true;

  // Set initial metrics
  setMetric('companybrain_info', 1, 'Company Brain version info', 'gauge');
  setMetric('companybrain_uptime_seconds', process.uptime(), 'Application uptime in seconds', 'gauge');
  setMetric('companybrain_memory_heap_used_bytes', process.memoryUsage().heapUsed, 'Heap memory used in bytes', 'gauge');
  setMetric('companybrain_memory_rss_bytes', process.memoryUsage().rss, 'Resident Set Size in bytes', 'gauge');

  // Update metrics periodically
  setInterval(() => {
    setMetric('companybrain_uptime_seconds', process.uptime());
    setMetric('companybrain_memory_heap_used_bytes', process.memoryUsage().heapUsed);
    setMetric('companybrain_memory_rss_bytes', process.memoryUsage().rss);
  }, 10000);

  console.log('[metrics] Prometheus metrics initialized');
}

export function recordRequest(method: string, path: string, statusCode: number) {
  incrementMetric('companybrain_http_requests_total', 'Total HTTP requests', 'counter');
  incrementMetric(`companybrain_http_requests_${statusCode}_total`, `HTTP ${statusCode} responses`, 'counter');
  incrementMetric(`companybrain_http_requests_${method}_total`, `HTTP ${method} requests`, 'counter');
}

export function recordLoopCreated() {
  incrementMetric('companybrain_loops_created_total', 'Total loops created', 'counter');
}

export function recordTaskCreated() {
  incrementMetric('companybrain_tasks_created_total', 'Total tasks created', 'counter');
}

export function recordLeadCreated() {
  incrementMetric('companybrain_leads_created_total', 'Total leads created', 'counter');
}

export function renderMetrics(): string {
  const lines: string[] = [];

  lines.push('# HELP companybrain_info Company Brain version info');
  lines.push('# TYPE companybrain_info gauge');
  lines.push('companybrain_info 1');

  lines.push('# HELP companybrain_uptime_seconds Application uptime in seconds');
  lines.push('# TYPE companybrain_uptime_seconds gauge');
  lines.push(`companybrain_uptime_seconds ${process.uptime()}`);

  lines.push('# HELP companybrain_memory_heap_used_bytes Heap memory used in bytes');
  lines.push('# TYPE companybrain_memory_heap_used_bytes gauge');
  lines.push(`companybrain_memory_heap_used_bytes ${process.memoryUsage().heapUsed}`);

  lines.push('# HELP companybrain_memory_rss_bytes Resident Set Size in bytes');
  lines.push('# TYPE companybrain_memory_rss_bytes gauge');
  lines.push(`companybrain_memory_rss_bytes ${process.memoryUsage().rss}`);

  lines.push('# HELP companybrain_http_requests_total Total HTTP requests');
  lines.push('# TYPE companybrain_http_requests_total counter');
  lines.push(`companybrain_http_requests_total ${metrics.get('companybrain_http_requests_total')?.value ?? 0}`);

  lines.push('# HELP companybrain_loops_created_total Total loops created');
  lines.push('# TYPE companybrain_loops_created_total counter');
  lines.push(`companybrain_loops_created_total ${metrics.get('companybrain_loops_created_total')?.value ?? 0}`);

  lines.push('# HELP companybrain_tasks_created_total Total tasks created');
  lines.push('# TYPE companybrain_tasks_created_total counter');
  lines.push(`companybrain_tasks_created_total ${metrics.get('companybrain_tasks_created_total')?.value ?? 0}`);

  lines.push('# HELP companybrain_leads_created_total Total leads created');
  lines.push('# TYPE companybrain_leads_created_total counter');
  lines.push(`companybrain_leads_created_total ${metrics.get('companybrain_leads_created_total')?.value ?? 0}`);

  return lines.join('\n') + '\n';
}
