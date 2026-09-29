import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'https://localhost:8444';
const hostHeader = __ENV.HOST_HEADER || 'localhost';

export const options = {
  insecureSkipTLSVerify: __ENV.INSECURE_SKIP_TLS_VERIFY === 'true',
  stages: [
    { duration: '30s', target: 1 },
    { duration: '60s', target: 2 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/status`, {
    headers: { Host: hostHeader },
    tags: { name: 'api_status' },
  });

  check(response, {
    'status endpoint returns 200': (result) => result.status === 200,
  });

  sleep(2);
}
