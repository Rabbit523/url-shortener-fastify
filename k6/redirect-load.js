import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  vus: 200,
  duration: '5m',
  thresholds: {
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(99)<20'],
  },
};
const SLUG = __ENV.SLUG || 'yourSlug';
const BASE = __ENV.BASE || 'http://localhost:3000';
export default function () {
  const res = http.get(`${BASE}/${SLUG}`, { redirects: 0 });
  check(res, { 'status 301': (r) => r.status === 301 });
  sleep(0.1);
}
