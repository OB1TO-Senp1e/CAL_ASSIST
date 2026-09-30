const baseUrl = new URL(process.env.PERF_BASE_URL ?? 'http://localhost:3000');
const token = process.env.PERF_TOKEN;
const iterations = Number(process.env.PERF_ITERATIONS ?? 20);

if (!['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) {
  throw new Error('PERF_BASE_URL must point to a local server; remote benchmarking is disabled.');
}

if (!token) {
  throw new Error('Set PERF_TOKEN to a development-user JWT before running the benchmark.');
}

if (!Number.isInteger(iterations) || iterations < 1 || iterations > 500) {
  throw new Error('PERF_ITERATIONS must be an integer from 1 to 500.');
}

const endDate = new Date();
const startDate = new Date(endDate);
startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
const endpoints = [
  `/api/events?startDate=${encodeURIComponent(startDate.toISOString())}&endDate=${encodeURIComponent(endDate.toISOString())}&limit=2000`,
  '/api/calendar/connections',
  '/api/assistant/conversations',
  '/api/assistant/recommendations',
  '/api/assistant/providers/health',
];

function percentile(sortedSamples, p) {
  return sortedSamples[Math.ceil(p * sortedSamples.length) - 1];
}

for (const endpoint of endpoints) {
  const samples = [];

  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    const response = await fetch(new URL(endpoint, baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const durationMs = performance.now() - startedAt;

    if (!response.ok) {
      throw new Error(`${endpoint} returned HTTP ${response.status}; benchmark stopped.`);
    }

    await response.arrayBuffer();
    samples.push(durationMs);
  }

  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({
    endpoint,
    requests: samples.length,
    p50Ms: Number(percentile(samples, 0.5).toFixed(2)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(2)),
  }));
}
