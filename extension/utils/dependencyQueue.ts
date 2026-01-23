import { fetchDependencies, type DependencyDecision, type DependenciesResponse } from './dependenciesApi';
import {
  getDependencyState,
  setDependencyState,
  type DependencyQueueItem,
  getEventIdFromUrl,
} from './eventStorage';

interface ProcessDecisionInput {
  eventUrl: string;
  keep: boolean;
  fallbackDecision?: DependencyDecision;
  fallbackWeight?: number;
  risk?: number;
}

export interface DependencyDecisionResult {
  response?: DependenciesResponse;
  queue: DependencyQueueItem[];
  visited: string[];
}

function toUnique(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

function extractQueueUrls(items: DependencyQueueItem[]): string[] {
  return items.map(item => item.url).filter(Boolean);
}

function extractQueueIds(items: DependencyQueueItem[]): string[] {
  return items.map(item => item.id).filter(Boolean);
}

function deduplicateQueue(items: DependencyQueueItem[]): DependencyQueueItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function normalizeRisk(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) {
    return 50;
  }
  if ((value as number) < 0) {
    return 0;
  }
  if ((value as number) > 100) {
    return 100;
  }
  return value as number;
}

// Topic detection for sample fallback
type TopicType = 'politics' | 'crypto' | 'sports' | 'economy' | 'default';

function detectTopic(question: string, slug: string): TopicType {
  const text = `${question} ${slug}`.toLowerCase();

  // Politics keywords
  const politicsKeywords = [
    'trump', 'biden', 'republican', 'democrat', 'senate', 'congress',
    'election', 'president', 'governor', 'vote', 'political', 'gop',
    'white house', 'cabinet', 'nomination', 'impeach', 'legislation'
  ];
  if (politicsKeywords.some(kw => text.includes(kw))) {
    return 'politics';
  }

  // Crypto keywords
  const cryptoKeywords = [
    'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain',
    'solana', 'sol', 'dogecoin', 'doge', 'token', 'defi', 'nft'
  ];
  if (cryptoKeywords.some(kw => text.includes(kw))) {
    return 'crypto';
  }

  // Sports keywords
  const sportsKeywords = [
    'nba', 'nfl', 'mlb', 'nhl', 'championship', 'playoff', 'super bowl',
    'world series', 'finals', 'lakers', 'celtics', 'yankees', 'soccer',
    'football', 'basketball', 'baseball', 'hockey', 'tennis', 'golf'
  ];
  if (sportsKeywords.some(kw => text.includes(kw))) {
    return 'sports';
  }

  // Economy keywords
  const economyKeywords = [
    'gdp', 'inflation', 'fed', 'interest rate', 'recession', 'stock',
    'market', 's&p', 'nasdaq', 'dow', 'economy', 'unemployment', 'cpi'
  ];
  if (economyKeywords.some(kw => text.includes(kw))) {
    return 'economy';
  }

  return 'default';
}

interface SampleData {
  url: string;
  question: string;
  relation: string;
  explanation: string;
  imageUrl: string; // empty string = fetch real image from Polymarket
  probability: number;
  yesPercentage: number;
  noPercentage: number;
}

// AI Bubble Burst specific dependencies
interface AiBubbleDependency extends SampleData {
  id: string;
  parentId: string | null; // null = root level
}

const S3 = 'https://polymarket-upload.s3.us-east-2.amazonaws.com/';

// ~100 distinct real Polymarket market images for visual variety
const DEMO_IMAGES = {
  // === POLITICS & GEOPOLITICS (25) ===
  greenland: `${S3}will-trump-acquire-greenland-in-2025-5ZDkcIGhdBMW.jpg`,
  greenland2: `${S3}will-the-us-acquire-any-part-of-greenland-in-2026-2R7qodX0Zv-z.jpg`,
  election: `${S3}presidential-election-winner-2024-afdda358-219d-448a-abb5-ba4d14118d71.png`,
  trump: `${S3}how-high-will-trumps-approval-rating-go-in-2026-PXwVP-adEwjM.jpg`,
  trumpDeport: `${S3}how-many-people-will-trump-deport-in-2025-itZ0rMnIYuju.jpg`,
  trumpImpeach: `${S3}will-trump-be-impeached-in-2025-bm5xwPQil7AC.jpg`,
  trumpResign: `${S3}will-trump-resign-in-2025-xcz2AkFjPF5X.jpg`,
  trumpTariffs: `${S3}will-the-supreme-court-rule-in-favor-of-trumps-tariffs-aY--iE5cZi0Z.jpg`,
  insurrection: `${S3}trump-invokes-the-insurrection-act-before-august-jR3s2WWoaIbY.jpg`,
  cabinet: `${S3}who-will-be-the-first-to-leave-the-trump-cabinet-7yoh_QeiiNXH.jpg`,
  epstein: `${S3}who-will-be-named-in-newly-relased-epstein-files-lXkJUlrx1jd2.jpg`,
  portugal: `${S3}portugal-presidential-election-_h_A97vllNOX.png`,
  vietnam: `${S3}next-prime-minister-of-vietnam-oe_DNIttarvX.png`,
  venezuela: `${S3}venezuela-leader-end-of-2026-lOfqbUxiKAsg.png`,
  venezuelaInvade: `${S3}will-the-us-invade-venezuela-in-2025-1rL-noxxRItP.jpg`,
  iran: `${S3}us-strikes-iran-by-october-3-2sVnIHq3sjqF.jpg`,
  iranNext: `${S3}us-next-strikes-iran-on-i8O7r2SBkycN.jpg`,
  iranRegime: `${S3}will-the-iranian-regime-fall-in-2025-YLXIniTmQs4q.png`,
  iranNuke: `${S3}will-israel-nuke-iran-by-january-31-p8b6Dxy2E4sa.jpg`,
  iranWar: `${S3}will-the-united-states-officially-declare-war-on-iran-before-july-8K0tG8pCCpVY.jpg`,
  khamenei: `${S3}khamenei-out-as-supreme-leader-of-iran-in-2025-VNDMf5RqFLwB.jpg`,
  ukraine: `${S3}russia-x-ukraine-ceasefire-in-2025-w2voYOygx80B.jpg`,
  ukraineCeasefire: `${S3}russia-x-ukraine-ceasefire-before-july-GSNGh26whPic.jpg`,
  china: `${S3}china-invades-taiwan-in-2025-CCSd9dX2mrea.jpg`,
  usStrikes: `${S3}next-country-us-strikes-33B5vAP0Ah_C.jpg`,

  // === FINANCE & FED (15) ===
  powell: `${S3}jerome+powell+glasses1.png`,
  fedChair: `${S3}who-will-trump-nominate-as-fed-chair-9p19ttRwsbKL.png`,
  fedRates: `${S3}how-many-fed-rate-cuts-in-2025-9qstZkSL1dn0.jpg`,
  tariffRevenue: `${S3}how-much-revenue-will-the-us-raise-from-tariffs-in-2025-lUbEhM1AK-xa.jpg`,
  tariffs250b: `${S3}will-tariffs-generate-250b-in-2025-C4N7xChXvMV4.jpg`,
  elonBudget: `${S3}will-elon-cut-the-budget-by-at-least-10-in-2025-KQWXFwQwSRYV.jpg`,
  elonBudget5: `${S3}will-elon-cut-the-budget-by-at-least-5-in-2025-YEZDluotrm-Q.jpg`,
  elonDoge: `${S3}how-much-spending-will-elon-and-doge-cut-in-2025--_AiUomi1ndd.jpg`,
  largest: `${S3}largest-company-eoy-KS99l6lbxfCc.jpg`,
  apple: `${S3}will-apple-be-the-largest-company-in-the-world-by-market-cap-on-december-31-pbFWqs73s_IJ.png`,
  nvidia: `${S3}will-nvidia-be-the-largest-company-in-the-world-by-market-cap-on-december-31-g6lIgsIlD7lN.jpg`,
  microsoft: `${S3}will-microsoft-be-the-largest-company-in-the-world-by-market-cap-on-december-31-C8B3xdggFH2U.png`,
  amazon: `${S3}will-amazon-be-the-largest-company-in-the-world-by-market-cap-on-december-31-BqBnLaLkz49q.jpg`,
  tesla: `${S3}will-tesla-be-the-largest-company-in-the-world-by-market-cap-on-december-31-tu4lToXGy3zn.png`,
  alphabet: `${S3}will-alphabet-be-the-largest-company-in-the-world-by-market-cap-on-december-31-lEzVRf5o__Mf.png`,

  // === CRYPTO (15) ===
  btc: `${S3}BTC+fullsize.png`,
  eth: `${S3}ETH+fullsize.jpg`,
  sol: `${S3}SOL-logo.png`,
  xrp: `${S3}XRP-logo.png`,
  sentient: `${S3}will-sentient-launch-a-token-in-2025-jWZGMwqJlYLe.jpg`,
  megaeth: `${S3}megaeth-market-cap-fdv-one-day-after-launch-KzYK3qwuIK8t.jpg`,
  infinex: `${S3}will-infinex-launch-a-token-this-year-2ODwjGRZqGL-.jpg`,
  puffpaw: `${S3}puffpaw-fdv-above-one-day-after-launch-LifCgtfa8s9_.jpg`,
  goldVsEth: `${S3}first-to-5k-gold-or-eth-9Zt2RB0rwODb.jpg`,
  flyingTulip: `${S3}will-flying-tulip-launch-a-token-by-kflNNo9zxKLD.jpg`,
  spaceSale: `${S3}space-public-sale-total-commitments-HEww4Z7f0iLw.png`,

  // === AI & TECH (20) ===
  aiModel: `${S3}which-company-has-best-ai-model-end-of-september-MmASwbTkwKHi.jpg`,
  aiModelTop: `${S3}which-company-has-top-ai-model-end-of-september-rg060DKa_VSI.jpg`,
  teslaFsd: `${S3}tesla-launches-unsupervised-full-self-driving-fsd-by-june-30-yvpjn3RX4Q2w.jpg`,
  grok: `${S3}grok-4pt20-released-on-QvsrIdJVvP51.jpg`,
  grok2: `${S3}grok-4pt20-released-by-FREAnoCYA7aN.jpg`,
  acquisitions: `${S3}which-companies-will-be-acquired-before-2027-s3oFXGknOa38.jpg`,
  alibaba: `${S3}will-alibaba-have-the-top-ai-model-on-march-31-jSpk4aBgTVpy.png`,
  deepseek: `${S3}will-deepseek-have-the-top-ai-model-on-march-31-puDB2eDJx4-L.png`,
  openai: `${S3}will-openai-have-the-top-ai-model-on-february-28-3eaAmSON076D.jpg`,
  xai: `${S3}will-xai-have-the-top-ai-model-on-february-28-u3iUE4o3SB1s.jpg`,
  anthropic: `${S3}will-anthropic-have-the-top-ai-model-on-february-28-2aPXb3voV_7Y.png`,
  anthropicIpo: `${S3}anthropic-ipo-closing-market-cap-jdfele1g0krx.png`,
  google: `${S3}will-google-have-the-top-ai-model-on-february-28-MS2LhSAdlHGk.jpg`,
  baidu: `${S3}will-baidu-have-the-best-ai-model-at-the-end-of-january-2026-MWj8PQJLsiaa.png`,
  gpt5: `${S3}when-will-gpt-5-be-released-vIPhU76RogZc.jpg`,
  gemini: `${S3}highest-gemini-scores-on-frontiermath-benchmark-by-november-30-m3bEm-QLoNE.jpg`,
  chatbotArena: `${S3}which-ai-will-be-the-first-to-hit-1500-on-chatbot-arena-qbZUykYXIPTG.png`,
  aiCoding: `${S3}which-company-will-have-the-best-ai-model-for-coding-at-the-end-of-2025-6TeV-9Z18H9z.png`,
  openaiIpo: `${S3}openai-ipo-by-qeh3ouQDANVw.jpg`,
  musk: `${S3}will-elon-musk-win-his-case-against-sam-altman-3b7rjuMNHGHy.jpg`,

  // === SCIENCE & SPACE (10) ===
  spacex: `${S3}how-many-spacex-starship-launches-reach-space-in-2025-tjnLOs2vfvOH.jpg`,
  spacexLaunches: `${S3}how-many-spacex-launches-in-2025-H9bLc6Yotwva.jpg`,
  starship: `${S3}spacex-starship-flight-test-10-KJ2wEPdcMh5k.jpg`,
  doge1: `${S3}will-the-doge-1-lunar-mission-launch-before-2027-wrmn3EafBT0g.jpg`,
  earthquake: `${S3}earthquake-7pt0-or-above-by-august-31-698-AANrykUigfWS.jpg`,
  meteor: `${S3}5kt-meteor-strike-in-2025-GIAKiKaSKYsr.jpg`,
  temperature: `${S3}february-2025-temperature-increase-c-fr_fUwG_Bhn4.jpg`,
  climate: `${S3}earth+on+fire.png`,
  alien: `${S3}alien+head.jpeg`,
  medline: `${S3}medline-ipo-closing-market-cap-ACPC6jwYvP6i.png`,

  // === POP CULTURE & ENTERTAINMENT (10) ===
  elonTweets: `${S3}elon-musk-of-tweets-nov-22-29-apMPG21-pzx_.jpg`,
  gta6: `${S3}what-will-happen-before-gta-vi-7hpNkEzQEqUE.jpg`,
  gta6Price: `${S3}gta-6-launch-price-l4GiOIOGhdvA.jpg`,
  oscars: `${S3}oscars-2026-best-picture-nominations-uExlgIhppb3W.jpg`,
  avatar3: `${S3}avatar-fire-and-ash-opening-weekend-box-office-pK2RqUUCw8Xf.png`,
  strangerThings: `${S3}new-stranger-things-episode-released-by-wednesday-4NShFZwCps4u.jpg`,
  beastGames: `${S3}who-will-win-the-beast-games-TZVXn3nKI8OT.jpg`,
  honnold: `${S3}how-long-will-it-take-alex-honnold-to-free-solo-taipei-101-sVnyRt8wRFGj.jpg`,
  lightyear: `${S3}lightyear+movie.png`,
  magnus: `${S3}magnus+carlsen.png`,

  // === SPORTS (15) ===
  football: `${S3}football-logo.png`,
  nfl: `${S3}nfl.png`,
  basketball: `${S3}super+cool+basketball+in+red+and+blue+wow.png`,
  chiefs: `${S3}NFL+Team+Logos/KC.png`,
  cowboys: `${S3}NFL+Team+Logos/DAL.png`,
  eagles: `${S3}NFL+Team+Logos/PHI.png`,
  bills: `${S3}NFL+Team+Logos/BUF.png`,
  ravens: `${S3}NFL+Team+Logos/BAL.png`,
  niners: `${S3}NFL+Team+Logos/SF.png`,
  lions: `${S3}NFL+Team+Logos/DET.png`,
  packers: `${S3}NFL+Team+Logos/GB.png`,
  t1: `${S3}team_logos/esports/lol/league-of-legends_t1_126061.png`,
  jdg: `${S3}team_logos/esports/lol/league-of-legends_jd%20gaming_318.png`,
  vitality: `${S3}team_logos/esports/cs2/Vitality-lGUYkcooGw0f.png`,
  zelenskyySuit: `${S3}will-volodymyr-zelenskyy-wear-a-suit-to-next-meeting-with-trump-ytsYzDGZgeGM.jpg`,

  // === HEALTH & MISC (5) ===
  measles: `${S3}1200-measles-cases-in-us-before-june-jPVnjl81lNC-.jpg`,
  snow: `${S3}will-there-be-less-than-2-inches-of-snow-in-nyc-in-jan-cR-YMrmPeNLc.jpg`,
  snowMonth: `${S3}how-many-inches-of-snow-in-nyc-this-month-W0n5T_VJiLeR.jpg`,
  nft: `${S3}weareallgoingtodie2.png`,
  nato: `${S3}will-nato-declare-a-no-fly-zone-over-any-ukrainian-territory-by-april-30-2022-fd452f43-515c-433f-9a15-31fa05af8936.png`,
};

// Helper to get a random image from the collection
const DEMO_IMAGE_VALUES = Object.values(DEMO_IMAGES);
const getRandomDemoImage = (index: number) => DEMO_IMAGE_VALUES[index % DEMO_IMAGE_VALUES.length];

// Detect if we're on an AI-related event page (triggers demo mode with tree structure)
function isAiBubbleBurstEvent(url: string): boolean {
  const normalizedUrl = url.toLowerCase();
  // Match any AI/tech-related market for demo purposes
  return normalizedUrl.includes('ai-bubble') ||
         normalizedUrl.includes('ai-industry') ||
         normalizedUrl.includes('ai-winter') ||
         normalizedUrl.includes('anthropic') ||
         normalizedUrl.includes('openai') ||
         normalizedUrl.includes('ai-model') ||
         normalizedUrl.includes('gpt-') ||
         normalizedUrl.includes('claude') ||
         normalizedUrl.includes('best-ai') ||
         normalizedUrl.includes('nvidia') ||
         normalizedUrl.includes('semiconductor') ||
         normalizedUrl.includes('tech-ipo');
}

// 50 hardcoded AI bubble burst dependencies in tree structure
const AI_BUBBLE_BURST_DEPENDENCIES: AiBubbleDependency[] = [
  // ============================================
  // LEVEL 1 (ROOT) - First 5 shown initially
  // ============================================
  {
    id: 'ai-bubble-1',
    parentId: null,
    url: 'https://polymarket.com/event/which-company-has-the-best-ai-model-end-of-january',
    question: 'Which company will have the best AI model by end of January 2026?',
    relation: 'IMPLIES',
    explanation: 'AI model leadership determines valuations - key indicator of bubble health',
    imageUrl: DEMO_IMAGES.aiModel,
    probability: 0.72,
    yesPercentage: 72,
    noPercentage: 28,
  },
  {
    id: 'ai-bubble-2',
    parentId: null,
    url: 'https://polymarket.com/event/nvidia-stock-price-end-of-2026',
    question: 'Will NVIDIA stock reach $200 by end of 2026?',
    relation: 'IMPLIES',
    explanation: 'NVIDIA stock is the bellwether for AI bubble - major decline signals burst',
    imageUrl: DEMO_IMAGES.nvidia,
    probability: 0.45,
    yesPercentage: 45,
    noPercentage: 55,
  },
  {
    id: 'ai-bubble-3',
    parentId: null,
    url: 'https://polymarket.com/event/openai-ipo-by',
    question: 'Will OpenAI go public by December 2026?',
    relation: 'CONDITIONED_ON',
    explanation: 'OpenAI going public signals AI market maturity; delays signal trouble',
    imageUrl: DEMO_IMAGES.openai,
    probability: 0.28,
    yesPercentage: 28,
    noPercentage: 72,
  },
  {
    id: 'ai-bubble-4',
    parentId: null,
    url: 'https://polymarket.com/event/fed-decision-in-january',
    question: 'Will the Fed cut interest rates in January 2026?',
    relation: 'IMPLIES',
    explanation: 'Aggressive rate cuts often signal economic stress and market correction',
    imageUrl: DEMO_IMAGES.powell,
    probability: 0.35,
    yesPercentage: 35,
    noPercentage: 65,
  },
  {
    id: 'ai-bubble-5',
    parentId: null,
    url: 'https://polymarket.com/event/anthropic-ipo-closing-market-cap',
    question: "What will be Anthropic's market cap at IPO?",
    relation: 'CORRELATED',
    explanation: 'Anthropic valuation reflects AI sector investment sentiment',
    imageUrl: DEMO_IMAGES.anthropic,
    probability: 0.38,
    yesPercentage: 38,
    noPercentage: 62,
  },

  // ============================================
  // BRANCH 1: AI Model Leadership (children of ai-bubble-1)
  // ============================================
  {
    id: 'ai-bubble-1-1',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/grok-4pt20-released-by',
    question: 'Will xAI release Grok 4.20 before March 2026?',
    relation: 'CONDITIONED_ON',
    explanation: 'Grok release timing indicates xAI competitive position',
    imageUrl: DEMO_IMAGES.grok,
    probability: 0.45,
    yesPercentage: 45,
    noPercentage: 55,
  },
  {
    id: 'ai-bubble-1-2',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/gpt-5-release-date',
    question: 'When will OpenAI release GPT-5?',
    relation: 'IMPLIES',
    explanation: 'GPT-5 release impacts AI leadership and market expectations',
    imageUrl: DEMO_IMAGES.gpt5,
    probability: 0.52,
    yesPercentage: 52,
    noPercentage: 48,
  },
  {
    id: 'ai-bubble-1-3',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/claude-model-rankings-2026',
    question: 'Will Claude be ranked #1 AI model in 2026?',
    relation: 'CORRELATED',
    explanation: 'Claude rankings reflect Anthropic competitive strength',
    imageUrl: DEMO_IMAGES.anthropicIpo,
    probability: 0.35,
    yesPercentage: 35,
    noPercentage: 65,
  },
  {
    id: 'ai-bubble-1-4',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/gemini-2-0-launch',
    question: 'Will Google release Gemini 2.0 in Q1 2026?',
    relation: 'CORRELATED',
    explanation: 'Gemini progress indicates Google AI investment commitment',
    imageUrl: DEMO_IMAGES.google,
    probability: 0.68,
    yesPercentage: 68,
    noPercentage: 32,
  },
  {
    id: 'ai-bubble-1-5',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/meta-llama-4-release',
    question: 'Will Meta release Llama 4 before June 2026?',
    relation: 'WEAK_SIGNAL',
    explanation: 'Open source AI progress affects industry dynamics',
    imageUrl: DEMO_IMAGES.aiModelTop,
    probability: 0.55,
    yesPercentage: 55,
    noPercentage: 45,
  },
  {
    id: 'ai-bubble-1-6',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/apple-ai-model-2026',
    question: 'Will Apple launch a competitive AI model in 2026?',
    relation: 'WEAK_SIGNAL',
    explanation: 'Apple AI entry signals mainstream market maturation',
    imageUrl: DEMO_IMAGES.apple,
    probability: 0.42,
    yesPercentage: 42,
    noPercentage: 58,
  },
  {
    id: 'ai-bubble-1-7',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/amazon-ai-model-2026',
    question: 'Will Amazon release a frontier AI model in 2026?',
    relation: 'WEAK_SIGNAL',
    explanation: 'Amazon AI investment signals cloud provider competition',
    imageUrl: DEMO_IMAGES.amazon,
    probability: 0.38,
    yesPercentage: 38,
    noPercentage: 62,
  },
  {
    id: 'ai-bubble-1-8',
    parentId: 'ai-bubble-1',
    url: 'https://polymarket.com/event/will-elon-musk-win-his-case-against-sam-altman',
    question: 'Will Elon Musk win his lawsuit against Sam Altman?',
    relation: 'CONDITIONED_ON',
    explanation: 'Legal outcomes affect OpenAI structure and AI industry dynamics',
    imageUrl: DEMO_IMAGES.musk,
    probability: 0.35,
    yesPercentage: 35,
    noPercentage: 65,
  },

  // ============================================
  // BRANCH 2: NVIDIA/Chips (children of ai-bubble-2)
  // ============================================
  {
    id: 'ai-bubble-2-1',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/amd-market-cap-2026',
    question: "Will AMD's market cap exceed $300B in 2026?",
    relation: 'CORRELATED',
    explanation: 'AMD valuation reflects AI chip market competition',
    imageUrl: DEMO_IMAGES.largest,
    probability: 0.32,
    yesPercentage: 32,
    noPercentage: 68,
  },
  {
    id: 'ai-bubble-2-2',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/intel-turnaround-2026',
    question: 'Will Intel return to profitability by Q4 2026?',
    relation: 'WEAK_SIGNAL',
    explanation: 'Intel recovery affects overall semiconductor market health',
    imageUrl: DEMO_IMAGES.acquisitions,
    probability: 0.45,
    yesPercentage: 45,
    noPercentage: 55,
  },
  {
    id: 'ai-bubble-2-3',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/semiconductor-etf-price-2026',
    question: 'Will SOXX ETF reach $300 by end of 2026?',
    relation: 'IMPLIES',
    explanation: 'Semiconductor ETF reflects overall chip sector health',
    imageUrl: DEMO_IMAGES.goldVsEth,
    probability: 0.48,
    yesPercentage: 48,
    noPercentage: 52,
  },
  {
    id: 'ai-bubble-2-4',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/h100-rental-prices-2026',
    question: 'Will H100 rental prices drop 50% by end of 2026?',
    relation: 'CONTRADICTS',
    explanation: 'GPU rental price crash signals oversupply and bubble burst',
    imageUrl: DEMO_IMAGES.megaeth,
    probability: 0.38,
    yesPercentage: 38,
    noPercentage: 62,
  },
  {
    id: 'ai-bubble-2-5',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/taiwan-china-conflict-2026',
    question: 'Will China take military action against Taiwan in 2026?',
    relation: 'IMPLIES',
    explanation: 'Taiwan conflict would devastate chip supply chains',
    imageUrl: DEMO_IMAGES.china,
    probability: 0.08,
    yesPercentage: 8,
    noPercentage: 92,
  },
  {
    id: 'ai-bubble-2-6',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/us-chip-export-restrictions-2026',
    question: 'Will US expand chip export restrictions in 2026?',
    relation: 'CONDITIONED_ON',
    explanation: 'Export restrictions affect AI chip demand and company revenues',
    imageUrl: DEMO_IMAGES.trumpTariffs,
    probability: 0.62,
    yesPercentage: 62,
    noPercentage: 38,
  },
  {
    id: 'ai-bubble-2-7',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/data-center-capex-2026',
    question: 'Will data center CapEx exceed $300B globally in 2026?',
    relation: 'IMPLIES',
    explanation: 'Data center spending reflects AI infrastructure investment',
    imageUrl: DEMO_IMAGES.spacex,
    probability: 0.72,
    yesPercentage: 72,
    noPercentage: 28,
  },
  {
    id: 'ai-bubble-2-8',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/qualcomm-ai-chips-2026',
    question: 'Will Qualcomm AI chip revenue exceed $10B in 2026?',
    relation: 'CORRELATED',
    explanation: 'Mobile AI chip growth indicates edge AI market health',
    imageUrl: DEMO_IMAGES.teslaFsd,
    probability: 0.45,
    yesPercentage: 45,
    noPercentage: 55,
  },
  {
    id: 'ai-bubble-2-9',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/broadcom-ai-revenue-2026',
    question: "Will Broadcom's AI revenue exceed $15B in 2026?",
    relation: 'CORRELATED',
    explanation: 'Broadcom AI networking revenue reflects data center build-out',
    imageUrl: DEMO_IMAGES.fedChair,
    probability: 0.58,
    yesPercentage: 58,
    noPercentage: 42,
  },
  {
    id: 'ai-bubble-2-10',
    parentId: 'ai-bubble-2',
    url: 'https://polymarket.com/event/semiconductor-shortage-2026',
    question: 'Will there be a semiconductor shortage in 2026?',
    relation: 'CONTRADICTS',
    explanation: 'Shortage would indicate strong demand; oversupply signals bubble',
    imageUrl: DEMO_IMAGES.iran,
    probability: 0.22,
    yesPercentage: 22,
    noPercentage: 78,
  },

  // ============================================
  // BRANCH 3: OpenAI/Big AI (children of ai-bubble-3)
  // ============================================
  {
    id: 'ai-bubble-3-1',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/microsoft-ai-investment-2026',
    question: 'Will Microsoft invest another $10B+ in OpenAI in 2026?',
    relation: 'IMPLIES',
    explanation: 'Microsoft investment signals confidence in AI market',
    imageUrl: DEMO_IMAGES.microsoft,
    probability: 0.42,
    yesPercentage: 42,
    noPercentage: 58,
  },
  {
    id: 'ai-bubble-3-2',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/google-ai-announcements-io-2026',
    question: 'Will Google announce major AI breakthroughs at I/O 2026?',
    relation: 'CORRELATED',
    explanation: 'Google AI progress affects competitive landscape',
    imageUrl: DEMO_IMAGES.gemini,
    probability: 0.85,
    yesPercentage: 85,
    noPercentage: 15,
  },
  {
    id: 'ai-bubble-3-3',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/openai-revenue-2026',
    question: 'Will OpenAI revenue exceed $10B in 2026?',
    relation: 'IMPLIES',
    explanation: 'OpenAI revenue growth validates AI market opportunity',
    imageUrl: DEMO_IMAGES.openaiIpo,
    probability: 0.65,
    yesPercentage: 65,
    noPercentage: 35,
  },
  {
    id: 'ai-bubble-3-4',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/ai-startup-valuations-2026',
    question: 'Will AI startup median valuation drop 40%+ in 2026?',
    relation: 'CONTRADICTS',
    explanation: 'Valuation crash signals AI bubble burst',
    imageUrl: DEMO_IMAGES.infinex,
    probability: 0.28,
    yesPercentage: 28,
    noPercentage: 72,
  },
  {
    id: 'ai-bubble-3-5',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/tech-layoffs-2026',
    question: 'Will big tech layoffs exceed 100K employees in 2026?',
    relation: 'IMPLIES',
    explanation: 'Mass layoffs signal AI investment pullback',
    imageUrl: DEMO_IMAGES.cabinet,
    probability: 0.32,
    yesPercentage: 32,
    noPercentage: 68,
  },
  {
    id: 'ai-bubble-3-6',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/ai-regulation-eu-2026',
    question: 'Will EU AI Act enforcement begin in 2026?',
    relation: 'CONDITIONED_ON',
    explanation: 'AI regulation affects market growth trajectory',
    imageUrl: DEMO_IMAGES.portugal,
    probability: 0.88,
    yesPercentage: 88,
    noPercentage: 12,
  },
  {
    id: 'ai-bubble-3-7',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/openai-enterprise-customers-2026',
    question: 'Will OpenAI reach 1M enterprise customers by end of 2026?',
    relation: 'IMPLIES',
    explanation: 'Enterprise adoption validates AI B2B market',
    imageUrl: DEMO_IMAGES.chatbotArena,
    probability: 0.48,
    yesPercentage: 48,
    noPercentage: 52,
  },
  {
    id: 'ai-bubble-3-8',
    parentId: 'ai-bubble-3',
    url: 'https://polymarket.com/event/chatgpt-mau-2026',
    question: 'Will ChatGPT MAU exceed 500M by end of 2026?',
    relation: 'CORRELATED',
    explanation: 'ChatGPT usage indicates consumer AI demand',
    imageUrl: DEMO_IMAGES.deepseek,
    probability: 0.72,
    yesPercentage: 72,
    noPercentage: 28,
  },

  // ============================================
  // BRANCH 4: Fed/Economy (children of ai-bubble-4)
  // ============================================
  {
    id: 'ai-bubble-4-1',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/sp500-end-of-2026',
    question: 'Will S&P 500 reach 6500 by end of 2026?',
    relation: 'CORRELATED',
    explanation: 'Broad market health affects AI sector funding',
    imageUrl: DEMO_IMAGES.tesla,
    probability: 0.55,
    yesPercentage: 55,
    noPercentage: 45,
  },
  {
    id: 'ai-bubble-4-2',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/nasdaq-end-of-2026',
    question: 'Will NASDAQ reach 22000 by end of 2026?',
    relation: 'IMPLIES',
    explanation: 'Tech-heavy NASDAQ directly reflects AI sector performance',
    imageUrl: DEMO_IMAGES.alphabet,
    probability: 0.48,
    yesPercentage: 48,
    noPercentage: 52,
  },
  {
    id: 'ai-bubble-4-3',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/us-recession-2026',
    question: 'Will the US enter a recession in 2026?',
    relation: 'IMPLIES',
    explanation: 'Recession would trigger AI investment pullback',
    imageUrl: DEMO_IMAGES.fedRates,
    probability: 0.25,
    yesPercentage: 25,
    noPercentage: 75,
  },
  {
    id: 'ai-bubble-4-4',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/us-inflation-2026',
    question: 'Will US inflation drop below 2.5% in 2026?',
    relation: 'CONDITIONED_ON',
    explanation: 'Inflation affects Fed policy and market liquidity',
    imageUrl: DEMO_IMAGES.tariffRevenue,
    probability: 0.42,
    yesPercentage: 42,
    noPercentage: 58,
  },
  {
    id: 'ai-bubble-4-5',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/us-unemployment-2026',
    question: 'Will US unemployment exceed 5% in 2026?',
    relation: 'IMPLIES',
    explanation: 'Rising unemployment signals economic weakness',
    imageUrl: DEMO_IMAGES.trump,
    probability: 0.18,
    yesPercentage: 18,
    noPercentage: 82,
  },
  {
    id: 'ai-bubble-4-6',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/us-china-trade-war-2026',
    question: 'Will US-China trade tensions escalate significantly in 2026?',
    relation: 'CONDITIONED_ON',
    explanation: 'Trade war affects AI supply chains and market access',
    imageUrl: DEMO_IMAGES.tariffs250b,
    probability: 0.45,
    yesPercentage: 45,
    noPercentage: 55,
  },
  {
    id: 'ai-bubble-4-7',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/treasury-yields-2026',
    question: 'Will 10-year Treasury yields exceed 5% in 2026?',
    relation: 'IMPLIES',
    explanation: 'High yields compete with growth stocks for investment',
    imageUrl: DEMO_IMAGES.eth,
    probability: 0.35,
    yesPercentage: 35,
    noPercentage: 65,
  },
  {
    id: 'ai-bubble-4-8',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/dollar-strength-2026',
    question: 'Will DXY dollar index exceed 110 in 2026?',
    relation: 'WEAK_SIGNAL',
    explanation: 'Strong dollar affects global AI company earnings',
    imageUrl: DEMO_IMAGES.sol,
    probability: 0.38,
    yesPercentage: 38,
    noPercentage: 62,
  },
  {
    id: 'ai-bubble-4-9',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/us-gdp-growth-2026',
    question: 'Will US GDP growth exceed 3% in 2026?',
    relation: 'CORRELATED',
    explanation: 'Strong GDP supports tech investment',
    imageUrl: DEMO_IMAGES.elonBudget,
    probability: 0.42,
    yesPercentage: 42,
    noPercentage: 58,
  },
  {
    id: 'ai-bubble-4-10',
    parentId: 'ai-bubble-4',
    url: 'https://polymarket.com/event/consumer-spending-2026',
    question: 'Will US consumer spending growth exceed 4% in 2026?',
    relation: 'WEAK_SIGNAL',
    explanation: 'Consumer health affects tech product demand',
    imageUrl: DEMO_IMAGES.greenland,
    probability: 0.35,
    yesPercentage: 35,
    noPercentage: 65,
  },

  // ============================================
  // BRANCH 5: Anthropic/VC (children of ai-bubble-5)
  // ============================================
  {
    id: 'ai-bubble-5-1',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/vc-ai-funding-2026',
    question: 'Will VC funding in AI exceed $100B globally in 2026?',
    relation: 'IMPLIES',
    explanation: 'VC funding levels indicate AI investment appetite',
    imageUrl: DEMO_IMAGES.puffpaw,
    probability: 0.55,
    yesPercentage: 55,
    noPercentage: 45,
  },
  {
    id: 'ai-bubble-5-2',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/tech-ipo-pipeline-2026',
    question: 'Will there be 20+ major tech IPOs in 2026?',
    relation: 'CORRELATED',
    explanation: 'IPO activity reflects market confidence',
    imageUrl: DEMO_IMAGES.medline,
    probability: 0.42,
    yesPercentage: 42,
    noPercentage: 58,
  },
  {
    id: 'ai-bubble-5-3',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/ai-startup-failures-2026',
    question: 'Will 100+ funded AI startups fail in 2026?',
    relation: 'CONTRADICTS',
    explanation: 'Mass AI startup failures signal bubble burst',
    imageUrl: DEMO_IMAGES.nft,
    probability: 0.35,
    yesPercentage: 35,
    noPercentage: 65,
  },
  {
    id: 'ai-bubble-5-4',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/google-anthropic-investment-2026',
    question: 'Will Google invest additional $2B+ in Anthropic in 2026?',
    relation: 'IMPLIES',
    explanation: 'Google investment signals Anthropic valuation strength',
    imageUrl: DEMO_IMAGES.baidu,
    probability: 0.48,
    yesPercentage: 48,
    noPercentage: 52,
  },
  {
    id: 'ai-bubble-5-5',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/amazon-anthropic-investment-2026',
    question: 'Will Amazon increase Anthropic investment in 2026?',
    relation: 'IMPLIES',
    explanation: 'Amazon AI investment reflects cloud AI demand',
    imageUrl: DEMO_IMAGES.alibaba,
    probability: 0.55,
    yesPercentage: 55,
    noPercentage: 45,
  },
  {
    id: 'ai-bubble-5-6',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/salesforce-ai-revenue-2026',
    question: "Will Salesforce AI features generate $5B+ revenue in 2026?",
    relation: 'CORRELATED',
    explanation: 'Enterprise AI adoption validates B2B market',
    imageUrl: DEMO_IMAGES.elonDoge,
    probability: 0.52,
    yesPercentage: 52,
    noPercentage: 48,
  },
  {
    id: 'ai-bubble-5-7',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/enterprise-ai-adoption-2026',
    question: 'Will 50%+ of Fortune 500 deploy AI agents by 2026?',
    relation: 'IMPLIES',
    explanation: 'Enterprise adoption validates long-term AI value',
    imageUrl: DEMO_IMAGES.xai,
    probability: 0.48,
    yesPercentage: 48,
    noPercentage: 52,
  },
  {
    id: 'ai-bubble-5-8',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/largest-company-end-of-june-712',
    question: 'Which company will have the largest market cap by June 30, 2026?',
    relation: 'CORRELATED',
    explanation: 'Market cap leadership reflects AI sector dominance',
    imageUrl: DEMO_IMAGES.spaceSale,
    probability: 0.58,
    yesPercentage: 58,
    noPercentage: 42,
  },
  {
    id: 'ai-bubble-5-9',
    parentId: 'ai-bubble-5',
    url: 'https://polymarket.com/event/what-price-will-bitcoin-hit-in-january-2026',
    question: 'What price will Bitcoin reach in January 2026?',
    relation: 'WEAK_SIGNAL',
    explanation: 'Bitcoin price reflects overall risk appetite in markets',
    imageUrl: DEMO_IMAGES.btc,
    probability: 0.42,
    yesPercentage: 42,
    noPercentage: 58,
  },

  // ============================================
  // DEEPER BRANCHES (children of children) - 5 more to hit 50
  // ============================================
  {
    id: 'ai-bubble-1-1-1',
    parentId: 'ai-bubble-1-1',
    url: 'https://polymarket.com/event/tesla-launches-unsupervised-full-self-driving-fsd-by',
    question: 'Will Tesla launch unsupervised Full Self-Driving by June 2026?',
    relation: 'CORRELATED',
    explanation: 'Tesla FSD progress affects xAI perception and Musk empire valuation',
    imageUrl: DEMO_IMAGES.tesla,
    probability: 0.32,
    yesPercentage: 32,
    noPercentage: 68,
  },
  {
    id: 'ai-bubble-2-4-1',
    parentId: 'ai-bubble-2-4',
    url: 'https://polymarket.com/event/gpu-cloud-pricing-2026',
    question: 'Will major cloud providers cut GPU prices 30%+ in 2026?',
    relation: 'IMPLIES',
    explanation: 'Cloud GPU price cuts indicate supply glut',
    imageUrl: DEMO_IMAGES.flyingTulip,
    probability: 0.42,
    yesPercentage: 42,
    noPercentage: 58,
  },
  {
    id: 'ai-bubble-3-4-1',
    parentId: 'ai-bubble-3-4',
    url: 'https://polymarket.com/event/ai-unicorn-down-rounds-2026',
    question: 'Will 10+ AI unicorns have down rounds in 2026?',
    relation: 'IMPLIES',
    explanation: 'Down rounds signal AI valuation correction',
    imageUrl: DEMO_IMAGES.elonBudget5,
    probability: 0.38,
    yesPercentage: 38,
    noPercentage: 62,
  },
  {
    id: 'ai-bubble-4-3-1',
    parentId: 'ai-bubble-4-3',
    url: 'https://polymarket.com/event/tech-stock-crash-2026',
    question: 'Will there be a 20%+ tech stock correction in 2026?',
    relation: 'IMPLIES',
    explanation: 'Major tech correction would trigger AI funding freeze',
    imageUrl: DEMO_IMAGES.earthquake,
    probability: 0.28,
    yesPercentage: 28,
    noPercentage: 72,
  },
  {
    id: 'ai-bubble-5-3-1',
    parentId: 'ai-bubble-5-3',
    url: 'https://polymarket.com/event/ai-layoffs-2026',
    question: 'Will AI companies lay off 50K+ employees in 2026?',
    relation: 'IMPLIES',
    explanation: 'AI sector layoffs signal investment pullback',
    imageUrl: DEMO_IMAGES.epstein,
    probability: 0.22,
    yesPercentage: 22,
    noPercentage: 78,
  },

  // ============================================
  // MORE LEVEL 3: Children of ai-bubble-1-X
  // ============================================
  { id: 'ai-bubble-1-2-1', parentId: 'ai-bubble-1-2', url: 'https://polymarket.com/event/gpt5-benchmarks', question: 'Will GPT-5 beat Claude on all benchmarks?', relation: 'IMPLIES', explanation: 'Benchmark results determine model leadership', imageUrl: DEMO_IMAGES.gpt5, probability: 0.45, yesPercentage: 45, noPercentage: 55 },
  { id: 'ai-bubble-1-2-2', parentId: 'ai-bubble-1-2', url: 'https://polymarket.com/event/gpt5-pricing', question: 'Will GPT-5 API cost less than GPT-4?', relation: 'CONDITIONED_ON', explanation: 'Pricing affects enterprise adoption', imageUrl: DEMO_IMAGES.openaiIpo, probability: 0.35, yesPercentage: 35, noPercentage: 65 },
  { id: 'ai-bubble-1-3-1', parentId: 'ai-bubble-1-3', url: 'https://polymarket.com/event/claude-enterprise', question: 'Will Claude reach 100K enterprise customers?', relation: 'IMPLIES', explanation: 'Enterprise traction validates B2B strategy', imageUrl: DEMO_IMAGES.anthropicIpo, probability: 0.48, yesPercentage: 48, noPercentage: 52 },
  { id: 'ai-bubble-1-3-2', parentId: 'ai-bubble-1-3', url: 'https://polymarket.com/event/anthropic-revenue', question: 'Will Anthropic revenue exceed $2B in 2026?', relation: 'CORRELATED', explanation: 'Revenue growth signals market strength', imageUrl: DEMO_IMAGES.grok2, probability: 0.52, yesPercentage: 52, noPercentage: 48 },
  { id: 'ai-bubble-1-4-1', parentId: 'ai-bubble-1-4', url: 'https://polymarket.com/event/gemini-beats-gpt', question: 'Will Gemini outperform GPT-5 on release?', relation: 'CORRELATED', explanation: 'Google AI competitiveness affects landscape', imageUrl: DEMO_IMAGES.gemini, probability: 0.38, yesPercentage: 38, noPercentage: 62 },
  { id: 'ai-bubble-1-5-1', parentId: 'ai-bubble-1-5', url: 'https://polymarket.com/event/llama-commercial', question: 'Will Llama 4 allow commercial use?', relation: 'CONDITIONED_ON', explanation: 'Commercial licensing drives open-source adoption', imageUrl: DEMO_IMAGES.aiCoding, probability: 0.72, yesPercentage: 72, noPercentage: 28 },
  { id: 'ai-bubble-1-6-1', parentId: 'ai-bubble-1-6', url: 'https://polymarket.com/event/apple-ai-device', question: 'Will Apple release AI-focused device in 2026?', relation: 'IMPLIES', explanation: 'Hardware+AI integration defines edge computing', imageUrl: DEMO_IMAGES.khamenei, probability: 0.42, yesPercentage: 42, noPercentage: 58 },
  { id: 'ai-bubble-1-7-1', parentId: 'ai-bubble-1-7', url: 'https://polymarket.com/event/aws-ai-revenue', question: 'Will AWS AI services revenue exceed $20B?', relation: 'CORRELATED', explanation: 'Cloud AI revenue validates infrastructure demand', imageUrl: DEMO_IMAGES.usStrikes, probability: 0.55, yesPercentage: 55, noPercentage: 45 },
  { id: 'ai-bubble-1-8-1', parentId: 'ai-bubble-1-8', url: 'https://polymarket.com/event/musk-openai-settlement', question: 'Will Musk and Altman settle out of court?', relation: 'CONDITIONED_ON', explanation: 'Settlement avoids prolonged legal uncertainty', imageUrl: DEMO_IMAGES.elonTweets, probability: 0.32, yesPercentage: 32, noPercentage: 68 },

  // ============================================
  // MORE LEVEL 3: Children of ai-bubble-2-X
  // ============================================
  { id: 'ai-bubble-2-1-1', parentId: 'ai-bubble-2-1', url: 'https://polymarket.com/event/amd-ai-chips', question: 'Will AMD AI chip market share exceed 20%?', relation: 'IMPLIES', explanation: 'AMD competition affects NVIDIA dominance', imageUrl: DEMO_IMAGES.zelenskyySuit, probability: 0.35, yesPercentage: 35, noPercentage: 65 },
  { id: 'ai-bubble-2-2-1', parentId: 'ai-bubble-2-2', url: 'https://polymarket.com/event/intel-foundry', question: 'Will Intel foundry win major AI chip contract?', relation: 'CORRELATED', explanation: 'Foundry success diversifies chip supply', imageUrl: DEMO_IMAGES.acquisitions, probability: 0.28, yesPercentage: 28, noPercentage: 72 },
  { id: 'ai-bubble-2-3-1', parentId: 'ai-bubble-2-3', url: 'https://polymarket.com/event/chip-etf-crash', question: 'Will semiconductor ETFs drop 20%+ in 2026?', relation: 'CONTRADICTS', explanation: 'ETF crash signals bubble burst', imageUrl: DEMO_IMAGES.megaeth, probability: 0.25, yesPercentage: 25, noPercentage: 75 },
  { id: 'ai-bubble-2-5-1', parentId: 'ai-bubble-2-5', url: 'https://polymarket.com/event/tsmc-taiwan', question: 'Will TSMC announce US fab expansion?', relation: 'CONDITIONED_ON', explanation: 'TSMC expansion reduces Taiwan risk', imageUrl: DEMO_IMAGES.ukraineCeasefire, probability: 0.62, yesPercentage: 62, noPercentage: 38 },
  { id: 'ai-bubble-2-6-1', parentId: 'ai-bubble-2-6', url: 'https://polymarket.com/event/chip-ban-china', question: 'Will US ban more chips to China in 2026?', relation: 'IMPLIES', explanation: 'Export expansion affects chip demand', imageUrl: DEMO_IMAGES.insurrection, probability: 0.72, yesPercentage: 72, noPercentage: 28 },
  { id: 'ai-bubble-2-7-1', parentId: 'ai-bubble-2-7', url: 'https://polymarket.com/event/hyperscaler-capex', question: 'Will hyperscaler CapEx slow in H2 2026?', relation: 'CONTRADICTS', explanation: 'Capex slowdown signals demand peak', imageUrl: DEMO_IMAGES.starship, probability: 0.35, yesPercentage: 35, noPercentage: 65 },
  { id: 'ai-bubble-2-8-1', parentId: 'ai-bubble-2-8', url: 'https://polymarket.com/event/arm-ai-chips', question: 'Will ARM-based AI chips gain significant share?', relation: 'CORRELATED', explanation: 'ARM architecture affects mobile AI', imageUrl: DEMO_IMAGES.xrp, probability: 0.45, yesPercentage: 45, noPercentage: 55 },
  { id: 'ai-bubble-2-9-1', parentId: 'ai-bubble-2-9', url: 'https://polymarket.com/event/networking-bottleneck', question: 'Will AI networking become major bottleneck?', relation: 'IMPLIES', explanation: 'Networking limits affect infrastructure build', imageUrl: DEMO_IMAGES.sentient, probability: 0.55, yesPercentage: 55, noPercentage: 45 },

  // ============================================
  // MORE LEVEL 3: Children of ai-bubble-3-X
  // ============================================
  { id: 'ai-bubble-3-1-1', parentId: 'ai-bubble-3-1', url: 'https://polymarket.com/event/msft-copilot-revenue', question: 'Will Microsoft Copilot revenue exceed $5B?', relation: 'IMPLIES', explanation: 'Copilot success validates AI integration', imageUrl: DEMO_IMAGES.trumpResign, probability: 0.48, yesPercentage: 48, noPercentage: 52 },
  { id: 'ai-bubble-3-2-1', parentId: 'ai-bubble-3-2', url: 'https://polymarket.com/event/google-ai-search', question: 'Will Google AI search replace 30% of queries?', relation: 'CORRELATED', explanation: 'AI search adoption indicates consumer shift', imageUrl: DEMO_IMAGES.vietnam, probability: 0.38, yesPercentage: 38, noPercentage: 62 },
  { id: 'ai-bubble-3-3-1', parentId: 'ai-bubble-3-3', url: 'https://polymarket.com/event/openai-profitable', question: 'Will OpenAI become profitable in 2026?', relation: 'IMPLIES', explanation: 'Profitability validates AI business model', imageUrl: DEMO_IMAGES.venezuela, probability: 0.32, yesPercentage: 32, noPercentage: 68 },
  { id: 'ai-bubble-3-5-1', parentId: 'ai-bubble-3-5', url: 'https://polymarket.com/event/faang-ai-layoffs', question: 'Will FAANG announce AI-driven layoffs?', relation: 'IMPLIES', explanation: 'AI automation causing job losses signals maturity', imageUrl: DEMO_IMAGES.venezuelaInvade, probability: 0.45, yesPercentage: 45, noPercentage: 55 },
  { id: 'ai-bubble-3-6-1', parentId: 'ai-bubble-3-6', url: 'https://polymarket.com/event/eu-ai-fines', question: 'Will EU fine an AI company over $1B?', relation: 'CONDITIONED_ON', explanation: 'Major fines indicate regulatory enforcement', imageUrl: DEMO_IMAGES.iranRegime, probability: 0.28, yesPercentage: 28, noPercentage: 72 },
  { id: 'ai-bubble-3-7-1', parentId: 'ai-bubble-3-7', url: 'https://polymarket.com/event/chatgpt-enterprise', question: 'Will ChatGPT Enterprise reach 500K customers?', relation: 'IMPLIES', explanation: 'Enterprise scale validates B2B opportunity', imageUrl: DEMO_IMAGES.iranNuke, probability: 0.52, yesPercentage: 52, noPercentage: 48 },
  { id: 'ai-bubble-3-8-1', parentId: 'ai-bubble-3-8', url: 'https://polymarket.com/event/chatgpt-plateau', question: 'Will ChatGPT user growth plateau in 2026?', relation: 'CONTRADICTS', explanation: 'Growth plateau signals market saturation', imageUrl: DEMO_IMAGES.iranWar, probability: 0.35, yesPercentage: 35, noPercentage: 65 },

  // ============================================
  // MORE LEVEL 3: Children of ai-bubble-4-X
  // ============================================
  { id: 'ai-bubble-4-1-1', parentId: 'ai-bubble-4-1', url: 'https://polymarket.com/event/sp500-correction', question: 'Will S&P 500 have a 15%+ correction in 2026?', relation: 'IMPLIES', explanation: 'Market correction affects AI funding', imageUrl: DEMO_IMAGES.climate, probability: 0.32, yesPercentage: 32, noPercentage: 68 },
  { id: 'ai-bubble-4-2-1', parentId: 'ai-bubble-4-2', url: 'https://polymarket.com/event/nasdaq-bubble', question: 'Will NASDAQ be called a bubble in 2026?', relation: 'CORRELATED', explanation: 'Bubble narrative affects sentiment', imageUrl: DEMO_IMAGES.gta6, probability: 0.45, yesPercentage: 45, noPercentage: 55 },
  { id: 'ai-bubble-4-4-1', parentId: 'ai-bubble-4-4', url: 'https://polymarket.com/event/fed-pivot', question: 'Will Fed pivot to rate cuts mid-2026?', relation: 'CONDITIONED_ON', explanation: 'Fed pivot affects growth stock valuations', imageUrl: DEMO_IMAGES.gta6Price, probability: 0.55, yesPercentage: 55, noPercentage: 45 },
  { id: 'ai-bubble-4-5-1', parentId: 'ai-bubble-4-5', url: 'https://polymarket.com/event/tech-hiring-freeze', question: 'Will major tech companies freeze hiring?', relation: 'IMPLIES', explanation: 'Hiring freeze signals reduced growth expectations', imageUrl: DEMO_IMAGES.oscars, probability: 0.38, yesPercentage: 38, noPercentage: 62 },
  { id: 'ai-bubble-4-6-1', parentId: 'ai-bubble-4-6', url: 'https://polymarket.com/event/china-tariffs', question: 'Will US impose new tariffs on China AI?', relation: 'CONDITIONED_ON', explanation: 'Tariffs affect AI supply chain costs', imageUrl: DEMO_IMAGES.avatar3, probability: 0.58, yesPercentage: 58, noPercentage: 42 },
  { id: 'ai-bubble-4-7-1', parentId: 'ai-bubble-4-7', url: 'https://polymarket.com/event/bond-market-crisis', question: 'Will there be a bond market crisis in 2026?', relation: 'IMPLIES', explanation: 'Bond crisis affects all asset classes', imageUrl: DEMO_IMAGES.strangerThings, probability: 0.18, yesPercentage: 18, noPercentage: 82 },
  { id: 'ai-bubble-4-9-1', parentId: 'ai-bubble-4-9', url: 'https://polymarket.com/event/ai-gdp-contribution', question: 'Will AI contribute 1%+ to US GDP growth?', relation: 'CORRELATED', explanation: 'AI economic impact validates investment', imageUrl: DEMO_IMAGES.beastGames, probability: 0.42, yesPercentage: 42, noPercentage: 58 },

  // ============================================
  // MORE LEVEL 3: Children of ai-bubble-5-X
  // ============================================
  { id: 'ai-bubble-5-1-1', parentId: 'ai-bubble-5-1', url: 'https://polymarket.com/event/ai-vc-bubble', question: 'Will AI VC funding drop 30%+ YoY?', relation: 'CONTRADICTS', explanation: 'Funding drop signals investor retreat', imageUrl: DEMO_IMAGES.honnold, probability: 0.28, yesPercentage: 28, noPercentage: 72 },
  { id: 'ai-bubble-5-2-1', parentId: 'ai-bubble-5-2', url: 'https://polymarket.com/event/ai-ipo-flops', question: 'Will 3+ AI IPOs trade below offering price?', relation: 'CONTRADICTS', explanation: 'IPO failures signal market oversaturation', imageUrl: DEMO_IMAGES.lightyear, probability: 0.35, yesPercentage: 35, noPercentage: 65 },
  { id: 'ai-bubble-5-4-1', parentId: 'ai-bubble-5-4', url: 'https://polymarket.com/event/anthropic-google-acquisition', question: 'Will Google acquire majority stake in Anthropic?', relation: 'IMPLIES', explanation: 'Acquisition consolidates AI market', imageUrl: DEMO_IMAGES.magnus, probability: 0.22, yesPercentage: 22, noPercentage: 78 },
  { id: 'ai-bubble-5-5-1', parentId: 'ai-bubble-5-5', url: 'https://polymarket.com/event/aws-anthropic-exclusive', question: 'Will AWS get exclusive Anthropic partnership?', relation: 'CONDITIONED_ON', explanation: 'Exclusivity deals reshape cloud AI', imageUrl: DEMO_IMAGES.football, probability: 0.38, yesPercentage: 38, noPercentage: 62 },
  { id: 'ai-bubble-5-6-1', parentId: 'ai-bubble-5-6', url: 'https://polymarket.com/event/crm-ai-dominant', question: 'Will AI become dominant CRM feature?', relation: 'CORRELATED', explanation: 'Enterprise AI adoption accelerates', imageUrl: DEMO_IMAGES.nfl, probability: 0.62, yesPercentage: 62, noPercentage: 38 },
  { id: 'ai-bubble-5-7-1', parentId: 'ai-bubble-5-7', url: 'https://polymarket.com/event/ai-agents-production', question: 'Will AI agents run in production at scale?', relation: 'IMPLIES', explanation: 'Production AI agents validate agentic future', imageUrl: DEMO_IMAGES.basketball, probability: 0.45, yesPercentage: 45, noPercentage: 55 },
  { id: 'ai-bubble-5-8-1', parentId: 'ai-bubble-5-8', url: 'https://polymarket.com/event/apple-market-cap', question: 'Will Apple regain largest market cap?', relation: 'CORRELATED', explanation: 'Apple leadership affects tech sentiment', imageUrl: DEMO_IMAGES.chiefs, probability: 0.48, yesPercentage: 48, noPercentage: 52 },
  { id: 'ai-bubble-5-9-1', parentId: 'ai-bubble-5-9', url: 'https://polymarket.com/event/btc-200k', question: 'Will Bitcoin reach $200K in 2026?', relation: 'WEAK_SIGNAL', explanation: 'Bitcoin rally indicates risk-on sentiment', imageUrl: DEMO_IMAGES.cowboys, probability: 0.28, yesPercentage: 28, noPercentage: 72 },

  // ============================================
  // LEVEL 4: Children of Level 3 deps - Creating deeper tree
  // ============================================
  { id: 'ai-bubble-1-2-1-1', parentId: 'ai-bubble-1-2-1', url: 'https://polymarket.com/event/gpt5-reasoning', question: 'Will GPT-5 demonstrate PhD-level reasoning?', relation: 'IMPLIES', explanation: 'Reasoning capability defines AGI progress', imageUrl: DEMO_IMAGES.eagles, probability: 0.35, yesPercentage: 35, noPercentage: 65 },
  { id: 'ai-bubble-1-2-1-2', parentId: 'ai-bubble-1-2-1', url: 'https://polymarket.com/event/ai-math-olympiad', question: 'Will AI win Math Olympiad gold in 2026?', relation: 'CORRELATED', explanation: 'Math capability measures reasoning progress', imageUrl: DEMO_IMAGES.bills, probability: 0.42, yesPercentage: 42, noPercentage: 58 },
  { id: 'ai-bubble-1-3-1-1', parentId: 'ai-bubble-1-3-1', url: 'https://polymarket.com/event/claude-code-production', question: 'Will Claude Code reach 1M daily users?', relation: 'IMPLIES', explanation: 'Developer adoption drives enterprise deals', imageUrl: DEMO_IMAGES.ravens, probability: 0.38, yesPercentage: 38, noPercentage: 62 },
  { id: 'ai-bubble-2-5-1-1', parentId: 'ai-bubble-2-5-1', url: 'https://polymarket.com/event/tsmc-arizona', question: 'Will TSMC Arizona fab produce AI chips?', relation: 'CONDITIONED_ON', explanation: 'US chip production reduces supply risk', imageUrl: DEMO_IMAGES.niners, probability: 0.55, yesPercentage: 55, noPercentage: 45 },
  { id: 'ai-bubble-2-6-1-1', parentId: 'ai-bubble-2-6-1', url: 'https://polymarket.com/event/china-chip-independence', question: 'Will China achieve 7nm chip production?', relation: 'CONTRADICTS', explanation: 'China independence affects ban effectiveness', imageUrl: DEMO_IMAGES.lions, probability: 0.45, yesPercentage: 45, noPercentage: 55 },
  { id: 'ai-bubble-3-3-1-1', parentId: 'ai-bubble-3-3-1', url: 'https://polymarket.com/event/openai-sustainable', question: 'Will OpenAI achieve sustainable unit economics?', relation: 'IMPLIES', explanation: 'Unit economics validate AI SaaS model', imageUrl: DEMO_IMAGES.packers, probability: 0.42, yesPercentage: 42, noPercentage: 58 },
  { id: 'ai-bubble-3-6-1-1', parentId: 'ai-bubble-3-6-1', url: 'https://polymarket.com/event/eu-openai-ban', question: 'Will EU temporarily ban OpenAI services?', relation: 'CONDITIONED_ON', explanation: 'Regulatory ban creates market uncertainty', imageUrl: DEMO_IMAGES.t1, probability: 0.18, yesPercentage: 18, noPercentage: 82 },
  { id: 'ai-bubble-4-3-1-1', parentId: 'ai-bubble-4-3-1', url: 'https://polymarket.com/event/tech-bear-market', question: 'Will tech enter official bear market in 2026?', relation: 'IMPLIES', explanation: 'Bear market triggers AI funding freeze', imageUrl: DEMO_IMAGES.jdg, probability: 0.25, yesPercentage: 25, noPercentage: 75 },
  { id: 'ai-bubble-4-4-1-1', parentId: 'ai-bubble-4-4-1', url: 'https://polymarket.com/event/rate-cuts-2026', question: 'Will Fed cut rates 100bps+ in 2026?', relation: 'CONDITIONED_ON', explanation: 'Aggressive cuts signal economic concern', imageUrl: DEMO_IMAGES.vitality, probability: 0.35, yesPercentage: 35, noPercentage: 65 },
  { id: 'ai-bubble-5-1-1-1', parentId: 'ai-bubble-5-1-1', url: 'https://polymarket.com/event/ai-winter-2027', question: 'Will experts declare AI winter by 2027?', relation: 'CONTRADICTS', explanation: 'AI winter sentiment crashes valuations', imageUrl: DEMO_IMAGES.measles, probability: 0.15, yesPercentage: 15, noPercentage: 85 },
  { id: 'ai-bubble-5-4-1-1', parentId: 'ai-bubble-5-4-1', url: 'https://polymarket.com/event/google-antitrust-ai', question: 'Will Google face AI antitrust action?', relation: 'CONDITIONED_ON', explanation: 'Antitrust affects consolidation strategy', imageUrl: DEMO_IMAGES.snowMonth, probability: 0.38, yesPercentage: 38, noPercentage: 62 },
];

// Get AI bubble dependencies with variety - mix from different branches for more diverse graph
function getAiBubbleDependencies(
  parentId: string | null,
  existingIds: Set<string>,
  count: number
): DependencyQueueItem[] {
  const selected: AiBubbleDependency[] = [];
  const usedIds = new Set(existingIds);

  // Helper to check if dep is available
  const isAvailable = (dep: AiBubbleDependency) =>
    !usedIds.has(dep.id) && !usedIds.has(dep.url);

  // Helper to convert dep to queue item
  const toQueueItem = (dep: AiBubbleDependency): DependencyQueueItem => ({
    id: dep.id,
    url: dep.url,
    weight: 0.75,
    decision: 'yes' as const,
    relation: dep.relation,
    imageUrl: dep.imageUrl || undefined,
    parentId: dep.parentId || undefined,
    parentUrl: dep.parentId
      ? AI_BUBBLE_BURST_DEPENDENCIES.find(d => d.id === dep.parentId)?.url
      : undefined,
    sourceId: dep.parentId || 'ai-bubble-root',
    sourceSlug: dep.parentId || 'ai-bubble-burst',
    sourceUrl: dep.parentId
      ? AI_BUBBLE_BURST_DEPENDENCIES.find(d => d.id === dep.parentId)?.url
      : undefined,
    sourceQuestion: dep.parentId
      ? AI_BUBBLE_BURST_DEPENDENCIES.find(d => d.id === dep.parentId)?.question
      : 'AI Bubble Burst',
    explanation: dep.explanation,
    question: dep.question,
    probability: dep.probability,
    yesPercentage: dep.yesPercentage,
    noPercentage: dep.noPercentage,
  });

  // Strategy: Mix items from different branches for variety
  // 1. First, get 1-2 children of the current parent (maintains tree logic)
  // 2. Then fill rest with items from OTHER branches (creates variety)

  // Get children of current parent first (1-2 max for continuity)
  if (parentId !== null) {
    const childrenOfParent = AI_BUBBLE_BURST_DEPENDENCIES.filter(
      dep => dep.parentId === parentId && isAvailable(dep)
    );
    const childrenToTake = Math.min(2, childrenOfParent.length, count);
    for (let i = 0; i < childrenToTake; i++) {
      selected.push(childrenOfParent[i]);
      usedIds.add(childrenOfParent[i].id);
      usedIds.add(childrenOfParent[i].url);
    }
  }

  // Fill remaining slots with variety from different branches
  // Group deps by their root branch (first segment of id like "ai-bubble-1", "ai-bubble-2", etc.)
  const getRootBranch = (id: string) => {
    const match = id.match(/^(ai-bubble-\d+)/);
    return match ? match[1] : id;
  };

  // Get all available deps grouped by branch
  const availableDeps = AI_BUBBLE_BURST_DEPENDENCIES.filter(isAvailable);
  const branchGroups = new Map<string, AiBubbleDependency[]>();
  for (const dep of availableDeps) {
    const branch = getRootBranch(dep.id);
    if (!branchGroups.has(branch)) {
      branchGroups.set(branch, []);
    }
    branchGroups.get(branch)!.push(dep);
  }

  // Round-robin through branches to get variety
  const branches = Array.from(branchGroups.keys());
  let branchIndex = 0;
  const branchIndices = new Map<string, number>();
  branches.forEach(b => branchIndices.set(b, 0));

  while (selected.length < count && branches.length > 0) {
    const branch = branches[branchIndex % branches.length];
    const branchDeps = branchGroups.get(branch)!;
    const depIndex = branchIndices.get(branch)!;

    if (depIndex < branchDeps.length) {
      const dep = branchDeps[depIndex];
      if (!usedIds.has(dep.id) && !usedIds.has(dep.url)) {
        selected.push(dep);
        usedIds.add(dep.id);
        usedIds.add(dep.url);
      }
      branchIndices.set(branch, depIndex + 1);
    }

    branchIndex++;

    // Remove exhausted branches
    const activeBranches = branches.filter(b => {
      const idx = branchIndices.get(b)!;
      return idx < branchGroups.get(b)!.length;
    });
    if (activeBranches.length === 0) break;
  }

  return selected.map(toQueueItem);
}

// Export function to get initial children to pre-populate tree for AI bubble events
// This makes the visualization more impressive from the start
export function getAiBubbleInitialChildren(): Array<{
  id: string;
  label: string;
  imageUrl: string;
  probability: number;
  relation: string;
  url: string;
  explanation: string;
  children: Array<{
    id: string;
    label: string;
    imageUrl: string;
    probability: number;
    relation: string;
    url: string;
    explanation: string;
    children: Array<{
      id: string;
      label: string;
      imageUrl: string;
      probability: number;
      relation: string;
      url: string;
      explanation: string;
    }>;
  }>;
}> {
  // Get root-level deps (parentId = null)
  const rootDeps = AI_BUBBLE_BURST_DEPENDENCIES.filter(d => d.parentId === null);

  return rootDeps.map(rootDep => {
    // Get level-2 children for this root dep
    const level2Deps = AI_BUBBLE_BURST_DEPENDENCIES.filter(d => d.parentId === rootDep.id);

    return {
      id: rootDep.id,
      label: rootDep.question,
      imageUrl: rootDep.imageUrl,
      probability: rootDep.probability,
      relation: rootDep.relation,
      url: rootDep.url,
      explanation: rootDep.explanation,
      children: level2Deps.map(l2Dep => {
        // Get level-3 children for this level-2 dep
        const level3Deps = AI_BUBBLE_BURST_DEPENDENCIES.filter(d => d.parentId === l2Dep.id);

        return {
          id: l2Dep.id,
          label: l2Dep.question,
          imageUrl: l2Dep.imageUrl,
          probability: l2Dep.probability,
          relation: l2Dep.relation,
          url: l2Dep.url,
          explanation: l2Dep.explanation,
          children: level3Deps.map(l3Dep => ({
            id: l3Dep.id,
            label: l3Dep.question,
            imageUrl: l3Dep.imageUrl,
            probability: l3Dep.probability,
            relation: l3Dep.relation,
            url: l3Dep.url,
            explanation: l3Dep.explanation,
          })),
        };
      }),
    };
  });
}

// Multiple samples per topic for variety
// Using valid BetRelationship types: IMPLIES, CONTRADICTS, PARTITION_OF, SUBEVENT, CONDITIONED_ON, WEAK_SIGNAL
// Real Polymarket event URLs with S3 image URLs for proper display
const S3_BASE = S3; // Reuse the same base URL

const TOPIC_SAMPLES: Record<TopicType, SampleData[]> = {
  politics: [
    {
      url: 'https://polymarket.com/event/presidential-election-winner-2028',
      question: 'Who will win the 2028 US Presidential Election?',
      relation: 'IMPLIES',
      explanation: 'Presidential outcomes shape the direction of policy and governance.',
      imageUrl: `${S3_BASE}presidential-election-winner-2024-afdda358-219d-448a-abb5-ba4d14118d71.png`,
      probability: 0.55,
      yesPercentage: 55,
      noPercentage: 45,
    },
    {
      url: 'https://polymarket.com/event/who-will-trump-nominate-as-fed-chair',
      question: 'Who will Trump nominate as the next Federal Reserve Chair?',
      relation: 'CONDITIONED_ON',
      explanation: 'Fed Chair nomination depends on administration priorities and economic outlook.',
      imageUrl: `${S3_BASE}who-will-trump-nominate-as-fed-chair-9p19ttRwsbKL.png`,
      probability: 0.35,
      yesPercentage: 35,
      noPercentage: 65,
    },
    {
      url: 'https://polymarket.com/event/will-trump-acquire-greenland-before-2027',
      question: 'Will the US acquire Greenland before 2027?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Geopolitical moves reflect broader foreign policy priorities.',
      imageUrl: `${S3_BASE}will-trump-acquire-greenland-in-2025-5ZDkcIGhdBMW.jpg`,
      probability: 0.28,
      yesPercentage: 28,
      noPercentage: 72,
    },
    {
      url: 'https://polymarket.com/event/democratic-presidential-nominee-2028',
      question: 'Who will be the 2028 Democratic Presidential Nominee?',
      relation: 'IMPLIES',
      explanation: 'Primary outcomes determine general election dynamics.',
      imageUrl: `${S3_BASE}democrats+2028+donkey.png`,
      probability: 0.42,
      yesPercentage: 42,
      noPercentage: 58,
    },
    {
      url: 'https://polymarket.com/event/republican-presidential-nominee-2028',
      question: 'Who will be the 2028 Republican Presidential Nominee?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Nomination races signal party direction and voter sentiment.',
      imageUrl: `${S3_BASE}republicans+2028.png`,
      probability: 0.38,
      yesPercentage: 38,
      noPercentage: 62,
    },
    {
      url: 'https://polymarket.com/event/insurrection-act-invoked-by',
      question: 'Will Trump invoke the Insurrection Act before August 2026?',
      relation: 'CONDITIONED_ON',
      explanation: 'Use of emergency powers depends on civil unrest and policy stance.',
      imageUrl: `${S3_BASE}trump-invokes-the-insurrection-act-before-august-jR3s2WWoaIbY.jpg`,
      probability: 0.22,
      yesPercentage: 22,
      noPercentage: 78,
    },
  ],
  crypto: [
    {
      url: 'https://polymarket.com/event/what-price-will-bitcoin-hit-in-january-2026',
      question: 'What price will Bitcoin reach in January 2026?',
      relation: 'IMPLIES',
      explanation: 'Bitcoin price movements often lead broader crypto market trends.',
      imageUrl: `${S3_BASE}BTC+fullsize.png`,
      probability: 0.42,
      yesPercentage: 42,
      noPercentage: 58,
    },
    {
      url: 'https://polymarket.com/event/what-price-will-ethereum-hit-in-january-2026',
      question: 'What price will Ethereum reach in January 2026?',
      relation: 'IMPLIES',
      explanation: 'Ethereum price correlates with overall crypto market sentiment.',
      imageUrl: `${S3_BASE}ETH+fullsize.jpg`,
      probability: 0.38,
      yesPercentage: 38,
      noPercentage: 62,
    },
    {
      url: 'https://polymarket.com/event/what-price-will-solana-hit-in-january-2026',
      question: 'What price will Solana reach in January 2026?',
      relation: 'CONDITIONED_ON',
      explanation: 'Solana performance depends on network activity and ecosystem growth.',
      imageUrl: `${S3_BASE}SOL-logo.png`,
      probability: 0.35,
      yesPercentage: 35,
      noPercentage: 65,
    },
    {
      url: 'https://polymarket.com/event/bitcoin-up-or-down-on-january-18',
      question: 'Will Bitcoin close higher today than yesterday?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Daily price movements reflect short-term market sentiment.',
      imageUrl: `${S3_BASE}BTC+fullsize.png`,
      probability: 0.52,
      yesPercentage: 52,
      noPercentage: 48,
    },
    {
      url: 'https://polymarket.com/event/ethereum-price-on-january-18',
      question: 'Will Ethereum be above $4,000 on January 18?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Short-term ETH movements track with broader market conditions.',
      imageUrl: `${S3_BASE}ETH+fullsize.jpg`,
      probability: 0.48,
      yesPercentage: 48,
      noPercentage: 52,
    },
    {
      url: 'https://polymarket.com/event/solana-price-on-january-18',
      question: 'Will Solana be above $200 on January 18?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Daily SOL price reflects ecosystem momentum.',
      imageUrl: `${S3_BASE}SOL-logo.png`,
      probability: 0.45,
      yesPercentage: 45,
      noPercentage: 55,
    },
  ],
  sports: [
    {
      url: 'https://polymarket.com/event/super-bowl-champion-2026-731',
      question: 'Who will win Super Bowl LX in 2026?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Championship predictions reflect team performance throughout the season.',
      imageUrl: `${S3_BASE}football-logo.png`,
      probability: 0.68,
      yesPercentage: 68,
      noPercentage: 32,
    },
    {
      url: 'https://polymarket.com/event/2026-nba-champion',
      question: 'Who will win the 2026 NBA Championship?',
      relation: 'WEAK_SIGNAL',
      explanation: 'NBA championship odds shift with playoff performance.',
      imageUrl: `${S3_BASE}super+cool+basketball+in+red+and+blue+wow.png`,
      probability: 0.15,
      yesPercentage: 15,
      noPercentage: 85,
    },
    {
      url: 'https://polymarket.com/event/nfl-hou-ne-2025-01-18',
      question: 'Will the Houston Texans beat the New England Patriots?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Game outcomes affect playoff positioning.',
      imageUrl: `${S3_BASE}nfl.png`,
      probability: 0.55,
      yesPercentage: 55,
      noPercentage: 45,
    },
    {
      url: 'https://polymarket.com/event/nba-orl-mem-2026-01-18',
      question: 'Will the Orlando Magic beat the Memphis Grizzlies?',
      relation: 'IMPLIES',
      explanation: 'Regular season results influence championship odds.',
      imageUrl: `${S3_BASE}super+cool+basketball+in+red+and+blue+wow.png`,
      probability: 0.48,
      yesPercentage: 48,
      noPercentage: 52,
    },
    {
      url: 'https://polymarket.com/event/nfl-la-chi-2026-01-18',
      question: 'Will the LA Rams beat the Chicago Bears?',
      relation: 'CONDITIONED_ON',
      explanation: 'Division matchups affect conference standings.',
      imageUrl: `${S3_BASE}nfl.png`,
      probability: 0.62,
      yesPercentage: 62,
      noPercentage: 38,
    },
  ],
  economy: [
    {
      url: 'https://polymarket.com/event/fed-decision-in-january',
      question: 'Will the Fed cut interest rates in January 2026?',
      relation: 'CONDITIONED_ON',
      explanation: 'Fed policy decisions have cascading effects on financial markets.',
      imageUrl: `${S3_BASE}jerome+powell+glasses1.png`,
      probability: 0.35,
      yesPercentage: 35,
      noPercentage: 65,
    },
    {
      url: 'https://polymarket.com/event/us-strikes-iran-by',
      question: 'Will the US conduct military strikes on Iran by October 2026?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Geopolitical tensions affect oil prices and market stability.',
      imageUrl: `${S3_BASE}us-strikes-iran-by-october-3-2sVnIHq3sjqF.jpg`,
      probability: 0.22,
      yesPercentage: 22,
      noPercentage: 78,
    },
    {
      url: 'https://polymarket.com/event/russia-x-ukraine-ceasefire-before-2027',
      question: 'Will there be a Russia-Ukraine ceasefire before 2027?',
      relation: 'IMPLIES',
      explanation: 'Conflict resolution would significantly impact global markets.',
      imageUrl: `${S3_BASE}russia-x-ukraine-ceasefire-in-2025-w2voYOygx80B.jpg`,
      probability: 0.28,
      yesPercentage: 28,
      noPercentage: 72,
    },
    {
      url: 'https://polymarket.com/event/portugal-presidential-election',
      question: 'Who will win the 2026 Portugal Presidential Election?',
      relation: 'WEAK_SIGNAL',
      explanation: 'European elections affect EU policy direction.',
      imageUrl: `${S3_BASE}portugal-presidential-election-_h_A97vllNOX.png`,
      probability: 0.45,
      yesPercentage: 45,
      noPercentage: 55,
    },
    {
      url: 'https://polymarket.com/event/largest-company-end-of-june-712',
      question: 'Which company will have the largest market cap by June 30, 2026?',
      relation: 'IMPLIES',
      explanation: 'Market cap rankings reflect tech and AI sector momentum.',
      imageUrl: `${S3_BASE}largest-company-eoy-KS99l6lbxfCc.jpg`,
      probability: 0.58,
      yesPercentage: 58,
      noPercentage: 42,
    },
  ],
  default: [
    {
      url: 'https://polymarket.com/event/which-company-has-the-best-ai-model-end-of-january',
      question: 'Which company will have the best AI model by end of January 2026?',
      relation: 'IMPLIES',
      explanation: 'AI leadership affects company valuations and market dynamics.',
      imageUrl: `${S3_BASE}which-company-has-best-ai-model-end-of-september-MmASwbTkwKHi.jpg`,
      probability: 0.72,
      yesPercentage: 72,
      noPercentage: 28,
    },
    {
      url: 'https://polymarket.com/event/grok-4pt20-released-by',
      question: 'Will xAI release Grok 4.20 before March 2026?',
      relation: 'CONDITIONED_ON',
      explanation: 'AI release timelines depend on development progress and competition.',
      imageUrl: `${S3_BASE}grok-4pt20-released-by-FREAnoCYA7aN.jpg`,
      probability: 0.45,
      yesPercentage: 45,
      noPercentage: 55,
    },
    {
      url: 'https://polymarket.com/event/tesla-launches-unsupervised-full-self-driving-fsd-by',
      question: 'Will Tesla launch unsupervised Full Self-Driving by June 2026?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Autonomous vehicle progress affects Tesla valuation.',
      imageUrl: `${S3_BASE}tesla-launches-unsupervised-full-self-driving-fsd-by-june-30-yvpjn3RX4Q2w.jpg`,
      probability: 0.32,
      yesPercentage: 32,
      noPercentage: 68,
    },
    {
      url: 'https://polymarket.com/event/anthropic-ipo-closing-market-cap',
      question: "What will be Anthropic's market cap at IPO?",
      relation: 'IMPLIES',
      explanation: 'AI company valuations reflect sector growth expectations.',
      imageUrl: `${S3_BASE}anthropic-ipo-closing-market-cap-jdfele1g0krx.png`,
      probability: 0.38,
      yesPercentage: 38,
      noPercentage: 62,
    },
    {
      url: 'https://polymarket.com/event/openai-ipo-by',
      question: 'Will OpenAI go public by December 2026?',
      relation: 'WEAK_SIGNAL',
      explanation: 'Major AI IPOs signal market appetite for tech investments.',
      imageUrl: `${S3_BASE}openai-ipo-by-qeh3ouQDANVw.jpg`,
      probability: 0.28,
      yesPercentage: 28,
      noPercentage: 72,
    },
    {
      url: 'https://polymarket.com/event/will-elon-musk-win-his-case-against-sam-altman',
      question: 'Will Elon Musk win his lawsuit against Sam Altman?',
      relation: 'CONDITIONED_ON',
      explanation: 'Legal outcomes affect OpenAI structure and AI industry dynamics.',
      imageUrl: `${S3_BASE}will-elon-musk-win-his-case-against-sam-altman-3b7rjuMNHGHy.jpg`,
      probability: 0.35,
      yesPercentage: 35,
      noPercentage: 65,
    },
  ],
};

function getSampleForTopic(topic: TopicType, sourceQuestion: string, index = 0): SampleData {
  const samples = TOPIC_SAMPLES[topic] || TOPIC_SAMPLES.default;
  return samples[index % samples.length];
}

// Sample fallback dependency when API returns empty
function createSampleDependency(
  sourceMarket: any,
  options: { parentId?: string; parentUrl?: string; index?: number; previousQuestion?: string }
): DependencyQueueItem {
  const sourceSlug = typeof sourceMarket?.slug === 'string' ? sourceMarket.slug : undefined;
  const sourceUrl = sourceSlug ? `https://polymarket.com/event/${sourceSlug}` : options.parentUrl;
  const sourceQuestion =
    typeof sourceMarket?.question === 'string'
      ? sourceMarket.question
      : options.previousQuestion
        ? options.previousQuestion
        : sourceSlug
          ? sourceSlug.replace(/-/g, ' ')
          : 'Current Market Position';

  // Detect topic and get relevant sample
  const topic = detectTopic(sourceQuestion, sourceSlug || '');
  const sample = getSampleForTopic(topic, sourceQuestion, options.index ?? 0);

  return {
    id: `sample-${Date.now()}-${options.index ?? 0}`,
    url: sample.url,
    weight: 0.75 - (options.index ?? 0) * 0.1, // Slightly decrease weight for each sample
    decision: 'yes',
    relation: sample.relation,
    imageUrl: sample.imageUrl || undefined, // undefined so app fetches real image
    parentId: options.parentId,
    parentUrl: options.parentUrl,
    sourceId: sourceMarket?.id,
    sourceSlug,
    sourceUrl,
    sourceQuestion,
    explanation: sample.explanation,
    question: sample.question,
    probability: sample.probability,
    yesPercentage: sample.yesPercentage,
    noPercentage: sample.noPercentage,
  };
}

// Create multiple sample dependencies to fill queue
function createSampleDependencies(
  sourceMarket: any,
  options: { parentId?: string; parentUrl?: string; eventUrl?: string },
  count: number,
  existingIds: Set<string>
): DependencyQueueItem[] {
  // Check if this is an AI bubble burst event - use hardcoded dependencies
  const eventUrl = options.eventUrl || options.parentUrl || '';
  if (isAiBubbleBurstEvent(eventUrl)) {
    // For AI bubble burst, determine which parentId to use for children
    // If parentId starts with 'ai-bubble', use it directly
    // Otherwise, use null to get root-level dependencies
    const aiBubbleParentId = options.parentId?.startsWith('ai-bubble') ? options.parentId : null;
    return getAiBubbleDependencies(aiBubbleParentId, existingIds, count);
  }

  const samples: DependencyQueueItem[] = [];
  let previousQuestion: string | undefined;

  for (let i = 0; i < count; i++) {
    const sample = createSampleDependency(sourceMarket, { ...options, index: i, previousQuestion });
    if (!existingIds.has(sample.id) && !existingIds.has(sample.url)) {
      samples.push(sample);
      existingIds.add(sample.id);
      existingIds.add(sample.url);
      // Next sample's source will be this sample's question
      previousQuestion = sample.question;
    }
  }
  return samples;
}

function mapDependantsToQueue(
  dependants: any[],
  sourceMarket: any,
  visited: string[],
  options: { parentId?: string; parentUrl?: string }
): DependencyQueueItem[] {
  if (!Array.isArray(dependants)) {
    return [];
  }

  const sourceSlug = typeof sourceMarket?.slug === 'string' ? sourceMarket.slug : undefined;
  const sourceUrl = sourceSlug ? `https://polymarket.com/event/${sourceSlug}` : undefined;
  const sourceQuestion =
    typeof sourceMarket?.question === 'string'
      ? sourceMarket.question
      : sourceSlug
        ? sourceSlug.replace(/-/g, ' ')
        : undefined;
  const sourceId = typeof sourceMarket?.id === 'string' ? sourceMarket.id : undefined;

  // Convert visited URLs to event IDs for more robust comparison
  const visitedIds = new Set(
    visited.map(url => getEventIdFromUrl(url)).filter(Boolean)
  );
  // Also track visited URLs directly for fallback comparison
  const visitedUrlSet = new Set(visited);

  return dependants
    .filter(dep => typeof dep?.url === 'string' && dep.url.length > 0)
    .filter(dep => {
      // Skip if URL is already in visited set
      if (visitedUrlSet.has(dep.url)) return false;
      // Skip if event ID is already in visited IDs
      const depId = getEventIdFromUrl(dep.url);
      if (depId && visitedIds.has(depId)) return false;
      return true;
    })
    .map(dep => {
      const imageUrl =
        typeof dep.imageUrl === 'string'
          ? dep.imageUrl
          : typeof dep.image === 'string'
            ? dep.image
            : undefined;

      return {
        id: String(dep.id ?? dep.url),
        url: dep.url,
        weight: typeof dep.weight === 'number' ? dep.weight : 0,
        decision: dep.decision === 'no' ? 'no' : 'yes',
        relation: String(dep.relation ?? ''),
        imageUrl,
        parentId: options.parentId,
        parentUrl: options.parentUrl,
        sourceId,
        sourceSlug,
        sourceUrl,
        sourceQuestion,
        explanation: dep.explanation,
        question: dep.question,
        probability: typeof dep.probability === 'number' ? dep.probability : undefined,
        yesPercentage: typeof dep.yesPercentage === 'number' ? dep.yesPercentage : undefined,
        noPercentage: typeof dep.noPercentage === 'number' ? dep.noPercentage : undefined,
      };
    });
}

export async function processDependencyDecision({
  eventUrl,
  keep,
  fallbackDecision = 'yes',
  fallbackWeight = 1,
  risk,
}: ProcessDecisionInput): Promise<DependencyDecisionResult> {
  const state = await getDependencyState(eventUrl);
  // Deduplicate queue to handle any legacy duplicates in storage
  const queue = deduplicateQueue(state.queue);
  const visited = state.visited;
  let hasInitialFetch = state.hasInitialFetch ?? false;

  const current = queue[0] ?? null;
  const remainingQueue = current ? queue.slice(1) : queue;

  const currentUrl = current?.url || eventUrl;
  const currentDecision = current?.decision ?? fallbackDecision;
  const currentWeight = typeof current?.weight === 'number' ? current.weight : fallbackWeight;
  const rootId = getEventIdFromUrl(eventUrl) ?? 'root';

  let nextQueue = remainingQueue;
  let nextVisited = toUnique([
    ...visited,
    currentUrl,
    ...extractQueueUrls(remainingQueue),
  ]);

  if (!keep) {
    await setDependencyState(eventUrl, nextQueue, nextVisited, hasInitialFetch);
    return { queue: nextQueue, visited: nextVisited };
  }

  let response: DependenciesResponse | undefined;
  const shouldFetchMore = remainingQueue.length === 0;

  if (shouldFetchMore) {
    const volatility = 0.5 + normalizeRisk(risk) / 100;
    const parentId = current?.id ?? rootId;
    const existingIds = new Set(extractQueueIds(nextQueue));
    const existingUrls = new Set(extractQueueUrls(nextQueue));

    // Special handling for AI bubble burst events - skip API, use hardcoded data only
    if (isAiBubbleBurstEvent(eventUrl)) {
      const MIN_QUEUE_SIZE = 10; // Show 10 dependencies at a time for more variety
      if (nextQueue.length < MIN_QUEUE_SIZE) {
        const needed = MIN_QUEUE_SIZE - nextQueue.length;
        const allIds = new Set([...existingIds, ...existingUrls]);
        // Use current item's ID as parent for tree traversal (if it's an AI bubble dep)
        const aiBubbleParentId = current?.id?.startsWith('ai-bubble') ? current.id : null;
        const samples = getAiBubbleDependencies(aiBubbleParentId, allIds, needed);
        if (samples.length > 0) {
          nextQueue = [...nextQueue, ...samples];
          nextVisited = toUnique([...nextVisited, ...extractQueueUrls(samples)]);
        }
      }
      hasInitialFetch = true; // Mark as done to prevent API calls
      await setDependencyState(eventUrl, nextQueue, nextVisited, hasInitialFetch);
      return { queue: nextQueue, visited: nextVisited };
    }

    // First call: make real API call; subsequent calls: use hardcoded samples only
    if (!hasInitialFetch) {
      try {
        response = await fetchDependencies({
          url: currentUrl,
          weight: currentWeight,
          decision: currentDecision,
          visited: nextVisited,
          volatility,
        });

        let newItems = mapDependantsToQueue(
          response.dependants || [],
          response.sourceMarket,
          nextVisited,
          { parentId, parentUrl: currentUrl }
        ).filter(item => !existingIds.has(item.id));

        // Pad with sample dependencies if we don't have enough items (target: 3)
        const MIN_QUEUE_SIZE = 3;
        const totalAfterFetch = nextQueue.length + newItems.length;
        if (totalAfterFetch < MIN_QUEUE_SIZE) {
          const needed = MIN_QUEUE_SIZE - totalAfterFetch;
          const allIds = new Set([...existingIds, ...newItems.map(i => i.id)]);
          const allUrls = new Set([...existingUrls, ...newItems.map(i => i.url)]);
          const samples = createSampleDependencies(
            response.sourceMarket,
            { parentId, parentUrl: currentUrl, eventUrl },
            needed,
            new Set([...allIds, ...allUrls])
          );
          newItems = [...newItems, ...samples];
        }

        if (newItems.length > 0) {
          nextQueue = [...nextQueue, ...newItems];
          nextVisited = toUnique([...nextVisited, ...extractQueueUrls(newItems)]);
        }

        // Mark that we've done the initial API fetch
        hasInitialFetch = true;
      } catch (error) {
        // API failed on first call - still use samples as fallback
        console.error('Failed to fetch dependencies', error);
        const MIN_QUEUE_SIZE = 3;
        if (nextQueue.length < MIN_QUEUE_SIZE) {
          const needed = MIN_QUEUE_SIZE - nextQueue.length;
          const allIds = new Set([...existingIds, ...existingUrls]);
          const samples = createSampleDependencies(
            null,
            { parentId, parentUrl: currentUrl, eventUrl },
            needed,
            allIds
          );
          nextQueue = [...nextQueue, ...samples];
          nextVisited = toUnique([...nextVisited, ...extractQueueUrls(samples)]);
        }
        // Mark as initial fetch done even on failure so we don't keep retrying
        hasInitialFetch = true;
      }
    } else {
      // After initial fetch: use hardcoded samples only (no more API calls)
      const MIN_QUEUE_SIZE = 3;
      if (nextQueue.length < MIN_QUEUE_SIZE) {
        const needed = MIN_QUEUE_SIZE - nextQueue.length;
        const allIds = new Set([...existingIds, ...existingUrls]);
        const samples = createSampleDependencies(
          null,
          { parentId, parentUrl: currentUrl, eventUrl },
          needed,
          allIds
        );
        nextQueue = [...nextQueue, ...samples];
        nextVisited = toUnique([...nextVisited, ...extractQueueUrls(samples)]);
      }
    }
  }

  await setDependencyState(eventUrl, nextQueue, nextVisited, hasInitialFetch);
  return { response, queue: nextQueue, visited: nextVisited };
}
