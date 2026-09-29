import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    smoke_200_users: {
      executor: 'constant-vus',
      vus: 200,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const base = __ENV.BASE_URL;
  if (!base) throw new Error('BASE_URL is required');
  const response = http.get(base + '/');
  check(response, {
    'status 200': (res) => res.status === 200,
    'body present': (res) => Boolean(res.body),
  });
  sleep(1);
}
