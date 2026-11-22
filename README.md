# KILNOVA — Industrial Intelligence Platform for Dry-Process Rotary Cement Kilns (SCAEK · ByteCraft GEW 2026)

KILNOVA is a full-stack industrial intelligence and SCADA decision-support prototype designed for dry-process rotary cement kiln operations. It pairs a public product showcase with a strictly separated, dark-theme operational SCADA web application featuring real-time monitoring, a 370 °C shell safety enforcement rule, an isolated 3D digital twin simulation sandbox, thermal/electrical/stability KPIs, 30–60 minute predictive trajectories, instrumentation diagnostics, manual fallback governance (`Repli Manuel`), and a genuine server-side RAG **AI Supervisor Agent** powered by Gemini embeddings and generation.

---

## 1. Architecture Overview

- **Public Website (`#/`)**: Preserves the interactive 3D rock-dissolution hero (`HeroDissolution`), platform overview (`#features`), Operator & Supervisor workspace previews, and the public `Contact Us` section (`#contact`). Uses Public Website Navigation (`Home`, `Features`, `Contact Us`, `Open SCADA App`).
- **Operational SCADA Application (`#/operator`, `#/supervisor`, `#/system-health`, `#/manual-fallback`)**: Uses a strictly separated Operational SCADA Navigation containing **only** 4 destinations (`Operator Dashboard`, `Supervisor Dashboard`, `System Health`, `Manual Fallback / Repli Manuel`) with zero `Home` or `Contact Us` clutter.
- **Strict Context A vs. Context B Isolation**:
  - **Context A (Operational Monitoring & Advisory)**: Runs on `OperatorDashboardPage` (`Auto Pilot` / `Manual Simulation`), evaluating `src/utils/kilnSimulation.ts` against the configured **370 °C** shell safety threshold and preserving the demonstration `412 °C` (`+42 °C`) Ring B-04 hotspot (`PRC-2048`).
  - **Context B (3D Digital Twin Simulation Sandbox)**: Runs inside `src/components/KilnVisualizer3D.jsx` with its own self-contained simulation state (`SIMULATION MODE — TEST DATA`). Changing scenarios, sliders, or zones in Context B **never** mutates Context A operational status or historical records.
- **Full-Stack Backend (`server.ts`)**: Express + Vite middleware serving:
  - `GET /api/health` — Backend status, corpus chunk counts, and configured 370 °C limit.
  - `GET /api/parameters` — Searchable Equipment & Process Parameter Registry.
  - `GET / POST /api/rag/documents` — Technical knowledge documents (chunked + embedded).
  - `GET / POST /api/rag/incidents` — Historical / demonstration incident records (`CAS-2026-081`, `CAS-2026-092`, `CAS-2026-105`, plus user-submitted logs).
  - `POST /api/rag/query` — Real hybrid semantic (`gemini-embedding-2`) + lexical retrieval with `gemini-4-hydrogen` source-cited, advisor-only response synthesis.
- **Optional Cloud Persistence (Firebase Auth + Firestore)**: Users signing in with Google can persist newly added RAG technical documents (`rag_documents`) and incident logs (`rag_incidents`) across sessions with strict owner-scoped `firestore.rules`.

---

## 2. Data Provenance: Simulated vs. Real Measurements

KILNOVA enforces strict engineering honesty across every screen and AI response:
- **No Live Plant Telemetry**: This prototype does **not** connect to live SCAEK PLCs, DCS networks, or plant historians. All live-looking operational values (`412 °C`, `5 Records`, `3/6 Nominal · 3 Flagged`, `PRC-2048`) are explicitly marked as **DEMONSTRATION DATA**.
- **370 °C Safety Threshold (`PROTOTYPE CONFIGURED`)**: Configured as the KILNOVA/SCAEK prototype maximum shell temperature limit, subject to formal validation by plant engineering and safety teams.
- **Preliminary Technical Notes (`PENDING PLANT VALIDATION`)**: Equipment figures derived from preliminary engineering notes (e.g., `230–260 t/h` raw feed, `4.6 m × 74 m` kiln shell, `~1,000 rpm` ID fans, cooler fans `V1–V10`, `~5,000 Nm³/h` main burner CH₄) are explicitly tagged `PENDING PLANT VALIDATION` in the Equipment Parameter Registry and RAG citations.
- **Synthetic Historical Incidents (`DEMONSTRATION DATA`)**: `CAS-2026-081`, `CAS-2026-092`, and `CAS-2026-105` are clearly tagged demonstration records used to verify RAG citation and incident-comparison workflows.
- **30–60 Minute Predictive Analytics (`SIMULATED PREDICTION ARCHITECTURE — UNVALIDATED`)**: Solid lines represent demonstration measured history (`-60m` to `NOW`); dashed lines represent simulated nonlinear residence-time forecasts (`+15m` to `+60m`).
- **Advisor-Only Safety Boundary**: KILNOVA never writes to or actuates live DCS equipment. The `Manual Fallback / Repli Manuel` console demonstrates operator-controlled suspension of AI advisories.

---

## 3. Adding Technical Documents & Historical Incidents to RAG

1. Open **Supervisor Dashboard** (`#/supervisor`).
2. In the **AI Supervisor Agent** header, click **Add Doc** to ingest a new technical document or SOP (title, section, source, collection, verification status, content) or **Add Incident** to log a structured incident (`case_id`, date, severity, problem, context, action taken, +30 min / +60 min outcomes, tags).
3. Submitting immediately chunks and embeds the record into the running RAG engine (`POST /api/rag/documents` or `POST /api/rag/incidents`). If signed in with Google, the entry is also saved to your Firestore collection.
4. Ask the AI Supervisor Agent a question referencing the new document or case ID to verify instant retrieval and clickable citation inspection.

---

## 4. Testing the AI Supervisor Agent (RAG)

Ensure `GEMINI_API_KEY` is configured in the server environment, then open **Supervisor Dashboard** (`#/supervisor`) and click any of the 7 built-in test prompt chips (or type your own question):
1. Shell hotspot at `412 °C` vs. configured `370 °C` limit and similar past incidents (`CAS-2026-081`).
2. Detailed `+30 min` and `+60 min` results of demonstration incident `CAS-2026-081`.
3. Preliminary kiln dimensions, raw feed rate, and fan specs flagged `PENDING PLANT VALIDATION`.
4. Workshop electrical consumption (`kWh/t`) across ID exhaust fans, grate cooler `V1–V10`, and kiln main drive.
5. Clinker free lime residence-time lag (`30–60 min`) and soft-sensor architecture.
6. Distinguishing a faulty O₂ analyzer (`SNS-O206`) from a genuine process anomaly (`SNS-IR04`).
7. Combustion and tertiary-air stability prerequisites for alternative fuel substitution.

---

## 5. Running the 3D Digital Twin Simulation Sandbox

1. Open **Operator Dashboard** (`#/operator`) and scroll to **Context B — Interactive 3D Rotary Kiln Digital Twin**.
2. Use the bottom control dock to switch between all 11 scenarios (`Normal`, `Shell Hotspot`, `Clinker Ring`, `Kiln Overload`, `Bearing Failure`, `Thermal Runaway`, `Refractory Wear`, `Bearing Fatigue`, `Drive Friction`, `High Free Lime`, `High NOx`), toggle `CURRENT` / `DO NOTHING +30min` / `FOLLOW ADVICE +30min` / `X-RAY SHELL`, switch camera presets (`LINE VIEW`, `BURNER`, `PREHEATER`, `COOLER`), or use the **Play / Pause**, **Reset**, and **Manual Shell Override Slider (`250–450 °C`)**.
3. Click any of the 20 clickable axial shell zones in the HUD strip (or click directly on the 3D kiln shell) to inspect the Contextual Zone Info panel with the 370 °C safety band.
4. Notice that Context A operational telemetry at the top of the page remains completely unaffected by Context B simulation changes.

---

## 6. Local Development & Testing

```bash
# Install dependencies
npm install

# Run unit tests (3D kinematics, optimization, 370 °C safety logic, analytics, RAG engine)
npx tsx --test src/three/dissolutionMath.test.ts src/three/optimization.test.ts src/components/KilnVisualizer3D.test.ts src/rag/vectorEngine.test.ts src/data/industrialAnalytics.test.ts

# Type-check and build production bundle
npm run lint
npm run build

# Run full-stack Express + Vite server on port 3000
npm run dev
```
