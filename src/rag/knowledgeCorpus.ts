import type {
  EquipmentParameterEntry,
  HistoricalIncidentRecord,
  KnowledgeDocument,
} from './types';

/**
 * SEPARATE DEMONSTRATION INCIDENT DATASET (Part 9).
 * Explicitly marked DEMONSTRATION DATA — simulated historical test records, NOT verified SCAEK records.
 */
export const SYNTHETIC_DEMO_INCIDENTS: readonly HistoricalIncidentRecord[] = [
  {
    case_id: 'CAS-2026-081',
    date: '2026-10-14',
    severity: 'CRITICAL',
    problem: 'Hotspot detected on Kiln Shell Zone B-04.',
    context:
      'Virole temperature scanner indicated a rise to 385 °C in Zone B-04. Main drive torque increased by 4%. Burn zone pyrometer was steady at 1450 °C.',
    action_taken:
      'The operator deployed external cooling fans to meter 39-43. The advisor recommended reducing main burner gas flow from 10500 Nm3/h to 10200 Nm3/h.',
    result_30_min: 'Shell temperature stabilized at 375 °C.',
    result_60_min: 'Shell temperature dropped to 360 °C.',
    tags: ['Shell', 'Refractory', 'Hotspot', 'Cooling'],
    dataOrigin: 'DEMONSTRATION DATA',
  },
  {
    case_id: 'CAS-2026-092',
    date: '2026-10-22',
    severity: 'WARNING',
    problem: 'Free lime levels increased to 3.1%.',
    context:
      'Laboratory reported high free lime. Soft sensor estimated a low calcination state. Precalciner gas flow was 3000 Nm3/h while kiln feed rate was 260 t/h.',
    action_taken:
      'The advisor recommended adjusting the thermal profile. The operator accepted the recommendation, increased precalciner gas flow to 4500 Nm3/h and reduced kiln feed to 240 t/h.',
    result_30_min: 'Preheater exit temperature increased to 345 °C.',
    result_60_min: 'Laboratory confirmed free lime decreased to 2.1%.',
    tags: ['Quality', 'Free Lime', 'Calcination', 'Pyroclon', 'Feed Rate'],
    dataOrigin: 'DEMONSTRATION DATA',
  },
  {
    case_id: 'CAS-2026-105',
    date: '2026-11-02',
    severity: 'EMERGENCY',
    problem: 'Sudden drop in kiln hood draft pressure.',
    context:
      'Firing hood pressure approached positive territory at -0.05 mbar. Oxygen levels decreased at the smoke chamber analyzer.',
    action_taken:
      'A simulated manual fallback was initiated. The operator manually increased the main exhaust fan ID speed from 850 RPM to 950 RPM.',
    result_30_min: 'Draft pressure returned to -0.15 mbar.',
    result_60_min: 'Combustion stabilized.',
    tags: ['Draft', 'Pressure', 'Safety', 'Tirage'],
    dataOrigin: 'DEMONSTRATION DATA',
  },
] as const;

/**
 * STRUCTURED EQUIPMENT & PROCESS PARAMETER REGISTRY (Part 10).
 * Incorporates preliminary readings from handwritten industrial notes with explicit verification status.
 */
export const EQUIPMENT_PARAMETER_REGISTRY: readonly EquipmentParameterEntry[] = [
  {
    id: 'PRM-001',
    parameterName: 'Lime Saturation Factor (LSF)',
    category: 'Raw Meal & Feed',
    equipment: 'Raw Meal Homogenization & Kiln Feed',
    value: '~92 – 94',
    unit: 'index',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Controls burnability of raw meal and clinker free lime (CaO) formation; higher LSF demands higher burning energy.',
  },
  {
    id: 'PRM-002',
    parameterName: 'Silica Modulus (MS)',
    category: 'Raw Meal & Feed',
    equipment: 'Raw Meal Chemistry',
    value: '~2.2 – 2.35',
    unit: 'ratio',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Governs liquid phase proportion in the burning zone, affecting coating formation on refractory bricks.',
  },
  {
    id: 'PRM-003',
    parameterName: 'Alumina / Iron Ratio (A/F)',
    category: 'Raw Meal & Feed',
    equipment: 'Raw Meal Chemistry',
    value: '~0.6 – 0.9',
    unit: 'ratio',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Influences liquid phase viscosity and clinkerization onset temperature; flagged for plant lab confirmation.',
  },
  {
    id: 'PRM-004',
    parameterName: 'Raw Meal Feed Rate',
    category: 'Raw Meal & Feed',
    equipment: 'Kiln Feed Weigh-Feeder',
    value: '~230 – 260',
    unit: 't/h',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Primary throughput action variable; changes directly impact calcination load and clinker quality after 30–60 min residence time.',
  },
  {
    id: 'PRM-005',
    parameterName: 'Flour-to-Clinker Conversion Factor',
    category: 'Raw Meal & Feed',
    equipment: 'Material Mass Balance',
    value: '~0.58',
    unit: 't clinker / t meal',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Used to estimate clinker production tonnage from raw meal feed rate (accounting for decarbonation mass loss).',
  },
  {
    id: 'PRM-006',
    parameterName: 'Preheater Tower Configuration',
    category: 'Preheater & Calcination',
    equipment: 'Suspension Preheater Tower',
    value: '4-stage, 2 branches',
    unit: 'architecture',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Twin-branch 4-stage cyclone exchanger; requires balanced branch draft and cyclone differential pressures.',
  },
  {
    id: 'PRM-007',
    parameterName: 'Kiln Material Entry Temperature',
    category: 'Preheater & Calcination',
    equipment: 'Preheater Stage 4 / Kiln Inlet',
    value: '~800 – 830',
    unit: '°C',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Indicates preheating and precalcination completeness entering the rotary kiln tube.',
  },
  {
    id: 'PRM-008',
    parameterName: 'Preheater Outlet Temperature & Calcination Degree',
    category: 'Preheater & Calcination',
    equipment: 'Preheater Top Stage / Precalciner',
    value: 'Requires plant verification',
    unit: '°C / %',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Key indicators of heat-exchange efficiency and decarbonation before clinkerization; not hardcoded without plant confirmation.',
  },
  {
    id: 'PRM-009',
    parameterName: 'Main Kiln Burner Gas Flow (Single Note Reading)',
    category: 'Kiln & Burners',
    equipment: 'Main Kiln Burner (CH₄)',
    value: '~5,000',
    unit: 'Nm³/h',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Preliminary individual burner CH₄ reading; must not be conflated with total burner capacity/flow under different operating regimes.',
  },
  {
    id: 'PRM-010',
    parameterName: 'Total Burner Flow / Capacity (CH₄)',
    category: 'Kiln & Burners',
    equipment: 'Main Burner + Precalciner Fuel System',
    value: '~13,500',
    unit: 'Nm³/h',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Preliminary total natural gas (CH₄) capacity indicator; operating split between main burner and precalciner requires DCS verification.',
  },
  {
    id: 'PRM-011',
    parameterName: 'Kiln Rotation Speed',
    category: 'Kiln & Burners',
    equipment: 'Rotary Kiln Main Drive',
    value: '~2.14 (variable)',
    unit: 'rpm',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Controls material bed depth, residence time (30–60 min), and main drive torque/current.',
  },
  {
    id: 'PRM-012',
    parameterName: 'Main Exhaust / ID Draft Fans',
    category: 'Air & Ventilation',
    equipment: '2 × Exhaust Draft Fans',
    value: '~1,000',
    unit: 'rpm',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Major workshop electrical consumer; governs kiln draft, oxygen balance, and combustion stability.',
  },
  {
    id: 'PRM-013',
    parameterName: 'Tertiary Air Management',
    category: 'Air & Ventilation',
    equipment: 'Tertiary Air Duct (TAD) & Damper',
    value: 'Controlled thermal balance',
    unit: '°C / % damper',
    source: 'Official SCAEK Problem Statement',
    verificationStatus: 'PROBLEM STATEMENT REFERENCE',
    operationalSignificance:
      'Transfers hot recuperated air from grate cooler to precalciner, directly governing precalciner temperature and combustion stability.',
  },
  {
    id: 'PRM-014',
    parameterName: 'Natural Gas / Alternative Fuel Mixing Ratio',
    category: 'Kiln & Burners',
    equipment: 'Multi-Fuel Firing & Precalciner',
    value: 'Monitored ratio',
    unit: '% thermal substitution',
    source: 'Official SCAEK Problem Statement',
    verificationStatus: 'PROBLEM STATEMENT REFERENCE',
    operationalSignificance:
      'Improved combustion stability enables controlled integration of alternative fuels without compromising clinker quality or safety.',
  },
  {
    id: 'PRM-015',
    parameterName: 'Grate Cooler Ventilation Fans',
    category: 'Grate Cooler',
    equipment: 'Grate Cooler Fans V1 – V10',
    value: '10 fans (cooling + tempering groups)',
    unit: 'V1–V10',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Controls clinker quenching, under-grate pressure, secondary/tertiary air recuperation, and significant electrical energy draw.',
  },
  {
    id: 'PRM-016',
    parameterName: 'Kiln Hood Draft Pressure',
    category: 'Safety & Instrumentation',
    equipment: 'Kiln Firing Hood',
    value: '-0.1 to -0.2',
    unit: 'mbar / mmH₂O (TBD)',
    source: 'Handwritten Industrial Process Notes',
    verificationStatus: 'PENDING PLANT VALIDATION',
    operationalSignificance:
      'Maintains safe negative pressure at firing hood; units and exact tap location pending plant confirmation.',
  },
  {
    id: 'PRM-017',
    parameterName: 'Maximum Kiln Shell Temperature Safety Threshold',
    category: 'Safety & Instrumentation',
    equipment: 'Kiln Shell IR Scanner (Virole)',
    value: '< 370',
    unit: '°C',
    source: 'KILNOVA / SCAEK Prototype Safety Configuration',
    verificationStatus: 'PROTOTYPE CONFIGURED',
    operationalSignificance:
      'Configured prototype safety alarm threshold (>370 °C triggers critical red alert); subject to formal plant engineering & safety team validation.',
  },
] as const;

/**
 * CORE TECHNICAL DOCUMENTATION CORPUS (Collection: technical_docs)
 */
export const INITIAL_TECHNICAL_DOCUMENTS: readonly KnowledgeDocument[] = [
  {
    id: 'DOC-KILNOVA-ARCH',
    title: 'KILNOVA Technical Report — Architecture, Safety Limits & Advisor Governance',
    section: 'Section 1: System Safety & 370 °C Shell Threshold',
    source: 'KILNOVA_Rapport_technique_complet',
    collection: 'technical_docs',
    verificationStatus: 'PROTOTYPE CONFIGURED',
    createdAt: '2026-10-01T00:00:00Z',
    content: `KILNOVA is an AI-assisted industrial monitoring, predictive intelligence, and digital twin decision-support platform designed for the dry-process cement rotary kiln at SCAEK (GEW 2026 Ideathon prototype).
Configured Safety Threshold: For this prototype, the maximum kiln shell temperature limit is configured at 370 °C (Limit < 370 °C). Any shell scanner temperature exceeding 370 °C triggers a critical red safety alarm displaying the measured value and positive deviation (for example, 385 °C is +15 °C Critical, and 412 °C is +42 °C Critical Emergency). This 370 °C threshold is the configured KILNOVA/SCAEK prototype safety limit and remains subject to formal validation by the plant engineering and safety team.
Advisor-Only Safety Governance: The KILNOVA AI Supervisor Agent is strictly an ADVISOR. It never directly executes industrial control commands, never writes setpoints to the DCS, and never autonomously alters fuel flow, kiln rotation speed, or ID fan speed. Every recommendation must include explanation, supporting evidence, safety constraints, and explicit human operator validation. A clearly visible Manual Fallback (Repli Manuel) mode allows operators to demonstrate immediate transition to full manual operation without claiming live DCS actuation.
Data Separation & OT/IT Security: Future industrial deployment assumes read-only DCS/OPC-UA historian ingestion initially, OT/IT network segmentation, and strict isolation between live operational telemetry, 3D simulation testing data, synthetic demonstration incidents, and verified engineering documentation.`,
  },
  {
    id: 'DOC-SCAEK-PROBLEM',
    title: 'Official SCAEK Problem Statement — Variables, Coupling & Optimization KPIs',
    section: 'Section 2: Action Variables, State Variables & Optimization KPIs',
    source: 'problematique_de_scaek',
    collection: 'technical_docs',
    verificationStatus: 'VERIFIED',
    createdAt: '2026-10-01T00:00:00Z',
    content: `The official SCAEK dry-process cement rotary kiln problem statement defines three core variable families:
A. Action Variables: raw meal feed rate, main burner fuel flow, precalciner fuel flow, natural gas / alternative fuel mixing ratios, primary air flow, main exhaust fan (ID fan) draft, tertiary air management, kiln rotation speed, cooler grate speed, and cooling fan airflow.
B. Observed State Variables: cyclone temperatures, precalciner temperature, burning zone temperature, secondary air temperature, kiln inlet gas composition (O2, CO, NOx), preheater outlet gas composition, kiln main drive torque/current, cyclone differential pressures, and kiln shell infrared scanner measurements.
C. Optimization KPIs: clinker free lime (chaux libre), specific thermal energy consumption (kcal/kg clinker or MJ/t), specific electrical energy consumption of the kiln workshop (kWh/t clinker), average daily clinker production, and variance/stability of critical operating parameters.
Process Dynamics & Prediction Horizon: Corrective control actions require approximately 30 to 60 minutes to manifest in observable clinker quality (free lime) due to material residence time across the preheater, kiln, and cooler. Predictive models must account for time alignment, delayed responses, nonlinear relationships, tight kiln-cooler thermal/aerodynamic coupling, and differences between continuous sensor polling and periodic laboratory free-lime sampling using soft sensors.`,
  },
  {
    id: 'DOC-ENERGY-AF-TERTIARY',
    title: 'Thermal, Electrical & Combustion Stability Engineering Reference',
    section: 'Section 3: Electrical Consumption, Tertiary Air & Alternative Fuels',
    source: 'KILNOVA Engineering Reference (SCAEK Alignment)',
    collection: 'technical_docs',
    verificationStatus: 'VERIFIED',
    createdAt: '2026-10-01T00:00:00Z',
    content: `Electrical Energy Optimization: The largest electrical energy consumers in the cement kiln workshop are the main exhaust/ID fans (two draft fans around ~1,000 rpm preliminary note), the grate cooler fans (V1 through V10 split between clinker cooling and tempering groups), and the kiln main drive. Electrical consumption (kWh/t clinker) can be optimized by reducing false-air infiltration, maintaining clean cyclone differential pressures, avoiding excessive ID fan speed swings, balancing under-grate cooler pressures across V1–V10, and minimizing torque spikes caused by coating instability or clinker rings.
Tertiary Air & Precalciner Relationship: Tertiary air conveys recuperated hot air from the grate cooler directly into the precalciner. Managing tertiary air flow and temperature is essential to the combustion and precalciner thermal balance: insufficient tertiary air lowers precalciner oxygen and calcination efficiency (raising free lime), whereas imbalanced damper splits starve the kiln burning zone of secondary air.
Kiln Feed Rate & Calcination Relationship: Increasing raw meal feed rate raises the endothermic decarbonation heat load in the precalciner. If precalciner fuel flow and tertiary air heat supply are not proportionally balanced, calcination degree drops before material enters the rotary kiln, causing uncombined CaO (free lime) to rise 30–60 minutes later at the cooler discharge.
Draft & Combustion Stability: Kiln hood negative draft pressure (controlled by the main exhaust ID fans) governs gas residence time, oxygen availability at the smoke chamber, and flame geometry. When hood draft drops toward positive pressure (such as -0.05 mbar), excess oxygen drops, incomplete combustion / CO formation risks rise, flame heat shifts unpredictably, and combustion destabilizes.
Alternative Fuel Integration: Stabilizing combustion and reducing operating parameter variance (feed, fuel, draft, tertiary air) creates the thermal margin needed for controlled natural gas / alternative fuel mixing-ratio optimization without compromising clinker free lime quality or refractory safety.`,
  },
  {
    id: 'DOC-SENSOR-DIAGNOSTICS',
    title: 'System Health & Sensor Fault vs Process Anomaly Protocol',
    section: 'Section 4: Instrument Validation & Fault Isolation',
    source: 'KILNOVA_Rapport_technique_complet',
    collection: 'procedures',
    verificationStatus: 'VERIFIED',
    createdAt: '2026-10-01T00:00:00Z',
    content: `A critical SCADA reliability rule in KILNOVA is distinguishing a genuine process anomaly from a faulty sensor. A sensor failure, communication timeout, probe clogging, or analyzer zero-drift must NEVER be automatically interpreted as a real kiln process event.
Operators must inspect: sensor availability, missing data rate, 24-hour calibration drift, communication status, timestamp freshness, analyzer reliability, and synchronization offset.
Example: A calibrated shell IR scanner reading 412 °C on Ring B-04 (freshness 2 s, 99.8% availability) corroborated by rising burning-zone heat is a genuine PROCESS ANOMALY requiring thermal inspection. Conversely, a smoke-chamber O2/draft analyzer showing 8.8% missing packets, 47 s stale timestamp, and +0.38% O2/24h zero-drift is flagged as a SENSOR FAULT requiring probe blowback and calibration rather than blind fuel or ID fan intervention.
Operating Regimes: Statistical stability metrics (mean, standard deviation, variance, stability index) must always distinguish Normal Steady-State operation from Startup, Shutdown, and Transitional regimes; operator performance must never be compared across differing operating regimes.`,
  },
  {
    id: 'DOC-GEW-2026',
    title: 'GEW 2026 Ideathon Prototype Scope & Data Provenance Rules',
    section: 'Section 5: Demonstration Integrity & Plant Validation Boundaries',
    source: 'Guide_Officiel_des_Participants_Ideathon_ByteCraft_GEW_2026',
    collection: 'technical_docs',
    verificationStatus: 'VERIFIED',
    createdAt: '2026-10-01T00:00:00Z',
    content: `This KILNOVA platform is engineered for demonstration and technical evaluation at the ByteCraft GEW 2026 Ideathon targeting the SCAEK cement kiln use case.
Data Provenance Discipline:
1. Main Operational Dashboard Data (Context A): Demonstration telemetry featuring Ring B-04 at 412 °C, 5 logged process records (1 Anomaly, 2 Warnings), and 3/6 Nominal / 3 Flagged sensors. Clearly labeled as demonstration values, not verified live SCAEK telemetry.
2. 3D Digital Twin Simulation Data (Context B): Strictly isolated testing state ("SIMULATION MODE — TEST DATA") enabling interactive scenario exploration without altering Context A operational data.
3. Synthetic RAG Incident Dataset: Three simulated test cases (CAS-2026-081, CAS-2026-092, CAS-2026-105) stored in a separate DEMONSTRATION DATA collection and explicitly cited as simulated test records.
4. Handwritten Process Notes Registry: Preliminary SCAEK installation readings (LSF ~92-94, MS ~2.2-2.35, A/F ~0.6-0.9, feed ~230-260 t/h, factor ~0.58, 4-stage twin-branch preheater ~800-830 °C, burner ~5,000 Nm3/h, total ~13,500 Nm3/h CH4, 2.14 rpm, 2 exhaust fans ~1,000 rpm, cooler fans V1-V10, hood pressure -0.1 to -0.2) explicitly tagged PENDING PLANT VALIDATION.
5. No fabricated financial savings, ROI claims, or unvalidated machine-learning accuracy claims are permitted.`,
  },
] as const;
