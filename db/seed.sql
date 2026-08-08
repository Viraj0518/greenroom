-- GreenRoom demo seed — DevConf 2026 (see db/seed-notes.md for the fixed-ID map)
-- Apply AFTER migrations: wrangler d1 execute greenroom-db --local --file=db/seed.sql
-- Safe to re-run: clears all rows first (dependency order).

DELETE FROM integrations;
DELETE FROM assets;
DELETE FROM resources;
DELETE FROM speaker_tasks;
DELETE FROM onboarding_tasks;
DELETE FROM emails_log;
DELETE FROM email_templates;
DELETE FROM schedule_slots;
DELETE FROM tracks;
DELETE FROM rooms;
DELETE FROM reviews;
DELETE FROM review_rounds;
DELETE FROM submissions;
DELETE FROM forms;
DELETE FROM speakers;
DELETE FROM sessions_auth;
DELETE FROM users;
DELETE FROM events;

------------------------------------------------------------------------------
-- Event: DevConf 2026 — Oct 6-8, America/Los_Angeles (UTC-7). Times stored UTC.
------------------------------------------------------------------------------
INSERT INTO events (id, name, slug, starts_on, ends_on, timezone, description, created_at) VALUES
('22222222-2222-4222-8222-222222222201', 'DevConf 2026', 'devconf-2026', '2026-10-06', '2026-10-08',
 'America/Los_Angeles',
 'Three days of talks and workshops on AI, web, cloud, and developer experience. Community-run, single track per room, zero fluff.',
 '2026-06-01T17:00:00Z');

------------------------------------------------------------------------------
-- Organizers / reviewers
-- password_hash is a PLACEHOLDER — backend replaces with its real hash format
-- (see seed-notes.md). Demo password intended for all three: demo-greenroom-2026
------------------------------------------------------------------------------
INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES
('11111111-1111-4111-8111-111111111101', 'admin@example.com',      'Alex Rivera', 'PLACEHOLDER_HASH_demo-greenroom-2026', 'admin',    '2026-06-01T17:05:00Z'),
('11111111-1111-4111-8111-111111111102', 'jordan.kim@example.com', 'Jordan Kim',  'PLACEHOLDER_HASH_demo-greenroom-2026', 'reviewer', '2026-06-02T09:00:00Z'),
('11111111-1111-4111-8111-111111111103', 'sam.osei@example.com',   'Sam Osei',    'PLACEHOLDER_HASH_demo-greenroom-2026', 'reviewer', '2026-06-02T09:10:00Z');

------------------------------------------------------------------------------
-- CFP form — exercises conditional logic (showIf) and category→track routing
------------------------------------------------------------------------------
INSERT INTO forms (id, event_id, name, is_open, opens_at, closes_at, spec_json, created_at) VALUES
('33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222201',
 'DevConf 2026 Call for Speakers', 1, '2026-06-05T07:00:00Z', '2026-09-01T06:59:00Z',
 '{"fields":[
    {"id":"title","type":"text","label":"Session title","required":true},
    {"id":"abstract","type":"textarea","label":"Abstract (what will the audience learn?)","required":true},
    {"id":"category","type":"select","label":"Category","required":true,"options":["AI & ML","Web & Frontend","Cloud & Infrastructure","Security","Developer Experience"]},
    {"id":"session_format","type":"select","label":"Session format","required":true,"options":["Talk","Workshop","Panel","Lightning"]},
    {"id":"workshop_duration","type":"select","label":"Workshop duration","required":false,"options":["90 minutes","Half day"],"showIf":{"fieldId":"session_format","op":"eq","value":"Workshop"}},
    {"id":"audience_level","type":"select","label":"Audience level","required":true,"options":["Beginner","Intermediate","Advanced"]},
    {"id":"needs_travel","type":"checkbox","label":"I need travel assistance","required":false},
    {"id":"travel_notes","type":"textarea","label":"Travel notes (where are you coming from?)","required":false,"showIf":{"fieldId":"needs_travel","op":"eq","value":true}}
  ],
  "routing":[
    {"whenCategory":"AI & ML","assignTrack":"AI & Data"},
    {"whenCategory":"Web & Frontend","assignTrack":"Web & Frontend"},
    {"whenCategory":"Cloud & Infrastructure","assignTrack":"Cloud & Infra"},
    {"whenCategory":"Security","assignTrack":"Cloud & Infra"},
    {"whenCategory":"Developer Experience","assignTrack":"Community"}
  ]}',
 '2026-06-04T18:00:00Z');

------------------------------------------------------------------------------
-- Speakers (14) — all example.com, fictional people, fixed magic tokens
------------------------------------------------------------------------------
INSERT INTO speakers (id, event_id, email, name, bio, tagline, company, headshot_key, links_json, magic_token, onboarding_json, created_at) VALUES
('44444444-4444-4444-8444-444444444401', '22222222-2222-4222-8222-222222222201', 'priya.raman@example.com',    'Priya Raman',
 'Priya leads the evaluation platform team at Vector Labs, where she builds the guardrails that keep LLM features honest. Previously she shipped ML infrastructure at two startups that no longer exist, which she considers her best teaching credential.',
 'Making LLM evals boring — in a good way', 'Vector Labs', 'headshots/44444444-4444-4444-8444-444444444401.jpg',
 '{"website":"https://priya.example.com","mastodon":"@priya@example.com"}', 'mtok_s01_9f3a7c1e2b4d', NULL, '2026-06-10T15:12:00Z'),
('44444444-4444-4444-8444-444444444402', '22222222-2222-4222-8222-222222222201', 'jonas.weber@example.com',    'Jonas Weber',
 'Jonas is a performance engineer at Brightline who has spent a decade making other people''s websites faster. He maintains two open-source profiling tools and one strong opinion about hydration.',
 'Frontend performance is a feature', 'Brightline', 'headshots/44444444-4444-4444-8444-444444444402.jpg',
 '{"github":"https://github.com/example-jonas"}', 'mtok_s02_5c8e1a9d3f70', NULL, '2026-06-11T09:30:00Z'),
('44444444-4444-4444-8444-444444444403', '22222222-2222-4222-8222-222222222201', 'amara.diallo@example.com',   'Amara Diallo',
 'Amara is a staff engineer at Nimbus AI shipping retrieval systems that survive contact with production traffic. She writes a widely-shared newsletter on the gap between AI demos and AI products.',
 'Ships RAG systems that survive prod', 'Nimbus AI', 'headshots/44444444-4444-4444-8444-444444444403.jpg',
 '{"newsletter":"https://amara.example.com"}', 'mtok_s03_b2d64e0c7a15', NULL, '2026-06-12T20:45:00Z'),
('44444444-4444-4444-8444-444444444404', '22222222-2222-4222-8222-222222222201', 'diego.fuentes@example.com',  'Diego Fuentes',
 'Diego builds developer tooling at Openfoundry and has run hands-on workshops at a dozen community conferences. He believes the best workshop is the one where the wifi fails and everyone still ships.',
 'Workshops that work offline', 'Openfoundry', NULL,
 NULL, 'mtok_s04_e7a90b3c5d21', NULL, '2026-06-14T11:00:00Z'),
('44444444-4444-4444-8444-444444444405', '22222222-2222-4222-8222-222222222201', 'meiling.chen@example.com',   'Mei-Ling Chen',
 'Mei-Ling is an SRE at Stackhaven who runs SQLite in places her colleagues consider irresponsible. She co-organizes a monthly infra meetup and collects postmortems the way others collect stamps.',
 'Runs databases at the edge, on purpose', 'Stackhaven', 'headshots/44444444-4444-4444-8444-444444444405.jpg',
 '{"blog":"https://meiling.example.com"}', 'mtok_s05_1f4c8d2e6b93', NULL, '2026-06-15T16:20:00Z'),
('44444444-4444-4444-8444-444444444406', '22222222-2222-4222-8222-222222222201', 'tomas.aguilar@example.com',  'Tomás Aguilar',
 'Tomás is a design systems engineer at Pixelforge, where one token file feeds five product brands. He came for the CSS and stayed for the governance meetings.',
 'One design system, five brands, zero forks', 'Pixelforge', NULL,
 NULL, 'mtok_s06_8a2b5f7c0d46', NULL, '2026-06-18T13:05:00Z'),
('44444444-4444-4444-8444-444444444407', '22222222-2222-4222-8222-222222222201', 'nadia.petrova@example.com',  'Nadia Petrova',
 'Nadia leads developer experience at Kernelworks. Her team treats documentation as a product with its own roadmap, analytics, and (controversially) deprecation policy.',
 'Docs are a product, not an afterthought', 'Kernelworks', NULL,
 '{"website":"https://nadia.example.com"}', 'mtok_s07_3d6e9a1b4c78', NULL, '2026-06-20T08:40:00Z'),
('44444444-4444-4444-8444-444444444408', '22222222-2222-4222-8222-222222222201', 'kwame.mensah@example.com',   'Kwame Mensah',
 'Kwame is a data platform architect at Datawright who has strong feelings about paying for twelve managed services when three open-source ones will do. He runs streaming pipelines measured in dollars per month, not thousands.',
 'Streaming pipelines on a shoestring', 'Datawright', NULL,
 NULL, 'mtok_s08_c5f01d8e2a67', NULL, '2026-06-22T19:15:00Z'),
('44444444-4444-4444-8444-444444444409', '22222222-2222-4222-8222-222222222201', 'sofia.lindqvist@example.com','Sofia Lindqvist',
 'Sofia is a platform engineer at Cloudspring building internal developer platforms that engineers actually choose to use. She measures success in unforced adoption.',
 'Platforms people opt into', 'Cloudspring', NULL,
 NULL, 'mtok_s09_7b3a6c9d0e52', NULL, '2026-06-25T10:30:00Z'),
('44444444-4444-4444-8444-444444444410', '22222222-2222-4222-8222-222222222201', 'ravi.patel@example.com',     'Ravi Patel',
 'Ravi is a quality advocate at Testbench and the author of a popular field guide to flaky tests. He has personally apologized to CI for things it did not do.',
 'Your tests are lying to you', 'Testbench', NULL,
 NULL, 'mtok_s10_0e8d4b6f1a39', NULL, '2026-06-28T14:55:00Z'),
('44444444-4444-4444-8444-444444444411', '22222222-2222-4222-8222-222222222201', 'hannah.blum@example.com',    'Hannah Blum',
 'Hannah is a security engineer at SecureLayer who teaches threat modeling to teams with no security headcount. Her workshops famously fit on one whiteboard.',
 'Threat modeling on one whiteboard', 'SecureLayer', NULL,
 NULL, 'mtok_s11_6a1c3e8b5d94', NULL, '2026-07-01T09:05:00Z'),
('44444444-4444-4444-8444-444444444412', '22222222-2222-4222-8222-222222222201', 'lucas.moreau@example.com',   'Lucas Moreau',
 'Lucas works on edge computing at Edgecraft and believes latency budgets should be printed on posters. He has deployed compute to places with more sheep than people.',
 'Compute where your users actually are', 'Edgecraft', NULL,
 NULL, 'mtok_s12_2f7d0a4c8e16', NULL, '2026-07-03T18:22:00Z'),
('44444444-4444-4444-8444-444444444413', '22222222-2222-4222-8222-222222222201', 'yuki.tanaka@example.com',    'Yuki Tanaka',
 'Yuki is an accessibility engineer at Formworks making the case that a11y regressions are performance regressions. They maintain an open-source audit toolkit used by several large e-commerce sites.',
 'Accessibility is a performance metric', 'Formworks', NULL,
 '{"github":"https://github.com/example-yuki"}', 'mtok_s13_9c5b2e7f3a80', NULL, '2026-07-05T12:10:00Z'),
('44444444-4444-4444-8444-444444444414', '22222222-2222-4222-8222-222222222201', 'fatima.zahra@example.com',   'Fatima Zahra',
 'Fatima designs public APIs at Relaybase and has migrated three major API versions without a single angry blog post. She considers that her proudest metric.',
 'API versioning without the tears', 'Relaybase', NULL,
 NULL, 'mtok_s14_4d8f1b6a0c23', NULL, '2026-07-08T15:48:00Z');

------------------------------------------------------------------------------
-- Submissions (18) — statuses: 8 accepted, 3 in_review, 3 submitted,
-- 2 rejected, 1 waitlisted, 1 withdrawn. Tracks follow form routing rules.
------------------------------------------------------------------------------
INSERT INTO submissions (id, event_id, form_id, speaker_id, title, abstract, category, track, answers_json, status, created_at) VALUES
('55555555-5555-4555-8555-555555555501', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444401',
 'Evals or It Didn''t Happen: Shipping Reliable LLM Features',
 'Demos are easy; dependable LLM features are not. This talk walks through building an evaluation harness that catches regressions before your users do — golden sets, rubric scoring, and the organizational tricks that make teams actually run them.',
 'AI & ML', 'AI & Data',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":false}', 'accepted', '2026-06-16T21:30:00Z'),
('55555555-5555-4555-8555-555555555502', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444402',
 'The 100ms Budget: Web Performance as a Feature',
 'What actually moves the needle on Core Web Vitals in 2026? A tour of real regressions, real fixes, and a budgeting workflow that keeps a five-team frontend under 100ms of scripting on mid-range phones.',
 'Web & Frontend', 'Web & Frontend',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":true,"travel_notes":"Flying in from Berlin, arriving Oct 5."}', 'accepted', '2026-06-17T10:05:00Z'),
('55555555-5555-4555-8555-555555555503', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444403',
 'RAG in Production: What Breaks After the Demo',
 'Retrieval-augmented generation looks solved until real users arrive. Chunking that fights your domain, embeddings that drift, evals nobody runs — this talk covers the six failure modes we hit in production and the fixes that held.',
 'AI & ML', 'AI & Data',
 '{"session_format":"Talk","audience_level":"Advanced","needs_travel":false}', 'accepted', '2026-06-19T14:12:00Z'),
('55555555-5555-4555-8555-555555555504', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444404',
 'Hands-On: Building an Eval Harness in 90 Minutes',
 'Bring a laptop. We start from an empty repo and leave with a working evaluation harness for an LLM feature: golden dataset, scoring rubric, CI gate, and a dashboard. All open source, all runnable offline.',
 'AI & ML', 'AI & Data',
 '{"session_format":"Workshop","workshop_duration":"90 minutes","audience_level":"Intermediate","needs_travel":false}', 'accepted', '2026-06-21T08:55:00Z'),
('55555555-5555-4555-8555-555555555505', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444405',
 'SQLite at the Edge: Patterns for D1 in Production',
 'SQLite has quietly become a serious production database at the edge. Migration discipline, read-replica patterns, batch writes, and the sharp edges we found running D1 under real traffic — with numbers.',
 'Cloud & Infrastructure', 'Cloud & Infra',
 '{"session_format":"Talk","audience_level":"Advanced","needs_travel":false}', 'accepted', '2026-06-23T17:40:00Z'),
('55555555-5555-4555-8555-555555555506', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444406',
 'Design Tokens That Scale: One System, Five Brands',
 'How we serve five product brands from one design system without forking: token architecture, theming contracts, visual regression gates, and the governance model that keeps designers and engineers out of each other''s hair.',
 'Web & Frontend', 'Web & Frontend',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":false}', 'accepted', '2026-06-24T12:18:00Z'),
('55555555-5555-4555-8555-555555555507', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444407',
 'Docs as a Product: DX Beyond the README',
 'We gave our documentation a roadmap, analytics, and a support rotation — and support tickets dropped 40%. A practical playbook for treating docs as a product, including what we measure and what we stopped writing.',
 'Developer Experience', 'Community',
 '{"session_format":"Talk","audience_level":"Beginner","needs_travel":true,"travel_notes":"Coming from Sofia via LHR."}', 'accepted', '2026-06-26T09:02:00Z'),
('55555555-5555-4555-8555-555555555508', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444408',
 'Streaming Pipelines on a Budget',
 'You do not need a six-figure data stack. We replaced a managed streaming platform with open-source parts and a monthly bill under $200 — architecture, trade-offs, the two outages it cost us, and why we would do it again.',
 'Cloud & Infrastructure', 'Cloud & Infra',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":false}', 'accepted', '2026-06-27T22:11:00Z'),
('55555555-5555-4555-8555-555555555509', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444409',
 'Platform Teams Are Product Teams',
 'Internal platforms fail when they are mandated and thrive when they are chosen. How we run our platform team with user interviews, adoption funnels, and a real deprecation policy — and what changed when we did.',
 'Developer Experience', 'Community',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":false}', 'in_review', '2026-07-02T11:26:00Z'),
('55555555-5555-4555-8555-555555555510', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444410',
 'Flaky Tests: A Field Guide',
 'A taxonomy of test flakiness drawn from 40,000 CI runs: timing, isolation, ordering, and infrastructure flakes, how to detect each class automatically, and the quarantine workflow that got our main branch back to green.',
 'Developer Experience', 'Community',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":false}', 'in_review', '2026-07-04T16:33:00Z'),
('55555555-5555-4555-8555-555555555511', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444411',
 'Threat Modeling for Busy Teams',
 'Security reviews that fit in a sprint: a one-whiteboard threat modeling method your team can run without a security specialist, plus the top five findings it surfaces in almost every codebase.',
 'Security', 'Cloud & Infra',
 '{"session_format":"Talk","audience_level":"Beginner","needs_travel":false}', 'in_review', '2026-07-06T19:47:00Z'),
('55555555-5555-4555-8555-555555555512', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444412',
 'Compute at the Edge: Beyond CDNs',
 'Edge compute is more than cached HTML. Patterns for stateful edge apps — session affinity, regional consistency, and the physics you cannot negotiate with — illustrated with latency maps from three continents.',
 'Cloud & Infrastructure', 'Cloud & Infra',
 '{"session_format":"Talk","audience_level":"Advanced","needs_travel":true,"travel_notes":"From Lyon; can also do a remote backup slot."}', 'submitted', '2026-07-10T13:59:00Z'),
('55555555-5555-4555-8555-555555555513', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444413',
 'Accessibility Is a Performance Metric',
 'Screen reader time-to-content is a latency number, and it is probably terrible. How to measure a11y like you measure performance, wire it into CI, and stop shipping regressions you cannot see.',
 'Web & Frontend', 'Web & Frontend',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":false}', 'submitted', '2026-07-12T08:14:00Z'),
('55555555-5555-4555-8555-555555555514', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444414',
 'API Versioning Without Tears',
 'Three major API versions, zero angry blog posts. The compatibility contract, sunset tooling, and communication cadence that made breaking changes boring — and the one migration we still regret.',
 'Developer Experience', 'Community',
 '{"session_format":"Talk","audience_level":"Intermediate","needs_travel":false}', 'submitted', '2026-07-15T20:26:00Z'),
('55555555-5555-4555-8555-555555555515', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444401',
 'Lightning: My Favorite Regex',
 'Five minutes, one regular expression, an unreasonable amount of enthusiasm. A love letter to the pattern that saved our log pipeline.',
 'Developer Experience', 'Community',
 '{"session_format":"Lightning","audience_level":"Beginner","needs_travel":false}', 'rejected', '2026-06-18T23:41:00Z'),
('55555555-5555-4555-8555-555555555516', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444405',
 'Kubernetes for Toasters: Overengineering as a Lifestyle',
 'A satirical retrospective on the year we ran a 40-node cluster for a static site. Includes real invoices.',
 'Cloud & Infrastructure', 'Cloud & Infra',
 '{"session_format":"Talk","audience_level":"Beginner","needs_travel":false}', 'rejected', '2026-06-25T15:09:00Z'),
('55555555-5555-4555-8555-555555555517', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444403',
 'Vector DB Bake-Off 2026',
 'Seven vector databases, one workload, no sponsorships. Ingest speed, recall, cost per million queries, and operational sharp edges — benchmarked in the open with a reproducible harness.',
 'AI & ML', 'AI & Data',
 '{"session_format":"Talk","audience_level":"Advanced","needs_travel":false}', 'waitlisted', '2026-07-01T17:53:00Z'),
('55555555-5555-4555-8555-555555555518', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301', '44444444-4444-4444-8444-444444444406',
 'CSS in 2026: The Good Parts',
 'Container queries, :has(), view transitions, and the features that finally let us delete our JavaScript. Withdrawn — speaker schedule conflict.',
 'Web & Frontend', 'Web & Frontend',
 '{"session_format":"Talk","audience_level":"Beginner","needs_travel":false}', 'withdrawn', '2026-07-07T10:37:00Z');

------------------------------------------------------------------------------
-- Review rounds (2) + reviews (round 1 closed w/ scores incl. AI; round 2 open, partial)
------------------------------------------------------------------------------
INSERT INTO review_rounds (id, event_id, name, round_no, rubric_json, is_open) VALUES
('66666666-6666-4666-8666-666666666601', '22222222-2222-4222-8222-222222222201', 'Round 1 — Initial screening', 1,
 '{"criteria":[{"key":"relevance","label":"Relevance to audience","max":5},{"key":"clarity","label":"Clarity of abstract","max":5},{"key":"novelty","label":"Novelty","max":5}]}', 0),
('66666666-6666-4666-8666-666666666602', '22222222-2222-4222-8222-222222222201', 'Round 2 — Program committee', 2,
 '{"criteria":[{"key":"depth","label":"Technical depth","max":5},{"key":"delivery","label":"Speaker experience / delivery","max":5},{"key":"fit","label":"Program fit","max":5}]}', 1);

INSERT INTO reviews (id, round_id, submission_id, reviewer_id, scores_json, comment, ai, created_at) VALUES
-- Round 1 (closed)
('77777777-7777-4777-8777-777777777701', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111102', '{"relevance":5,"clarity":5,"novelty":4}', 'Exactly the pragmatic AI content our audience asks for. Strong keynote candidate.', 0, '2026-07-18T10:00:00Z'),
('77777777-7777-4777-8777-777777777702', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111103', '{"relevance":5,"clarity":4,"novelty":4}', 'Clear, battle-tested, opinionated. Yes.', 0, '2026-07-18T14:30:00Z'),
('77777777-7777-4777-8777-777777777703', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555502', '11111111-1111-4111-8111-111111111102', '{"relevance":4,"clarity":4,"novelty":3}', 'Perf talks always rate well; the budgeting workflow angle is fresh enough.', 0, '2026-07-18T10:20:00Z'),
('77777777-7777-4777-8777-777777777704', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555503', '11111111-1111-4111-8111-111111111103', '{"relevance":5,"clarity":4,"novelty":5}', 'Failure-mode catalogs beat success stories. Advanced track anchor.', 0, '2026-07-18T15:00:00Z'),
('77777777-7777-4777-8777-777777777705', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555504', '11111111-1111-4111-8111-111111111102', '{"relevance":4,"clarity":5,"novelty":4}', 'Offline-capable workshop, experienced instructor. Book Workshop A.', 0, '2026-07-19T09:10:00Z'),
('77777777-7777-4777-8777-777777777706', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555505', '11111111-1111-4111-8111-111111111103', '{"relevance":4,"clarity":4,"novelty":4}', 'Numbers-driven and directly relevant to our own stack. Accept.', 0, '2026-07-19T09:40:00Z'),
('77777777-7777-4777-8777-777777777707', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555506', '11111111-1111-4111-8111-111111111102', '{"relevance":4,"clarity":3,"novelty":4}', 'Governance section could drag; asked speaker to tighten. Otherwise solid.', 0, '2026-07-19T10:05:00Z'),
('77777777-7777-4777-8777-777777777708', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555507', '11111111-1111-4111-8111-111111111103', '{"relevance":4,"clarity":4,"novelty":4}', '40% ticket drop is a great hook. Beginner-friendly, good for day 2 morning.', 0, '2026-07-19T11:22:00Z'),
('77777777-7777-4777-8777-777777777709', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555508', '11111111-1111-4111-8111-111111111102', '{"relevance":3,"clarity":4,"novelty":4}', 'Budget angle is refreshing. Wants real invoice numbers on slides.', 0, '2026-07-19T13:45:00Z'),
('77777777-7777-4777-8777-777777777710', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555509', '11111111-1111-4111-8111-111111111103', '{"relevance":3,"clarity":3,"novelty":3}', 'Good but crowded topic this year. Hold for round 2 discussion.', 0, '2026-07-20T09:00:00Z'),
('77777777-7777-4777-8777-777777777711', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555510', 'ai', '{"relevance":4,"clarity":4,"novelty":3}', 'AI-assisted review: Well-structured proposal grounded in a large dataset (40k CI runs). Taxonomy framing is clear and actionable. Novelty moderate — flaky-test talks are common, but the automatic classification angle differentiates it.', 1, '2026-07-20T09:30:00Z'),
('77777777-7777-4777-8777-777777777712', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555511', 'ai', '{"relevance":4,"clarity":5,"novelty":3}', 'AI-assisted review: Tightly scoped and beginner-accessible. The one-whiteboard constraint is a memorable hook. Overlaps slightly with prior-year security content; recommend human review for program fit.', 1, '2026-07-20T09:31:00Z'),
('77777777-7777-4777-8777-777777777713', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555515', '11111111-1111-4111-8111-111111111102', '{"relevance":2,"clarity":3,"novelty":2}', 'Charming but we cut lightning talks this year.', 0, '2026-07-20T10:15:00Z'),
('77777777-7777-4777-8777-777777777714', '66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555516', '11111111-1111-4111-8111-111111111103', '{"relevance":2,"clarity":4,"novelty":2}', 'Funny, but satire ages badly on a program. Pass.', 0, '2026-07-20T10:40:00Z'),
-- Round 2 (open, partial)
('77777777-7777-4777-8777-777777777715', '66666666-6666-4666-8666-666666666602', '55555555-5555-4555-8555-555555555501', '11111111-1111-4111-8111-111111111102', '{"depth":5,"delivery":4,"fit":5}', 'Confirmed keynote. Priya presented at two majors last year; delivery is safe.', 0, '2026-07-26T09:12:00Z'),
('77777777-7777-4777-8777-777777777716', '66666666-6666-4666-8666-666666666602', '55555555-5555-4555-8555-555555555502', '11111111-1111-4111-8111-111111111103', '{"depth":4,"delivery":4,"fit":4}', 'Main hall material.', 0, '2026-07-26T09:50:00Z'),
('77777777-7777-4777-8777-777777777717', '66666666-6666-4666-8666-666666666602', '55555555-5555-4555-8555-555555555503', '11111111-1111-4111-8111-111111111102', '{"depth":5,"delivery":4,"fit":5}', 'Pairs perfectly with the eval workshop — schedule same day.', 0, '2026-07-26T10:30:00Z'),
('77777777-7777-4777-8777-777777777718', '66666666-6666-4666-8666-666666666602', '55555555-5555-4555-8555-555555555504', 'ai', '{"depth":4,"delivery":4,"fit":5}', 'AI-assisted review: Hands-on format complements the two accepted AI talks without overlap. Materials are open source and offline-capable, reducing venue risk. Recommend 90-minute slot in a workshop room.', 1, '2026-07-26T11:00:00Z');

------------------------------------------------------------------------------
-- Rooms (4) & tracks (4)
------------------------------------------------------------------------------
INSERT INTO rooms (id, event_id, name, capacity, sort) VALUES
('88888888-8888-4888-8888-888888888801', '22222222-2222-4222-8222-222222222201', 'Main Hall',  400, 1),
('88888888-8888-4888-8888-888888888802', '22222222-2222-4222-8222-222222222201', 'Workshop A',  60, 2),
('88888888-8888-4888-8888-888888888803', '22222222-2222-4222-8222-222222222201', 'Studio B',   120, 3),
('88888888-8888-4888-8888-888888888804', '22222222-2222-4222-8222-222222222201', 'Terrace',     80, 4);

INSERT INTO tracks (id, event_id, name, color, sort) VALUES
('99999999-9999-4999-8999-999999999901', '22222222-2222-4222-8222-222222222201', 'AI & Data',      '#7c5cff', 1),
('99999999-9999-4999-8999-999999999902', '22222222-2222-4222-8222-222222222201', 'Web & Frontend', '#0ea5e9', 2),
('99999999-9999-4999-8999-999999999903', '22222222-2222-4222-8222-222222222201', 'Cloud & Infra',  '#10b981', 3),
('99999999-9999-4999-8999-999999999904', '22222222-2222-4222-8222-222222222201', 'Community',      '#f59e0b', 4);

------------------------------------------------------------------------------
-- Schedule — partially built, deliberately CONFLICT-FREE.
-- Local 9:00 PDT = 16:00 UTC. Unscheduled accepted talks left for the demo:
-- sub 07 (Docs as a Product) and sub 08 (Streaming Pipelines) — drag these in live.
------------------------------------------------------------------------------
INSERT INTO schedule_slots (id, event_id, submission_id, room_id, track_id, title, starts_at, ends_at, kind) VALUES
-- Day 1 — Tue Oct 6
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', '22222222-2222-4222-8222-222222222201', '55555555-5555-4555-8555-555555555501', '88888888-8888-4888-8888-888888888801', '99999999-9999-4999-8999-999999999901', NULL, '2026-10-06T16:00:00Z', '2026-10-06T16:45:00Z', 'keynote'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', '22222222-2222-4222-8222-222222222201', NULL, NULL, NULL, 'Coffee & Hallway Track', '2026-10-06T16:45:00Z', '2026-10-06T17:15:00Z', 'break'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', '22222222-2222-4222-8222-222222222201', '55555555-5555-4555-8555-555555555502', '88888888-8888-4888-8888-888888888801', '99999999-9999-4999-8999-999999999902', NULL, '2026-10-06T17:15:00Z', '2026-10-06T18:00:00Z', 'talk'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', '22222222-2222-4222-8222-222222222201', '55555555-5555-4555-8555-555555555503', '88888888-8888-4888-8888-888888888803', '99999999-9999-4999-8999-999999999901', NULL, '2026-10-06T17:15:00Z', '2026-10-06T18:00:00Z', 'talk'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05', '22222222-2222-4222-8222-222222222201', '55555555-5555-4555-8555-555555555504', '88888888-8888-4888-8888-888888888802', '99999999-9999-4999-8999-999999999901', NULL, '2026-10-06T18:15:00Z', '2026-10-06T19:45:00Z', 'talk'),
-- Day 2 — Wed Oct 7
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06', '22222222-2222-4222-8222-222222222201', '55555555-5555-4555-8555-555555555505', '88888888-8888-4888-8888-888888888801', '99999999-9999-4999-8999-999999999903', NULL, '2026-10-07T16:00:00Z', '2026-10-07T16:45:00Z', 'talk'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07', '22222222-2222-4222-8222-222222222201', '55555555-5555-4555-8555-555555555506', '88888888-8888-4888-8888-888888888803', '99999999-9999-4999-8999-999999999902', NULL, '2026-10-07T16:00:00Z', '2026-10-07T16:45:00Z', 'talk'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa08', '22222222-2222-4222-8222-222222222201', NULL, NULL, NULL, 'Lunch', '2026-10-07T19:00:00Z', '2026-10-07T20:00:00Z', 'break'),
-- Day 3 — Thu Oct 8
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa09', '22222222-2222-4222-8222-222222222201', NULL, '88888888-8888-4888-8888-888888888801', NULL, 'Closing Remarks & Community Awards', '2026-10-08T17:00:00Z', '2026-10-08T17:30:00Z', 'keynote');

------------------------------------------------------------------------------
-- Email templates + a believable send log
------------------------------------------------------------------------------
INSERT INTO email_templates (id, event_id, key, name, subject, body_md) VALUES
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', '22222222-2222-4222-8222-222222222201', 'accepted', 'Acceptance', 'You''re speaking at {{event_name}}! 🎉',
 'Hi {{name}},

Great news — **{{submission_title}}** has been accepted for {{event_name}}!

Next steps:

1. Open your speaker portal: {{portal_url}}
2. Complete your onboarding checklist (bio, headshot, slides, AV form)
3. Watch for your schedule slot — we''ll email you when the agenda goes live

We can''t wait to have you on stage.

— The {{event_name}} team'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', '22222222-2222-4222-8222-222222222201', 'rejected', 'Rejection', 'Your {{event_name}} submission',
 'Hi {{name}},

Thank you for submitting **{{submission_title}}** to {{event_name}}. We received far more strong proposals than we have slots, and we''re sorry to say we can''t include this one.

We''d genuinely love to see you submit again next year — and your attendee discount code is {{discount_code}}.

— The {{event_name}} team'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', '22222222-2222-4222-8222-222222222201', 'reminder', 'Onboarding reminder', 'Action needed for {{event_name}}: {{task_label}}',
 'Hi {{name}},

A quick reminder that **{{task_label}}** is still outstanding on your speaker checklist (due {{due_date}}).

It takes about five minutes in your portal: {{portal_url}}

Thanks!

— The {{event_name}} team'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb04', '22222222-2222-4222-8222-222222222201', 'schedule_live', 'Schedule live', 'Your {{event_name}} schedule is live 📅',
 'Hi {{name}},

The {{event_name}} agenda is live! You''re on at **{{slot_time}}** in **{{room_name}}**.

Your calendar invite is attached (or add it here: {{ics_url}}).

Review your session details in the portal: {{portal_url}} — and tell us within 48h if anything looks wrong.

— The {{event_name}} team');

INSERT INTO emails_log (id, event_id, speaker_id, template_key, subject, status, provider, created_at) VALUES
('cccccccc-cccc-4ccc-8ccc-cccccccccc01', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444401', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:00Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc02', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444402', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:01Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc03', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444403', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:02Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc04', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444404', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:03Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc05', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444405', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:04Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc06', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444406', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:05Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc07', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444407', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:06Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc08', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444408', 'accepted', 'You''re speaking at DevConf 2026! 🎉', 'sent', 'console', '2026-07-22T16:02:07Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc09', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444401', 'rejected', 'Your DevConf 2026 submission', 'sent', 'console', '2026-07-22T16:10:00Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc10', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444405', 'rejected', 'Your DevConf 2026 submission', 'sent', 'console', '2026-07-22T16:10:01Z'),
('cccccccc-cccc-4ccc-8ccc-cccccccccc11', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444406', 'reminder', 'Action needed for DevConf 2026: Upload your headshot', 'sent', 'console', '2026-08-01T17:00:00Z');

------------------------------------------------------------------------------
-- Onboarding tasks + per-speaker completion (accepted speakers, mixed states)
------------------------------------------------------------------------------
INSERT INTO onboarding_tasks (id, event_id, key, label, due_at, required) VALUES
('dddddddd-dddd-4ddd-8ddd-dddddddddd01', '22222222-2222-4222-8222-222222222201', 'bio',      'Complete your bio & tagline',   '2026-09-15T06:59:00Z', 1),
('dddddddd-dddd-4ddd-8ddd-dddddddddd02', '22222222-2222-4222-8222-222222222201', 'headshot', 'Upload your headshot',          '2026-09-15T06:59:00Z', 1),
('dddddddd-dddd-4ddd-8ddd-dddddddddd03', '22222222-2222-4222-8222-222222222201', 'slides',   'Upload your slides',            '2026-10-02T06:59:00Z', 0),
('dddddddd-dddd-4ddd-8ddd-dddddddddd04', '22222222-2222-4222-8222-222222222201', 'av_form',  'Submit AV & stage requirements','2026-09-22T06:59:00Z', 1);

INSERT INTO speaker_tasks (id, speaker_id, task_key, done, done_at) VALUES
-- s01 Priya: everything done (the model speaker)
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', '44444444-4444-4444-8444-444444444401', 'bio',      1, '2026-07-23T09:00:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', '44444444-4444-4444-8444-444444444401', 'headshot', 1, '2026-07-23T09:05:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', '44444444-4444-4444-8444-444444444401', 'slides',   1, '2026-08-05T18:20:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', '44444444-4444-4444-8444-444444444401', 'av_form',  1, '2026-07-23T09:10:00Z'),
-- s02 Jonas: bio + headshot
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05', '44444444-4444-4444-8444-444444444402', 'bio',      1, '2026-07-24T11:00:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee06', '44444444-4444-4444-8444-444444444402', 'headshot', 1, '2026-07-24T11:04:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee07', '44444444-4444-4444-8444-444444444402', 'slides',   0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee08', '44444444-4444-4444-8444-444444444402', 'av_form',  0, NULL),
-- s03 Amara: bio + headshot
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee09', '44444444-4444-4444-8444-444444444403', 'bio',      1, '2026-07-25T14:30:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee10', '44444444-4444-4444-8444-444444444403', 'headshot', 1, '2026-07-25T14:33:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee11', '44444444-4444-4444-8444-444444444403', 'slides',   0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee12', '44444444-4444-4444-8444-444444444403', 'av_form',  0, NULL),
-- s04 Diego: bio only
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee13', '44444444-4444-4444-8444-444444444404', 'bio',      1, '2026-07-28T08:15:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee14', '44444444-4444-4444-8444-444444444404', 'headshot', 0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee15', '44444444-4444-4444-8444-444444444404', 'slides',   0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee16', '44444444-4444-4444-8444-444444444404', 'av_form',  0, NULL),
-- s05 Mei-Ling: bio + headshot + AV
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee17', '44444444-4444-4444-8444-444444444405', 'bio',      1, '2026-07-26T19:45:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee18', '44444444-4444-4444-8444-444444444405', 'headshot', 1, '2026-07-26T19:50:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee19', '44444444-4444-4444-8444-444444444405', 'slides',   0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee20', '44444444-4444-4444-8444-444444444405', 'av_form',  1, '2026-07-26T19:55:00Z'),
-- s06 Tomás: nothing yet (drives "overdue" UI + the reminder email above)
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee21', '44444444-4444-4444-8444-444444444406', 'bio',      0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee22', '44444444-4444-4444-8444-444444444406', 'headshot', 0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee23', '44444444-4444-4444-8444-444444444406', 'slides',   0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee24', '44444444-4444-4444-8444-444444444406', 'av_form',  0, NULL),
-- s07 Nadia: bio only
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee25', '44444444-4444-4444-8444-444444444407', 'bio',      1, '2026-07-30T07:30:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee26', '44444444-4444-4444-8444-444444444407', 'headshot', 0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee27', '44444444-4444-4444-8444-444444444407', 'slides',   0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee28', '44444444-4444-4444-8444-444444444407', 'av_form',  0, NULL),
-- s08 Kwame: bio + AV
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee29', '44444444-4444-4444-8444-444444444408', 'bio',      1, '2026-08-02T21:10:00Z'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee30', '44444444-4444-4444-8444-444444444408', 'headshot', 0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee31', '44444444-4444-4444-8444-444444444408', 'slides',   0, NULL),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeee32', '44444444-4444-4444-8444-444444444408', 'av_form',  1, '2026-08-02T21:14:00Z');

------------------------------------------------------------------------------
-- Resources (3) — one with embed_html, one internal-only
------------------------------------------------------------------------------
INSERT INTO resources (id, event_id, title, slug, body_md, embed_html, is_public, sort, updated_at) VALUES
('ffffffff-ffff-4fff-8fff-ffffffffff01', '22222222-2222-4222-8222-222222222201', 'Speaker Guide', 'speaker-guide',
 '# Speaker Guide

Welcome to DevConf 2026! Everything you need, in one page.

## Timeline
- **Sep 15** — bio & headshot due
- **Sep 22** — AV form due
- **Oct 2** — slides due (optional but appreciated)
- **Oct 6-8** — showtime

## Talk logistics
Talks are **45 minutes** including Q&A. Workshops are 90 minutes in Workshop A. We record everything in the Main Hall and Studio B; recordings are published under CC BY-SA within two weeks.

## The green room
The actual green room (we appreciate the irony) is behind the Main Hall stage. Coffee, quiet, and a tech check station from 8:00 each morning.',
 NULL, 1, 1, '2026-07-20T18:00:00Z'),
('ffffffff-ffff-4fff-8fff-ffffffffff02', '22222222-2222-4222-8222-222222222201', 'Venue Map & AV Specs', 'venue-av',
 '# Venue Map & AV Specs

**Venue:** Fort Mason Center, San Francisco (map below).

## AV at a glance
- HDMI + USB-C at every lectern; 16:9, 1080p projection
- Lapel and handheld mics in every room; Countryman available on request
- Confidence monitors in Main Hall and Studio B
- Wifi: dedicated speaker SSID, wired uplink at the lectern on request

Fill in the AV form in your portal so we can preload your setup.',
 '<iframe width="100%" height="380" frameborder="0" scrolling="no" src="https://www.openstreetmap.org/export/embed.html?bbox=-122.4360%2C37.8030%2C-122.4240%2C37.8090&amp;layer=mapnik&amp;marker=37.8060%2C-122.4300" title="Venue map"></iframe>',
 1, 2, '2026-07-21T15:30:00Z'),
('ffffffff-ffff-4fff-8fff-ffffffffff03', '22222222-2222-4222-8222-222222222201', 'Program Committee Handbook', 'pc-handbook',
 '# Program Committee Handbook (internal)

## Review principles
Score the *proposal*, not the person. Two human reviews per submission in round 1; AI-assisted reviews are advisory and always marked as such.

## Rubric anchors
- **5** — would personally rearrange my schedule to see this
- **3** — solid, would fill a room
- **1** — does not fit this event

## Conflicts of interest
Recuse yourself from submissions by current or recent colleagues; note the recusal in the round notes.',
 NULL, 0, 3, '2026-07-15T09:00:00Z');

------------------------------------------------------------------------------
-- Assets — consistent with headshot_key on speakers + done speaker_tasks
------------------------------------------------------------------------------
INSERT INTO assets (id, event_id, speaker_id, submission_id, kind, r2_key, filename, content_type, size, created_at) VALUES
('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a501', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444401', NULL, 'headshot', 'headshots/44444444-4444-4444-8444-444444444401.jpg', 'priya-raman.jpg', 'image/jpeg', 182034, '2026-07-23T09:05:00Z'),
('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a502', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444402', NULL, 'headshot', 'headshots/44444444-4444-4444-8444-444444444402.jpg', 'jonas-weber.jpg', 'image/jpeg', 240117, '2026-07-24T11:04:00Z'),
('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a503', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444403', NULL, 'headshot', 'headshots/44444444-4444-4444-8444-444444444403.jpg', 'amara-diallo.jpg', 'image/jpeg', 199522, '2026-07-25T14:33:00Z'),
('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a504', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444405', NULL, 'headshot', 'headshots/44444444-4444-4444-8444-444444444405.jpg', 'meiling-chen.jpg', 'image/jpeg', 175880, '2026-07-26T19:50:00Z'),
('a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a505', '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444401', '55555555-5555-4555-8555-555555555501', 'slides', 'slides/55555555-5555-4555-8555-555555555501.pdf', 'evals-or-it-didnt-happen.pdf', 'application/pdf', 4188220, '2026-08-05T18:20:00Z');

------------------------------------------------------------------------------
-- Integrations — present but unconfigured (drives the graceful no-op UI)
------------------------------------------------------------------------------
INSERT INTO integrations (id, event_id, kind, config_json, last_synced_at, last_status) VALUES
('1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a01', '22222222-2222-4222-8222-222222222201', 'accelevents', '{"api_key":"","event_id":""}', NULL, 'not_configured'),
('1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a02', '22222222-2222-4222-8222-222222222201', 'airtable',    '{"api_key":"","base_id":"","table_prefix":"GreenRoom"}', NULL, 'not_configured');
