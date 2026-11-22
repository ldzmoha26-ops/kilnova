export type ThemeVersion = 'obsidian' | 'gica';
export type Locale = 'en' | 'fr' | 'ar';
export type SemanticStatus = 'normal' | 'warning' | 'critical';

/**
 * Verified & proposed GICA visual identity tokens from the design report.
 * Brand blue (#04375D) is strictly reserved for brand/navigation/primary actions
 * and is never reused for operational status indicators.
 */
export const GICA_PALETTE = {
  brandBlue: '#04375D',
  brandBlueAlt: '#02395D',
  darkBg: '#051A2A',
  darkSurface: '#072840',
  darkBorder: '#1F4E73',
  lightBg: '#FFFFFF',
  lightSurface: '#F3F6F9',
  dataCyan: '#36C5D8',
  statusNormal: '#43B982',
  statusWarning: '#F2B84B',
  statusCritical: '#F28C4B',
  statusEmergency: '#E45F5F',
  statusOffline: '#7A8A96',
  aiAccent: '#A78BFA',
} as const;

export interface ThreeThemePalette {
  bgHex: number;
  fogHex: number;
  bgDeepRgb: [number, number, number];
  bgHaloRgb: [number, number, number];
  bgAccentRgb: [number, number, number];
  hemiSkyHex: number;
  hemiGroundHex: number;
  keyLightHex: number;
  rimLightHex: number;
  backRimHex: number;
  coreLightHex: number;
  fissureDeepRgb: [number, number, number];
  fissureMidRgb: [number, number, number];
  fissureHotRgb: [number, number, number];
  mineralEmberRgb: [number, number, number];
  mineralWarmSandRgb: [number, number, number];
  dustLowRgb: [number, number, number];
  dustMidRgb: [number, number, number];
  dustHotRgb: [number, number, number];
  shardRimRgb: [number, number, number];
  shardEmberRgb: [number, number, number];
  refinedCoreHex: number;
  refinedEmissiveHex: number;
  refinedEdgeHex: number;
}

export const THREE_THEME_PALETTES: Record<ThemeVersion, ThreeThemePalette> = {
  obsidian: {
    bgHex: 0x0a0c10,
    fogHex: 0x0a0c10,
    bgDeepRgb: [0.039, 0.047, 0.063],
    bgHaloRgb: [0.065, 0.135, 0.265],
    bgAccentRgb: [0.09, 0.24, 0.56],
    hemiSkyHex: 0x93c5fd,
    hemiGroundHex: 0x0b1220,
    keyLightHex: 0xf1f5f9,
    rimLightHex: 0x2563eb,
    backRimHex: 0x60a5fa,
    coreLightHex: 0x3b82f6,
    fissureDeepRgb: [0.09, 0.24, 0.58],
    fissureMidRgb: [0.16, 0.44, 0.96],
    fissureHotRgb: [0.82, 0.92, 1.0],
    mineralEmberRgb: [0.22, 0.52, 0.98],
    mineralWarmSandRgb: [0.42, 0.52, 0.66],
    dustLowRgb: [0.12, 0.34, 0.78],
    dustMidRgb: [0.24, 0.56, 0.98],
    dustHotRgb: [0.88, 0.95, 1.0],
    shardRimRgb: [0.22, 0.52, 0.96],
    shardEmberRgb: [0.45, 0.74, 1.0],
    refinedCoreHex: 0x0f172a,
    refinedEmissiveHex: 0x1d4ed8,
    refinedEdgeHex: 0x93c5fd,
  },
  gica: {
    bgHex: 0x051a2a,
    fogHex: 0x051a2a,
    bgDeepRgb: [0.02, 0.102, 0.165], // #051A2A
    bgHaloRgb: [0.039, 0.225, 0.365], // #04375D lifted subtly
    bgAccentRgb: [0.08, 0.34, 0.42], // restrained data cyan atmospheric bloom
    hemiSkyHex: 0x7cb8d8,
    hemiGroundHex: 0x071b2b,
    keyLightHex: 0xe4f1fb,
    rimLightHex: 0x36c5d8, // GICA Data Cyan rim separation
    backRimHex: 0x5ca4cc,
    coreLightHex: 0xf28c4b, // Critical thermal amber core
    fissureDeepRgb: [0.16, 0.52, 0.64], // cool-to-hot seam transition
    fissureMidRgb: [0.95, 0.55, 0.29], // #F28C4B critical heat
    fissureHotRgb: [0.98, 0.82, 0.42], // #F2B84B thermal gold
    mineralEmberRgb: [0.95, 0.58, 0.26],
    mineralWarmSandRgb: [0.32, 0.48, 0.58],
    dustLowRgb: [0.16, 0.58, 0.68], // #36C5D8 cyan thermal mist
    dustMidRgb: [0.95, 0.66, 0.28], // #F2B84B / #F28C4B calcination glow
    dustHotRgb: [0.68, 0.92, 0.98], // crisp cyan-white sintered peak
    shardRimRgb: [0.21, 0.77, 0.85], // #36C5D8
    shardEmberRgb: [0.95, 0.55, 0.29], // #F28C4B
    refinedCoreHex: 0x072840,
    refinedEmissiveHex: 0x1a7f96,
    refinedEdgeHex: 0x36c5d8,
  },
};

export function getInitialVersionFromSearch(search: string): ThemeVersion {
  const params = new URLSearchParams(search);
  const raw = (params.get('version') ?? params.get('theme') ?? '').toLowerCase();
  if (raw === 'v1' || raw === 'obsidian') return 'obsidian';
  if (raw === 'v2' || raw === 'gica') return 'gica';
  return 'obsidian';
}

export function getDirectionForLocale(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export interface LocalizedStageCopy {
  label: string;
  captionTitle: string;
  captionBody: string;
  thermalBand: string;
}

export interface LocalizedMaterialProfile {
  id: string;
  rawMaterial: string;
  refinedOutput: string;
  peakTemp: string;
  kilnArchitecture: string;
  atmosphere: string;
  residenceTime: string;
  status: SemanticStatus;
  statusLabel: string;
  summary: string;
  thermalProfile: readonly { zone: string; range: string; role: string }[];
}

export interface LocalizedCopy {
  nav: {
    philosophy: string;
    process: string;
    expertise: string;
    materials: string;
    cta: string;
  };
  hero: {
    eyebrowLeft: string;
    eyebrowRight: string;
    headlineLine1: string;
    headlineLine2: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    scrollPrompt: string;
    stagePrefix: string;
    stages: readonly LocalizedStageCopy[];
  };
  philosophy: {
    kicker: string;
    heading: string;
    lead: string;
    secondary: string;
    continuumTitle: string;
    continuumMeta: string;
    pillars: readonly {
      index: string;
      phase: string;
      title: string;
      description: string;
      status: SemanticStatus;
      statusLabel: string;
    }[];
  };
  expertise: {
    kicker: string;
    heading: string;
    lead: string;
    domains: readonly {
      number: string;
      title: string;
      detail: string;
      spec: string;
    }[];
    materialsKicker: string;
    materialsHeading: string;
    peakRegimeLabel: string;
    residenceLabel: string;
    atmosphereLabel: string;
    corridorLabel: string;
    profiles: readonly LocalizedMaterialProfile[];
  };
  consultation: {
    kicker: string;
    heading: string;
    lead: string;
    locations: string;
    emailContact: string;
    receivedTitle: string;
    receivedPrefix: string;
    receivedMiddle: string;
    receivedDossier: string;
    submitAnother: string;
    fields: {
      fullName: string;
      fullNamePlaceholder: string;
      organization: string;
      organizationPlaceholder: string;
      email: string;
      emailPlaceholder: string;
      architecture: string;
      brief: string;
      briefPlaceholder: string;
      submit: string;
    };
    architectures: readonly string[];
    errors: {
      fullName: string;
      organization: string;
      email: string;
      brief: string;
    };
    footerCopy: string;
  };
}

export const COPY_BY_LOCALE: Record<Locale, LocalizedCopy> = {
  en: {
    nav: {
      philosophy: 'Philosophy',
      process: 'Thermal Process',
      expertise: 'Expertise',
      materials: 'Materials',
      cta: 'Request Consultation',
    },
    hero: {
      eyebrowLeft: 'AI ASSISTANT FOR ROTARY KILN INTELLIGENCE',
      eyebrowRight: '',
      headlineLine1: 'WHERE HEAT',
      headlineLine2: 'MEETS INTELLIGENCE.',
      subtitle:
        'Understanding the extreme conditions inside the rotary kiln. Turning thermal behaviour, operating signals and complex process data into actionable industrial intelligence.',
      primaryCta: 'Explore Operator Dashboard',
      secondaryCta: 'Supervisor Dashboard',
      scrollPrompt: '',
      stagePrefix: 'STAGE',
      stages: [
        {
          label: 'Raw Matter',
          captionTitle: 'Dense Geological Ore',
          captionBody:
            'Unrefined mineral mass suspended at ambient equilibrium prior to thermal loading.',
          thermalBand: '24 °C — 420 °C',
        },
        {
          label: 'Initial Dissolution',
          captionTitle: 'Thermal Fracture & Fissure Ignition',
          captionBody:
            'Controlled radiant flux penetrates structural seams, detaching mineral strata from the leading edge.',
          thermalBand: '850 °C — 1,180 °C',
        },
        {
          label: 'Energy Release',
          captionTitle: 'Peak Calcination & Phase Liberation',
          captionBody:
            'Extreme heat breaks molecular bonds as incandescent particles cascade and disperse under gravity.',
          thermalBand: '1,450 °C — 1,680 °C',
        },
        {
          label: 'Transformation',
          captionTitle: 'Refined Crystalline Architecture',
          captionBody:
            'Settling thermal energy coalesces into a pure, sintered industrial mineral structure.',
          thermalBand: 'Sintered Equilibrium',
        },
      ],
    },
    philosophy: {
      kicker: 'Our Engineering Philosophy',
      heading: 'Discipline at the threshold of extreme heat.',
      lead: 'Industrial kilns are often treated as brute-force vessels. We approach them as precision thermodynamic instruments. When raw stone enters a 1,600 °C environment, millimeters of refractory geometry and seconds of residence time decide the purity, density, and carbon footprint of the refined material emerging at the discharge end.',
      secondary:
        'From rotary calcination drums to multi-zone continuous sintering tunnels, every system is engineered from first principles around the exact mineral transformation curve required by your feedstock.',
      continuumTitle: 'The Transformation Continuum',
      continuumMeta: 'Raw Matter · Energy · Transformation · Refined Material',
      pillars: [
        {
          index: '01',
          phase: 'Raw Matter',
          title: 'Geological Feedstock Characterization',
          description:
            'Every kiln architecture begins with mineralogy. We model bulk density, moisture evolution, thermal conductivity, and fracture thresholds across heterogeneous ores before a single refractory brick is specified.',
          status: 'normal',
          statusLabel: 'Nominal Feed',
        },
        {
          index: '02',
          phase: 'Energy',
          title: 'Radiant Flux & Flame Geometry',
          description:
            'Extreme heat is only useful when disciplined. Our combustion chambers shape luminous flame envelopes and staged heat recovery zones to eliminate cold spots while minimizing fuel consumption.',
          status: 'warning',
          statusLabel: 'High Thermal Flux',
        },
        {
          index: '03',
          phase: 'Transformation',
          title: 'Controlled Phase Liberation',
          description:
            'Within the calcination and sintering corridor, precise residence times and atmospheric chemistry drive decarbonation, crystal growth, and phase transitions without thermal shock.',
          status: 'critical',
          statusLabel: 'Peak Calcination',
        },
        {
          index: '04',
          phase: 'Refined Material',
          title: 'Structural Equilibrium & Cooling',
          description:
            'Rapid, engineered heat recuperation locks in crystalline uniformity and mechanical strength, recovering thermal energy back into the preheating stage to close the thermodynamic loop.',
          status: 'normal',
          statusLabel: 'Stabilized Output',
        },
      ],
    },
    expertise: {
      kicker: 'Core Expertise',
      heading: 'Built for decades of continuous thermal duty.',
      lead: 'Every subsystem—from mechanical shell drives to gas-tight kiln seals—is engineered in-house for metallurgical reliability under relentless thermal cycling.',
      domains: [
        {
          number: '01',
          title: 'Rotary & Suspension Kiln Systems',
          detail:
            'Custom shell dynamics, tyre-and-roller alignment, and multi-channel burner lances engineered for continuous 24/7 operation across heavy mineral industries.',
          spec: 'Up to 1,750 °C continuous shell envelope',
        },
        {
          number: '02',
          title: 'Refractory Thermal Architecture',
          detail:
            'Multi-layer composite refractory linings modeled via finite-element thermal stress analysis to extend campaign lifespans and curb radiative shell loss.',
          spec: 'Multi-zone monolithic & brick composites',
        },
        {
          number: '03',
          title: 'Decarbonized & Hybrid Heat Delivery',
          detail:
            'Fuel-flexible combustion lances and electric-hybrid preheaters enabling seamless transition toward hydrogen, oxy-fuel, and renewable process heat.',
          spec: 'Closed-loop exhaust heat recuperation',
        },
      ],
      materialsKicker: 'Material Transformation Profiles',
      materialsHeading: 'From geological feedstock to refined foundation.',
      peakRegimeLabel: 'Peak Thermal Regime',
      residenceLabel: 'Residence Window',
      atmosphereLabel: 'Process Atmosphere',
      corridorLabel: 'Thermal Corridor Sequence',
      profiles: [
        {
          id: 'clinker',
          rawMaterial: 'Limestone & Clay',
          refinedOutput: 'Portland Clinker',
          peakTemp: '1,450 °C',
          kilnArchitecture: 'Multi-Stage Precalciner Rotary Kiln',
          atmosphere: 'Oxidizing · Controlled Secondary Air',
          residenceTime: '32 — 40 min',
          status: 'normal',
          statusLabel: 'Optimal Clinkerization',
          summary:
            'High-efficiency suspension preheating paired with short-flame rotary sintering achieves complete alite crystallization while minimizing thermal NOx formation.',
          thermalProfile: [
            { zone: 'Preheating & Drying', range: '200 — 850 °C', role: 'Dehydration and raw meal suspension heating' },
            { zone: 'Calcination', range: '850 — 1,100 °C', role: 'Endothermic carbonate dissociation' },
            { zone: 'Sintering Corridor', range: '1,350 — 1,450 °C', role: 'Liquid-phase mineral fusion into clinker nodules' },
            { zone: 'Grate Quenching', range: '1,450 — 120 °C', role: 'Rapid crystal stabilization & waste heat recovery' },
          ],
        },
        {
          id: 'alumina',
          rawMaterial: 'Gibbsite & Bauxite',
          refinedOutput: 'Calcined Alpha-Alumina',
          peakTemp: '1,280 °C',
          kilnArchitecture: 'Fluidized-Bed & Gas Suspension Calciner',
          atmosphere: 'Low-Humidity Clean Combustion',
          residenceTime: '18 — 25 min',
          status: 'normal',
          statusLabel: 'Stable Fluidization',
          summary:
            'Precision temperature uniformity across the calcination bed prevents over-sintering and preserves strict particle size distribution for smelting and advanced refractories.',
          thermalProfile: [
            { zone: 'Moisture Stripping', range: '150 — 400 °C', role: 'Removal of free and crystal-bound water' },
            { zone: 'Transition Phase', range: '550 — 950 °C', role: 'Controlled gamma-alumina pore development' },
            { zone: 'Alpha Conversion', range: '1,150 — 1,280 °C', role: 'Uniform crystallographic stabilization' },
            { zone: 'Multi-Stage Cooling', range: '1,280 — 90 °C', role: 'Counter-current combustion air preheating' },
          ],
        },
        {
          id: 'ceramic',
          rawMaterial: 'Kaolin & Technical Oxides',
          refinedOutput: 'Dense Sintered Ceramics',
          peakTemp: '1,620 °C',
          kilnArchitecture: 'Modular High-Temperature Tunnel Kiln',
          atmosphere: 'Precision O₂ / N₂ Zoned Control',
          residenceTime: '6 — 14 hours',
          status: 'warning',
          statusLabel: 'Strict Ramp Sensitivity',
          summary:
            'Multi-zone radiant heating ramps suppress micro-cracking during binder burnout and deliver near-theoretical structural density in technical ceramic components.',
          thermalProfile: [
            { zone: 'Binder Evacuation', range: '180 — 620 °C', role: 'Gradual volatilization without internal stress' },
            { zone: 'Pre-Sintering', range: '620 — 1,200 °C', role: 'Initial grain-boundary necking and shrinkage' },
            { zone: 'Peak Densification', range: '1,520 — 1,620 °C', role: 'Full pore elimination & microstructural grain balance' },
            { zone: 'Annealing Ramp', range: '1,620 — 180 °C', role: 'Zero-shock thermal stress relief' },
          ],
        },
        {
          id: 'silica',
          rawMaterial: 'High-Purity Quartz',
          refinedOutput: 'Fused Industrial Silica',
          peakTemp: '1,740 °C',
          kilnArchitecture: 'Hybrid Electric-Radiant Hearth Kiln',
          atmosphere: 'Inert / Ultra-Low Contamination',
          residenceTime: '45 — 75 min',
          status: 'critical',
          statusLabel: 'Extreme Thermal Envelope',
          summary:
            'Zero-contact radiant elements and high-alumina refractory linings eliminate metallic inclusions during extreme vitrification cycles.',
          thermalProfile: [
            { zone: 'Alpha-Beta Inversion', range: '450 — 650 °C', role: 'Controlled lattice expansion across 573 °C threshold' },
            { zone: 'Cristobalite Ramp', range: '900 — 1,420 °C', role: 'Outgassing of trace hydroxyl impurities' },
            { zone: 'Vitrification Core', range: '1,680 — 1,740 °C', role: 'Amorphous thermal fusion under ultra-clean flux' },
            { zone: 'Stabilization', range: '1,740 — 220 °C', role: 'Controlled devitrification suppression' },
          ],
        },
      ],
    },
    consultation: {
      kicker: 'Engineering Consultation',
      heading: 'Specify your next thermal transformation system.',
      lead: 'Share your feedstock mineralogy, throughput target, and thermal profile. Our process engineers respond with a preliminary heat-balance assessment and refractory architecture study.',
      locations: 'Algiers Cement Process Center · Zurich Thermal Laboratory',
      emailContact: 'engineering@kilnova-thermics.example',
      receivedTitle: 'Engineering brief received.',
      receivedPrefix: 'Thank you,',
      receivedMiddle: 'Your thermal specification brief for',
      receivedDossier: 'has been logged under dossier',
      submitAnother: 'Submit Another Specification',
      fields: {
        fullName: 'Full Name',
        fullNamePlaceholder: 'Dr. Henrik Lindholm',
        organization: 'Organization',
        organizationPlaceholder: 'SCAEK / Industrial Cement Plant',
        email: 'Work Email',
        emailPlaceholder: 'engineer@company.com',
        architecture: 'Kiln Architecture',
        brief: 'Feedstock & Thermal Requirements',
        briefPlaceholder:
          'Specify raw mineral feedstock, target peak temperature, and daily tonnage...',
        submit: 'Request Thermal Study',
      },
      architectures: [
        'Rotary Calcination Kiln',
        'Continuous Tunnel Sintering Kiln',
        'Fluidized-Bed Suspension Calciner',
        'Hybrid Electric-Radiant Kiln',
      ],
      errors: {
        fullName: 'Please enter your full name.',
        organization: 'Please enter your organization or plant name.',
        email: 'Please enter a valid work email address.',
        brief: 'Please describe your feedstock or target thermal regime (at least 12 characters).',
      },
      footerCopy: 'Kilnova Thermal Engineering. Industrial Kiln Systems & Material Transformation.',
    },
  },
  fr: {
    nav: {
      philosophy: 'Philosophie',
      process: 'Procédé Thermique',
      expertise: 'Expertise',
      materials: 'Matériaux',
      cta: 'Demander une Étude',
    },
    hero: {
      eyebrowLeft: 'Ingénierie Industrielle',
      eyebrowRight: 'Transformation de la Matière',
      headlineLine1: 'LÀ OÙ LA MATIÈRE',
      headlineLine2: 'DEVIENT TRANSFORMATION.',
      subtitle:
        'Concevoir les conditions thermiques extrêmes qui transforment les minerais bruts en fondations de l’industrie moderne.',
      primaryCta: 'Explorer Notre Ingénierie',
      secondaryCta: 'Découvrir Notre Expertise',
      scrollPrompt: 'Défiler pour transformer',
      stagePrefix: 'ÉTAPE',
      stages: [
        {
          label: 'Matière Brute',
          captionTitle: 'Minerai Géologique Dense',
          captionBody:
            'Masse minérale non raffinée en équilibre ambiant avant la montée en charge thermique.',
          thermalBand: '24 °C — 420 °C',
        },
        {
          label: 'Dissolution Initiale',
          captionTitle: 'Fracture Thermique & Fissuration',
          captionBody:
            'Le flux radiatif maîtrisé pénètre les strates et détache les premiers fragments minéraux en bordure.',
          thermalBand: '850 °C — 1 180 °C',
        },
        {
          label: 'Libération d’Énergie',
          captionTitle: 'Calcination & Libération de Phase',
          captionBody:
            'La chaleur extrême rompt les liaisons moléculaires tandis que les particules incandescentes chutent par gravité.',
          thermalBand: '1 450 °C — 1 680 °C',
        },
        {
          label: 'Transformation',
          captionTitle: 'Architecture Cristalline Raffinée',
          captionBody:
            'L’énergie thermique se stabilise pour révéler une structure minérale frittée, pure et équilibrée.',
          thermalBand: 'Équilibre de Frittage',
        },
      ],
    },
    philosophy: {
      kicker: 'Notre Philosophie d’Ingénierie',
      heading: 'La discipline au seuil des chaleurs extrêmes.',
      lead: 'Les fours industriels sont souvent perçus comme des enceintes brutes. Nous les concevons comme des instruments thermodynamiques de précision. Lorsque la roche brute pénètre dans un couloir à 1 600 °C, quelques millimètres de géométrie réfractaire et quelques secondes de temps de séjour déterminent la qualité du clinker et l’empreinte énergétique.',
      secondary:
        'Des fours rotatifs de cimenterie aux tunnels continus de frittage multizones, chaque installation est dimensionnée autour de la courbe exacte de transformation de votre matière première.',
      continuumTitle: 'Le Continuum de Transformation',
      continuumMeta: 'Matière Brute · Énergie · Transformation · Matériau Raffiné',
      pillars: [
        {
          index: '01',
          phase: 'Matière Brute',
          title: 'Caractérisation Minéralogique du Cru',
          description:
            'Chaque architecture de four débute par l’analyse du gisement : densité apparente, humidité, conductivité thermique et seuils de fracturation avant le choix des réfractaires.',
          status: 'normal',
          statusLabel: 'Alimentation Nominale',
        },
        {
          index: '02',
          phase: 'Énergie',
          title: 'Flux Radiatif & Géométrie de Flamme',
          description:
            'Nos brûleurs et chambres de combustion façonnent des profils de flamme homogènes et étagés pour supprimer les points froids et optimiser l’énergie spécifique.',
          status: 'warning',
          statusLabel: 'Flux Thermique Élevé',
        },
        {
          index: '03',
          phase: 'Transformation',
          title: 'Calcination & Clinkérisation Maîtrisées',
          description:
            'Dans la zone de cuisson, la maîtrise du temps de séjour, de la chaux libre et de l’atmosphère pilote les réactions de décarbonatation et de croissance cristalline.',
          status: 'critical',
          statusLabel: 'Zone de Cuisson Critique',
        },
        {
          index: '04',
          phase: 'Matériau Raffiné',
          title: 'Trempe & Récupération Thermique',
          description:
            'Le refroidissement rapide fige la structure minéralogique et réinjecte la chaleur récupérée vers le préchauffage afin de boucler le bilan thermodynamique.',
          status: 'normal',
          statusLabel: 'Sortie Stabilisée',
        },
      ],
    },
    expertise: {
      kicker: 'Expertise Industrielle',
      heading: 'Conçu pour des décennies de marche continue.',
      lead: 'Chaque sous-ensemble — viroles mécaniques, galets porteurs, joints d’étanchéité et revêtements réfractaires — est conçu pour la fiabilité en service continu.',
      domains: [
        {
          number: '01',
          title: 'Fours Rotatifs & Précalcinateurs',
          detail:
            'Dynamique de virole, alignement des bandages et lances multi-canaux conçus pour un fonctionnement continu 24h/24 dans l’industrie cimentière et minérale.',
          spec: 'Enveloppe continue jusqu’à 1 750 °C',
        },
        {
          number: '02',
          title: 'Architecture Réfractaire Multicouche',
          detail:
            'Revêtements composites modélisés par éléments finis afin de prolonger les campagnes de cuisson et réduire les pertes radiatives de virole.',
          spec: 'Composites réfractaires haute alumine',
        },
        {
          number: '03',
          title: 'Décarbonation & Chaleur Hybride',
          detail:
            'Brûleurs multi-combustibles et préchauffeurs hybrides préparant la transition vers l’oxy-combustion, les combustibles alternatifs et l’électrification.',
          spec: 'Récupération thermique en boucle fermée',
        },
      ],
      materialsKicker: 'Profils de Transformation Matière',
      materialsHeading: 'Du minerai géologique au matériau industriel.',
      peakRegimeLabel: 'Régime Thermique de Pointe',
      residenceLabel: 'Temps de Séjour',
      atmosphereLabel: 'Atmosphère de Procédé',
      corridorLabel: 'Séquence du Couloir Thermique',
      profiles: [
        {
          id: 'clinker',
          rawMaterial: 'Calcaire & Argile',
          refinedOutput: 'Clinker Portland',
          peakTemp: '1 450 °C',
          kilnArchitecture: 'Four Rotatif à Précalcinateur Multi-Étages',
          atmosphere: 'Oxydante · Air Secondaire Régulé',
          residenceTime: '32 — 40 min',
          status: 'normal',
          statusLabel: 'Clinkérisation Nominale',
          summary:
            'Le préchauffage en suspension couplé à une zone de cuisson compacte assure une cristallisation complète de l’alite tout en réduisant les émissions de NOx thermiques.',
          thermalProfile: [
            { zone: 'Séchage & Préchauffage', range: '200 — 850 °C', role: 'Déshydratation et montée thermique de la farine crue' },
            { zone: 'Décarbonatation', range: '850 — 1 100 °C', role: 'Dissociation endothermique des carbonates' },
            { zone: 'Zone de Clinkérisation', range: '1 350 — 1 450 °C', role: 'Fusion partielle et formation des nodules de clinker' },
            { zone: 'Refroidisseur à Grilles', range: '1 450 — 120 °C', role: 'Trempe cristalline et récupération d’air chaud' },
          ],
        },
        {
          id: 'alumina',
          rawMaterial: 'Gibbsite & Bauxite',
          refinedOutput: 'Alumine Alpha Calcinée',
          peakTemp: '1 280 °C',
          kilnArchitecture: 'Calcinateur à Lit Fluidisé en Suspension',
          atmosphere: 'Combustion Propre Faible Humidité',
          residenceTime: '18 — 25 min',
          status: 'normal',
          statusLabel: 'Fluidisation Stable',
          summary:
            'L’homogénéité thermique du lit fluidisé évite le sur-frittage et garantit une granulométrie constante pour la métallurgie et les réfractaires avancés.',
          thermalProfile: [
            { zone: 'Extraction d’Humidité', range: '150 — 400 °C', role: 'Élimination de l’eau libre et cristalline' },
            { zone: 'Phase de Transition', range: '550 — 950 °C', role: 'Développement contrôlé de l’alumine gamma' },
            { zone: 'Conversion Alpha', range: '1 150 — 1 280 °C', role: 'Stabilisation cristallographique uniforme' },
            { zone: 'Refroidissement Étagé', range: '1 280 — 90 °C', role: 'Préchauffage à contre-courant de l’air comburant' },
          ],
        },
        {
          id: 'ceramic',
          rawMaterial: 'Kaolin & Oxydes Techniques',
          refinedOutput: 'Céramiques Frittées Denses',
          peakTemp: '1 620 °C',
          kilnArchitecture: 'Four Tunnel Haute Température Modulaire',
          atmosphere: 'Contrôle Zonal Précis O₂ / N₂',
          residenceTime: '6 — 14 heures',
          status: 'warning',
          statusLabel: 'Sensibilité de Rampe',
          summary:
            'Les rampes radiatives multizones suppriment les micro-fissures lors du déliantage et atteignent une densité structurale quasi théorique.',
          thermalProfile: [
            { zone: 'Déliantage', range: '180 — 620 °C', role: 'Évacuation progressive des liants sans contrainte' },
            { zone: 'Pré-Frittage', range: '620 — 1 200 °C', role: 'Consolidation initiale des joints de grains' },
            { zone: 'Densification Maximale', range: '1 520 — 1 620 °C', role: 'Élimination des pores et équilibre microstructural' },
            { zone: 'Recuit Contrôlé', range: '1 620 — 180 °C', role: 'Relaxation thermique sans choc mécanique' },
          ],
        },
        {
          id: 'silica',
          rawMaterial: 'Quartz Haute Pureté',
          refinedOutput: 'Silice Industrielle Fondue',
          peakTemp: '1 740 °C',
          kilnArchitecture: 'Four Hybride Électro-Radiatif à Sole',
          atmosphere: 'Inerte · Ultra-Faible Contamination',
          residenceTime: '45 — 75 min',
          status: 'critical',
          statusLabel: 'Enveloppe Thermique Extrême',
          summary:
            'Les éléments radiatifs sans contact et les réfractaires haute alumine éliminent les inclusions métalliques durant les cycles de vitrification.',
          thermalProfile: [
            { zone: 'Inversion Alpha-Bêta', range: '450 — 650 °C', role: 'Dilatation maîtrisée au passage du seuil 573 °C' },
            { zone: 'Rampe Cristobalite', range: '900 — 1 420 °C', role: 'Dégazage des impuretés hydroxyles résiduelles' },
            { zone: 'Cœur de Vitrification', range: '1 680 — 1 740 °C', role: 'Fusion amorphe sous flux ultra-propre' },
            { zone: 'Stabilisation', range: '1 740 — 220 °C', role: 'Suppression contrôlée de la dévitrification' },
          ],
        },
      ],
    },
    consultation: {
      kicker: 'Étude d’Ingénierie',
      heading: 'Spécifiez votre prochain système de transformation thermique.',
      lead: 'Communiquez votre minéralogie, votre capacité cible et votre profil thermique. Nos ingénieurs procédé vous transmettent un bilan thermique préliminaire et une étude réfractaire.',
      locations: 'Centre Procédé Cimenterie · Laboratoire Thermique Industriel',
      emailContact: 'engineering@kilnova-thermics.example',
      receivedTitle: 'Dossier technique enregistré.',
      receivedPrefix: 'Merci,',
      receivedMiddle: 'Votre cahier des charges thermique pour',
      receivedDossier: 'a été enregistré sous la référence',
      submitAnother: 'Soumettre une Autre Spécification',
      fields: {
        fullName: 'Nom Complet',
        fullNamePlaceholder: 'Ing. Karim Benali',
        organization: 'Organisation / Cimenterie',
        organizationPlaceholder: 'SCAEK · Unité de Production',
        email: 'E-mail Professionnel',
        emailPlaceholder: 'k.benali@entreprise.dz',
        architecture: 'Architecture de Four',
        brief: 'Matière Première & Exigences Thermiques',
        briefPlaceholder:
          'Précisez le minerai brut, la température de pointe visée et le tonnage journalier...',
        submit: 'Demander une Étude Thermique',
      },
      architectures: [
        'Four Rotatif de Calcination',
        'Four Tunnel Continu de Frittage',
        'Calcinateur à Lit Fluidisé',
        'Four Hybride Électro-Radiatif',
      ],
      errors: {
        fullName: 'Veuillez saisir votre nom complet.',
        organization: 'Veuillez indiquer votre organisation ou usine.',
        email: 'Veuillez saisir une adresse e-mail professionnelle valide.',
        brief: 'Veuillez décrire votre matière première ou régime thermique (12 caractères min.).',
      },
      footerCopy: 'Kilnova Thermal Engineering. Systèmes de Fours Industriels & Transformation Matière.',
    },
  },
  ar: {
    nav: {
      philosophy: 'الفلسفة الهندسية',
      process: 'المسار الحراري',
      expertise: 'الخبرات',
      materials: 'المواد',
      cta: 'طلب دراسة هندسية',
    },
    hero: {
      eyebrowLeft: 'الهندسة الصناعية',
      eyebrowRight: 'تحول المواد الخام',
      headlineLine1: 'حيث تلتقي المادة',
      headlineLine2: 'بقوة التحول الحراري.',
      subtitle:
        'هندسة الظروف الحرارية القصوى التي تحول الخامات الجيولوجية إلى ركائز الصناعة الحديثة.',
      primaryCta: 'استكشاف الهندسة الحرارية',
      secondaryCta: 'التعرف على خبراتنا',
      scrollPrompt: 'مرر للأسفل لبدء التحول',
      stagePrefix: 'المرحلة',
      stages: [
        {
          label: 'المادة الخام',
          captionTitle: 'خام جيولوجي كثيف',
          captionBody: 'كتلة معدنية أولية في حالة توازن حراري قبل بدء التحميل الحراري.',
          thermalBand: '24 °C — 420 °C',
        },
        {
          label: 'التفكك الأولي',
          captionTitle: 'التشقق الحراري وبداية التفكك',
          captionBody:
            'يتغلغل التدفق الإشعاعي المنضبط عبر الشقوق لفصل الشظايا المعدنية الأولى من الحافة.',
          thermalBand: '850 °C — 1,180 °C',
        },
        {
          label: 'إطلاق الطاقة',
          captionTitle: 'ذروة التكليس وتحرر الأطوار',
          captionBody:
            'تكسر الحرارة القصوى الروابط الجزيئية فتتساقط الجسيمات المتوهجة بتأثير الجاذبية.',
          thermalBand: '1,450 °C — 1,680 °C',
        },
        {
          label: 'التحول المكتمل',
          captionTitle: 'بنية بلورية مكررة ومتزنة',
          captionBody:
            'تستقر الطاقة الحرارية لتكشف عن بنية معدنية ملبدة نقية وعالية التجانس.',
          thermalBand: 'توازن التلبيد',
        },
      ],
    },
    philosophy: {
      kicker: 'فلسفتنا الهندسية',
      heading: 'الانضباط الهندسي عند حدود الحرارة القصوى.',
      lead: 'غالباً ما يُنظر إلى الأفران الصناعية كمنشآت حرارية ضخمة فقط، بينما نصممها كأدوات ديناميكية حرارية فائقة الدقة. عند دخول الحجر الخام إلى بيئة 1,600 درجة مئوية، تحدد هندسة الحراريات وزمن المكوث نقاء الكلنكر وكفاءة الطاقة.',
      secondary:
        'من الأفران الدوارة لصناعة الإسمنت إلى أفران التلبيد متعددة المناطق، تُبنى كل منظومة وفق منحنى التحول الدقيق لخاماتكم.',
      continuumTitle: 'سلسلة التحول الحراري',
      continuumMeta: 'المادة الخام · الطاقة · التحول · المادة المكررة',
      pillars: [
        {
          index: '01',
          phase: 'المادة الخام',
          title: 'توصيف الخامات الجيولوجية',
          description:
            'تبدأ كل هندسة فرن بتحليل المعادن والكثافة والرطوبة وعتبات التشقق الحراري قبل اختيار بطانة الحراريات.',
          status: 'normal',
          statusLabel: 'تغذية مستقرة',
        },
        {
          index: '02',
          phase: 'الطاقة',
          title: 'التدفق الإشعاعي وهندسة اللهب',
          description:
            'تصمم غرف الاحتراق لدينا لهباً متجانساً مع استرجاع حراري مرحلي لتفادي النقاط الباردة وتقليص استهلاك الوقود.',
          status: 'warning',
          statusLabel: 'تدفق حراري مرتفع',
        },
        {
          index: '03',
          phase: 'التحول',
          title: 'التكليس والكلنكرة المنضبطة',
          description:
            'داخل ممر التلبيد، يضمن التحكم الدقيق في زمن المكوث وكيمياء الغازات نمواً بلورياً متجانساً دون صدمة حرارية.',
          status: 'critical',
          statusLabel: 'ذروة التكليس',
        },
        {
          index: '04',
          phase: 'المادة المكررة',
          title: 'التبريد والاسترجاع الحراري',
          description:
            'يثبت التبريد السريع البنية البلورية ويعيد توجيه الحرارة المسترجعة إلى مرحلة التسخين المسبق.',
          status: 'normal',
          statusLabel: 'مخرجات مستقرة',
        },
      ],
    },
    expertise: {
      kicker: 'الخبرات الأساسية',
      heading: 'مصممة لعقود من التشغيل الحراري المستمر.',
      lead: 'يُهندس كل نظام فرعي — من محركات الأسطوانة إلى العوازل الحرارية — لتحقيق موثوقية صناعية عالية تحت الدورات الحرارية المتواصلة.',
      domains: [
        {
          number: '01',
          title: 'الأفران الدوارة ومكلسات التعليق',
          detail:
            'تصميم ديناميكي للأسطوانات والمحامل ومواقد متعددة القنوات للتشغيل المستمر على مدار الساعة في مصانع الإسمنت والمعادن.',
          spec: 'تشغيل مستمر حتى 1,750 °C',
        },
        {
          number: '02',
          title: 'هندسة البطانات الحرارية المركبة',
          detail:
            'بطانات متعددة الطبقات محسوبة بالإجهاد الحراري لإطالة عمر الحملات التشغيلية وتقليل الفاقد الإشعاعي.',
          spec: 'حراريات عالية الألومينا متعددة المناطق',
        },
        {
          number: '03',
          title: 'الأنظمة الهجينة وخفض الكربون',
          detail:
            'مواقد مرنة الوقود ومُسخنات مسبقة هجينة تسهل الانتقال إلى الوقود البديل والطاقة الحرارية منخفضة الانبعاثات.',
          spec: 'استرجاع حراري مغلق للغازات',
        },
      ],
      materialsKicker: 'ملفات تحول المواد',
      materialsHeading: 'من الخام الجيولوجي إلى الأساس الصناعي.',
      peakRegimeLabel: 'ذروة الحرارة',
      residenceLabel: 'زمن المكوث',
      atmosphereLabel: 'أجواء المعالجة',
      corridorLabel: 'تسلسل الممر الحراري',
      profiles: [
        {
          id: 'clinker',
          rawMaterial: 'الحجر الجيري والطين',
          refinedOutput: 'كلنكر بورتلاند',
          peakTemp: '1,450 °C',
          kilnArchitecture: 'فرن دوار بمكلس مسبق متعدد المراحل',
          atmosphere: 'مؤكسدة · هواء ثانوي مضبوط',
          residenceTime: '32 — 40 دقيقة',
          status: 'normal',
          statusLabel: 'كلنكرة مثالية',
          summary:
            'يحقق التسخين المسبق بالتعليق مع التلبيد الدوار تبلوراً متكاملاً للكلنكر مع تقليص انبعاثات أكاسيد النيتروجين.',
          thermalProfile: [
            { zone: 'التجفيف والتسخين المسبق', range: '200 — 850 °C', role: 'إزالة الرطوبة وتسخين الخليط الخام' },
            { zone: 'التكليس', range: '850 — 1,100 °C', role: 'تفكك الكربونات الماص للحرارة' },
            { zone: 'منطقة التلبيد', range: '1,350 — 1,450 °C', role: 'الانصهار الجزئي وتكوين حبيبات الكلنكر' },
            { zone: 'التبريد الشبكي', range: '1,450 — 120 °C', role: 'تثبيت البلورات واسترجاع الطاقة الحرارية' },
          ],
        },
        {
          id: 'alumina',
          rawMaterial: 'البوكسيت والجيبسيت',
          refinedOutput: 'ألومينا ألفا مكلسة',
          peakTemp: '1,280 °C',
          kilnArchitecture: 'مكلس بالطبقة المميعة والتعليق الغازي',
          atmosphere: 'احتراق نظيف منخفض الرطوبة',
          residenceTime: '18 — 25 دقيقة',
          status: 'normal',
          statusLabel: 'تمييع مستقر',
          summary:
            'يمنع التجانس الحراري الدقيق التلبيد الزائد ويحافظ على التوزيع الحبيبي المطلوب للصهر والحراريات المتقدمة.',
          thermalProfile: [
            { zone: 'نزع الرطوبة', range: '150 — 400 °C', role: 'إزالة المياه الحرة والبلورية' },
            { zone: 'الطور الانتقالي', range: '550 — 950 °C', role: 'تطوير المسامية المتوازنة لألومينا غاما' },
            { zone: 'التحول إلى ألفا', range: '1,150 — 1,280 °C', role: 'تثبيت بلوري متجانس' },
            { zone: 'التبريد المرحلي', range: '1,280 — 90 °C', role: 'تسخين مسبق لهواء الاحتراق' },
          ],
        },
        {
          id: 'ceramic',
          rawMaterial: 'الكاولين والأكاسيد التقنية',
          refinedOutput: 'سيراميك تقني ملبد',
          peakTemp: '1,620 °C',
          kilnArchitecture: 'فرن نفق عالي الحرارة متعدد الوحدات',
          atmosphere: 'تحكم منطقي دقيق في O₂ / N₂',
          residenceTime: '6 — 14 ساعة',
          status: 'warning',
          statusLabel: 'حساسية المنحدر الحراري',
          summary:
            'تمنع المنحدرات الإشعاعية متعددة المناطق التشققات الدقيقة وتوفر كثافة بنيوية قريبة من القيمة النظرية.',
          thermalProfile: [
            { zone: 'إزالة الروابط', range: '180 — 620 °C', role: 'تطاير تدريجي دون إجهاد داخلي' },
            { zone: 'التلبيد الأولي', range: '620 — 1,200 °C', role: 'ترابط الحبيبات والانكماش المضبوط' },
            { zone: 'ذروة التكثيف', range: '1,520 — 1,620 °C', role: 'إغلاق المسام وتوازن البنية المجهرية' },
            { zone: 'التلدين التدريجي', range: '1,620 — 180 °C', role: 'تخفيف الإجهاد دون صدمة حرارية' },
          ],
        },
        {
          id: 'silica',
          rawMaterial: 'كوارتز عالي النقاء',
          refinedOutput: 'سيليكا صناعية منصهرة',
          peakTemp: '1,740 °C',
          kilnArchitecture: 'فرن هجين كهربائي إشعاعي',
          atmosphere: 'خامل · نقاء فائق',
          residenceTime: '45 — 75 دقيقة',
          status: 'critical',
          statusLabel: 'نطاق حراري أقصى',
          summary:
            'عناصر تسخين إشعاعية دون تلامس مع بطانات عالية الألومينا تمنع الشوائب المعدنية خلال دورات التزجج.',
          thermalProfile: [
            { zone: 'التحول ألفا-بيتا', range: '450 — 650 °C', role: 'تمدد شبكي منضبط عند 573 °C' },
            { zone: 'منحدر الكريستوباليت', range: '900 — 1,420 °C', role: 'تفريغ الشوائب الهيدروكسيلية الدقيقة' },
            { zone: 'قلب التزجج', range: '1,680 — 1,740 °C', role: 'انصهار حراري نقي للغاية' },
            { zone: 'التثبيت', range: '1,740 — 220 °C', role: 'منع إعادة التبلور غير المرغوب' },
          ],
        },
      ],
    },
    consultation: {
      kicker: 'استشارة هندسية',
      heading: 'حدد مواصفات منظومة التحول الحراري القادمة.',
      lead: 'شاركنا طبيعة الخامات والطاقة الإنتاجية والمنحنى الحراري المستهدف ليعد مهندسونا تقييماً أولياً للميزان الحراري.',
      locations: 'مركز هندسة الإسمنت · مخبر الهندسة الحرارية',
      emailContact: 'engineering@kilnova-thermics.example',
      receivedTitle: 'تم استلام الملف الهندسي.',
      receivedPrefix: 'شكراً لك،',
      receivedMiddle: 'تم تسجيل مواصفات الدراسة الحرارية الخاصة بـ',
      receivedDossier: 'تحت الرقم المرجعي',
      submitAnother: 'إرسال طلب مواصفات آخر',
      fields: {
        fullName: 'الاسم الكامل',
        fullNamePlaceholder: 'م. طاهر بن علي',
        organization: 'المؤسسة / المصنع',
        organizationPlaceholder: 'شركة الإسمنت SCAEK',
        email: 'البريد الإلكتروني المهني',
        emailPlaceholder: 'engineer@company.dz',
        architecture: 'هندسة الفرن',
        brief: 'الخامات والمتطلبات الحرارية',
        briefPlaceholder: 'حدد المادة الخام ودرجة الحرارة القصوى والطاقة الإنتاجية اليومية...',
        submit: 'طلب دراسة حرارية',
      },
      architectures: [
        'فرن دوار للتكليس',
        'فرن نفق مستمر للتلبيد',
        'مكلس بالطبقة المميعة',
        'فرن هجين كهربائي إشعاعي',
      ],
      errors: {
        fullName: 'يرجى إدخال الاسم الكامل.',
        organization: 'يرجى إدخال اسم المؤسسة أو المصنع.',
        email: 'يرجى إدخال بريد إلكتروني مهني صحيح.',
        brief: 'يرجى وصف الخامات أو النظام الحراري (12 حرفاً على الأقل).',
      },
      footerCopy: 'كيلنوفا للهندسة الحرارية. أنظمة الأفران الصناعية وتحول المواد.',
    },
  },
};
