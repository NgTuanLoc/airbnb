// Load test run by the AppHost's k6 resource (start it from the Aspire dashboard). Two scenarios at once:
// guests browse anonymously and record a view of each listing they open (Kafka traffic); members reuse one session of
// the k6 user and read their account and bookings.
import http from "k6/http";
import { check, fail, sleep } from "k6";

const API = __ENV.API_URL;
const K6_USER = { name: "k6 Load Test", email: "k6@perf.test", password: __ENV.K6_USER_PASSWORD };
const JSON_HEADERS = { "Content-Type": "application/json" };
// The `name` tag of every load request. k6's summary breaks a metric down by tag only where a threshold names it,
// so each endpoint gets its own p95 and failure-rate rows.
const ENDPOINTS = [
  "GET /listings",
  "GET /listings/{id}",
  "POST /listings/{id}/views",
  "GET /hosts/{id}",
  "GET /reviews",
  "GET /cities",
  "GET /bookings/availability",
  "GET /auth/me",
  "GET /bookings/mine",
  "GET /bookings/hosting",
];
const perEndpoint = ENDPOINTS.flatMap((name) => [
  [`http_req_duration{name:${name}}`, ["p(95)<500"]],
  [`http_req_failed{name:${name}}`, ["rate<0.01"]],
]);

export const options = {
  scenarios: {
    guests: { executor: "constant-vus", vus: 20, duration: "1m", exec: "guest" },
    members: { executor: "constant-vus", vus: 10, duration: "1m", exec: "member" },
  },
  thresholds: {
    "http_req_duration{scenario:guests}": ["p(95)<500"],
    "http_req_duration{scenario:members}": ["p(95)<500"],
    "http_req_failed{scenario:guests}": ["rate<0.01"],
    "http_req_failed{scenario:members}": ["rate<0.01"],
    ...Object.fromEntries(perEndpoint),
  },
};

// Runs once: the listing ids to browse and the k6 user's token. Logging in per iteration would trip the login throttle.
export function setup() {
  if (!API || !K6_USER.password) fail("API_URL and K6_USER_PASSWORD must be set (the AppHost sets both)");

  const listings = http.get(`${API}/api/listings`).json("data");
  if (!listings?.length) fail("GET /api/listings returned no listings: is the database seeded?");

  return { listings: listings.map((l) => ({ id: l.id, hostId: l.hostId })), token: signIn() };
}

function signIn() {
  const credentials = JSON.stringify({ email: K6_USER.email, password: K6_USER.password });
  let res = http.post(`${API}/api/auth/login`, credentials, {
    headers: JSON_HEADERS,
    responseCallback: http.expectedStatuses(200, 401),
  });
  if (res.status === 401) {
    // First run against this database: create the k6 user.
    res = http.post(`${API}/api/auth/register`, JSON.stringify(K6_USER), { headers: JSON_HEADERS });
  }
  if (res.status !== 200 && res.status !== 201) fail(`k6 user sign-in failed with ${res.status}: ${res.body}`);
  return res.json("data.token");
}

const pick = (items) => items[Math.floor(Math.random() * items.length)]; // NOSONAR: picks test data, not a secret
const ok = (res) => check(res, { "status 200": (r) => r.status === 200 });

export function guest({ listings }) {
  const listing = pick(listings);
  ok(http.get(`${API}/api/listings`, { tags: { name: "GET /listings" } }));
  ok(http.get(`${API}/api/listings/${listing.id}`, { tags: { name: "GET /listings/{id}" } }));
  // What a listing page does in the browser: one view per page, through Kafka into the counts.
  check(http.post(`${API}/api/listings/${listing.id}/views`, null, { tags: { name: "POST /listings/{id}/views" } }), {
    "status 202": (r) => r.status === 202,
  });
  ok(http.get(`${API}/api/hosts/${listing.hostId}`, { tags: { name: "GET /hosts/{id}" } }));
  ok(http.get(`${API}/api/reviews?subjectId=${listing.id}`, { tags: { name: "GET /reviews" } }));
  ok(http.get(`${API}/api/bookings/availability?listingId=${listing.id}`, { tags: { name: "GET /bookings/availability" } }));
  ok(http.get(`${API}/api/cities`, { tags: { name: "GET /cities" } }));
  sleep(1);
}

export function member({ listings, token }) {
  const params = (name) => ({ headers: { Authorization: `Bearer ${token}` }, tags: { name } });
  ok(http.get(`${API}/api/auth/me`, params("GET /auth/me")));
  ok(http.get(`${API}/api/bookings/mine`, params("GET /bookings/mine")));
  ok(http.get(`${API}/api/bookings/hosting`, params("GET /bookings/hosting")));
  ok(http.get(`${API}/api/bookings/availability?listingId=${pick(listings).id}`, params("GET /bookings/availability")));
  sleep(1);
}
