import ZAI from "z-ai-web-dev-sdk";

const SEARCH_TOPICS = [
  // Technology
  "latest smartphone reviews 2025",
  "best laptop for programming",
  "how to build a website from scratch",
  "artificial intelligence news today",
  "machine learning tutorials for beginners",
  "best coding languages to learn",
  "cybersecurity tips for small business",
  "cloud computing benefits explained",
  "blockchain technology explained simply",
  "5G network coverage map",
  "quantum computing breakthrough",
  "IoT devices smart home setup",
  "virtual reality headset comparison",
  "augmented reality apps for education",
  "data science career path guide",
  "Python vs JavaScript differences",
  "React vs Vue vs Angular comparison",
  "Docker containerization tutorial",
  "Kubernetes deployment guide",
  "serverless architecture pros cons",
  "microservices design patterns",
  "API development best practices",
  "database optimization techniques",
  "web hosting services comparison",
  "domain name registration tips",
  "SSL certificate types explained",
  "progressive web apps tutorial",
  "mobile app development frameworks",
  "devops pipeline setup guide",
  "continuous integration tools",
  // Health & Fitness
  "morning workout routine for beginners",
  "healthy meal prep ideas weekly",
  "yoga poses for back pain relief",
  "intermittent fasting schedule tips",
  "best running shoes 2025",
  "mental health awareness resources",
  "sleep improvement techniques",
  "meditation apps comparison",
  "strength training without equipment",
  "keto diet meal plan free",
  "cardio vs weight lifting benefits",
  "stretching exercises for desk workers",
  "home gym equipment essentials",
  "calorie counting apps review",
  "protein intake calculator guide",
  "stress management techniques work",
  "vitamin D deficiency symptoms",
  "hydration tips daily water intake",
  "posture correction exercises",
  "walking benefits for health",
  // Science
  "Mars rover latest discoveries",
  "climate change effects 2025",
  "renewable energy sources comparison",
  "ocean pollution facts statistics",
  "space exploration timeline history",
  "DNA testing kits comparison",
  "electric vehicle battery technology",
  "solar panel installation cost",
  "wind energy pros and cons",
  "plastic recycling innovations",
  "biodiversity loss prevention",
  "volcanic eruption predictions",
  "earthquake preparedness checklist",
  "weather forecasting accuracy improvement",
  "dark matter research updates",
  "exoplanet discovery methods",
  "gene therapy breakthrough 2025",
  "CRISPR technology applications",
  "neuroscience research findings",
  "ocean acidification causes effects",
  // Entertainment
  "best movies streaming this week",
  "new music releases June 2025",
  "popular TV shows to binge watch",
  "video game release dates 2025",
  "book recommendations fiction 2025",
  "podcast recommendations true crime",
  "concert tickets near me this weekend",
  "best board games for families",
  "streaming service price comparison",
  "celebrity news entertainment today",
  "anime recommendations action",
  "manga series to read online",
  "stand up comedy specials streaming",
  "museum exhibitions near me",
  "theater shows Broadway 2025",
  "photography tips for beginners",
  "creative writing prompts ideas",
  "DIY craft projects easy",
  "painting tutorials acrylic",
  "home renovation TV shows",
  // Travel
  "best travel destinations summer 2025",
  "budget travel tips Europe",
  "all inclusive resort deals",
  "road trip planner app free",
  "passport renewal process timeline",
  "travel insurance comparison guide",
  "packing tips carry on only",
  "best airports for layovers",
  "hotel booking tips and tricks",
  "vacation rental vs hotel comparison",
  "cruise ship reviews 2025",
  "hiking trails near me beginner",
  "national park pass benefits",
  "travel photography tips phone",
  "solo travel safety tips women",
  "backpacking essentials checklist",
  "camping gear for beginners",
  "RV rental cost comparison",
  "international driving permit guide",
  "travel rewards credit cards",
  // Food & Cooking
  "easy dinner recipes under 30 minutes",
  "air fryer recipes healthy",
  "sourdough bread recipe starter",
  "best restaurants near me open now",
  "meal delivery service comparison",
  "cooking techniques for beginners",
  "spice substitutes chart",
  "food preservation methods home",
  "baking tips for beginners",
  "international cuisine recipes easy",
  "slow cooker recipes chicken",
  "vegetarian meal prep ideas",
  "gluten free baking recipes",
  "homemade pasta recipe easy",
  "cocktail recipes with vodka",
  "coffee brewing methods comparison",
  "tea varieties and benefits",
  "kitchen gadgets worth buying",
  "food safety guidelines home",
  "fermentation recipes for beginners",
  // Finance
  "stock market outlook 2025",
  "cryptocurrency trends analysis",
  "retirement planning calculator",
  "tax filing tips deductions",
  "personal budget spreadsheet template",
  "credit score improvement tips",
  "savings account interest rates",
  "real estate investment strategies",
  "side hustle ideas extra income",
  "student loan forgiveness programs",
  "mortgage rate predictions 2025",
  "index fund investing guide",
  "dividend stocks analysis",
  "financial independence retire early",
  "emergency fund how much save",
  "car insurance comparison quotes",
  "home insurance coverage types",
  "estate planning checklist guide",
  "business loan requirements",
  "accounting software small business",
  // Education
  "online learning platforms comparison",
  "study tips for college students",
  "scholarship search engine free",
  "best online courses 2025",
  "language learning apps review",
  "homework help websites free",
  "SAT prep courses comparison",
  "college admission requirements guide",
  "student loan repayment options",
  "teacher certification programs online",
  "coding bootcamp reviews 2025",
  "professional development courses online",
  "resume writing tips examples",
  "interview preparation checklist",
  "career change at 40 guide",
  "public speaking tips techniques",
  "time management strategies work",
  "note taking methods comparison",
  "critical thinking skills development",
  "digital literacy resources free",
  // Sports
  "NFL draft picks 2025",
  "NBA playoff bracket predictions",
  "Premier League standings today",
  "MLB trade rumors latest",
  "Olympics 2028 preparation updates",
  "F1 racing schedule 2025",
  "golf swing tips beginners",
  "tennis scoring rules explained",
  "swimming techniques improvement",
  "cycling training plan beginner",
  "soccer drills for kids",
  "basketball shooting form tips",
  "football playbook strategies",
  "baseball batting average calculator",
  "hockey rules for beginners",
  "marathon training schedule 16 weeks",
  "yoga for athletes recovery",
  "sports injury prevention tips",
  "fantasy football draft strategy",
  "sports betting odds explained",
  // Home & Garden
  "indoor plants low light",
  "garden planning layout ideas",
  "home organization tips declutter",
  "DIY home repair tutorials",
  "interior design trends 2025",
  "smart home devices setup",
  "lawn care schedule by season",
  "pest control natural methods",
  "energy efficient home improvements",
  "kitchen remodeling cost estimate",
  "bathroom renovation ideas small",
  "garage organization systems",
  "closet storage solutions DIY",
  "painting room tips techniques",
  "furniture arrangement small space",
  "house cleaning schedule printable",
  "laundry tips stain removal",
  "plumbing repair DIY guide",
  "electrical safety home checklist",
  "roof maintenance tips homeowners",
  // Fashion & Beauty
  "fashion trends summer 2025",
  "skincare routine order steps",
  "makeup tutorial natural look",
  "hair care tips damaged hair",
  "nail art designs easy",
  "fragrance comparison women men",
  "wardrobe essentials checklist women",
  "men fashion style guide 2025",
  "sustainable fashion brands",
  "jewelry making tutorials beginner",
  "accessories styling tips",
  "swimwear trends 2025",
  "footwear care tips leather",
  "organic beauty products review",
  "anti aging skincare ingredients",
  // Automotive
  "electric car vs gas comparison",
  "car maintenance checklist schedule",
  "best SUV 2025 under 30000",
  "used car buying guide tips",
  "auto insurance rates comparison",
  "hybrid car fuel efficiency",
  "car detailing tips DIY",
  "tire replacement cost guide",
  "brake repair signs problems",
  "engine oil types explained",
  "car battery replacement guide",
  "roadside assistance plans comparison",
  "vehicle recall check free",
  "car loan calculator tool",
  "driving test tips first time",
  // Social & Culture
  "social media marketing strategy 2025",
  "influencer marketing trends",
  "digital nomad lifestyle guide",
  "remote work best practices",
  "work from home productivity tips",
  "networking events near me",
  "volunteer opportunities local",
  "community garden starting guide",
  "cultural festivals 2025 calendar",
  "museum free admission days",
  "library events near me",
  "online community building tips",
  "pet adoption near me dogs",
  "dog training tips beginners",
  "cat care guide indoor",
  // Nature & Outdoors
  "bird watching guide beginners",
  "national wildlife refuge visiting",
  "fishing license requirements state",
  "camping recipes Dutch oven",
  "kayaking tips beginners",
  "rock climbing techniques basics",
  "star gazing app free",
  "weather patterns understanding",
  "wildflower identification guide",
  "mushroom foraging safety tips",
  "bee keeping starter kit",
  "composting bin DIY outdoor",
  "rain garden design plans",
  "tree identification app free",
  "nature photography tips phone",
  // Business & Career
  "startup business plan template",
  "entrepreneurship resources free",
  "business name generator tool",
  "marketing plan template free",
  "email marketing best practices",
  "SEO optimization tips 2025",
  "content marketing strategy guide",
  "social media advertising costs",
  "customer service excellence tips",
  "leadership development training",
  "project management tools comparison",
  "remote team management tips",
  "business insurance types explained",
  "franchise opportunities 2025",
  "e-commerce platform comparison",
  "dropshipping guide for beginners",
  "Amazon FBA seller tips",
  "print on demand business model",
  "freelance writing jobs online",
  "consulting business start guide",
  // Misc
  "free online games no download",
  "weather forecast this weekend",
  "public library hours near me",
  "postal service tracking package",
  "government benefits eligibility check",
  "voting registration deadline 2025",
  "volunteer tax preparation assistance",
  "local events this weekend free",
  "online safety tips seniors",
  "disaster preparedness kit checklist",
  "first aid training certification",
  "CPR certification classes near me",
  "blood donation eligibility requirements",
  "organ donor registration process",
  "passport photo requirements 2025",
  "visa application status check",
  "social security benefits calculator",
  "medicare enrollment guide 2025",
  "college savings plan comparison",
  "home warranty coverage review",
];

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomItems<T>(array: T[], count: number): T[] {
  return shuffleArray(array).slice(0, count);
}

export type QuerySource = "trending" | "random" | "custom";

export interface GenerateQueriesOptions {
  count?: number;
  source?: QuerySource;
  customQueries?: string;
}

export async function generateQueries(options: GenerateQueriesOptions = {}): Promise<string[]> {
  const { count = 30, source = "trending", customQueries = "" } = options;

  switch (source) {
    case "custom":
      return generateCustomQueries(customQueries, count);
    case "trending":
      return generateTrendingQueries(count);
    case "random":
    default:
      return generateRandomQueries(count);
  }
}

async function generateTrendingQueries(count: number): Promise<string[]> {
  try {
    const zai = await ZAI.create();

    // Use web search to find trending topics
    const trendingSearchResults = await zai.functions.invoke("web_search", {
      query: "trending searches today 2025",
      num: 10,
    });

    // Extract topic names from search results
    const trendingTopics = trendingSearchResults.map((r) => r.name).filter(Boolean);

    // Use LLM to generate realistic search queries based on trending topics
    const topicList = trendingTopics.length > 0
      ? trendingTopics.join("\n")
      : "current events, popular news, viral topics, trending technology";

    const llmResponse = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a search query generator. Generate realistic search queries that a typical person would type into a search engine. Each query should be 2-8 words, natural and conversational. Return ONLY a JSON array of strings, no other text.",
        },
        {
          role: "user",
          content: `Based on these trending topics, generate ${count} realistic search queries:\n\n${topicList}`,
        },
      ],
    });

    const content =
      typeof llmResponse === "object" && llmResponse !== null
        ? (llmResponse as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
        : undefined;

    if (content) {
      const parsed = parseQueryArray(content, count);
      if (parsed.length > 0) return parsed;
    }
  } catch {
    // Fall through to random queries
  }

  return generateRandomQueries(count);
}

async function generateRandomQueries(count: number): Promise<string[]> {
  // If count is small enough, just use built-in list
  if (count <= SEARCH_TOPICS.length) {
    return getRandomItems(SEARCH_TOPICS, count);
  }

  // For larger counts, use LLM to supplement
  try {
    const zai = await ZAI.create();
    const baseQueries = getRandomItems(SEARCH_TOPICS, Math.min(20, count));
    const remaining = count - baseQueries.length;

    if (remaining > 0) {
      const llmResponse = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a search query generator. Generate realistic search queries that a typical person would type into a search engine. Each query should be 2-8 words, natural and conversational. Return ONLY a JSON array of strings, no other text.",
          },
          {
            role: "user",
            content: `Generate ${remaining} unique realistic search queries on various topics (technology, health, science, entertainment, travel, food, finance, education, sports, home, fashion). Make them diverse and natural.`,
          },
        ],
      });

      const content =
        typeof llmResponse === "object" && llmResponse !== null
          ? (llmResponse as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
          : undefined;

      if (content) {
        const parsed = parseQueryArray(content, remaining);
        return [...baseQueries, ...parsed].slice(0, count);
      }
    }

    return baseQueries;
  } catch {
    // Fall back to just built-in list with repetition
    const queries: string[] = [];
    while (queries.length < count) {
      const batch = getRandomItems(SEARCH_TOPICS, Math.min(count - queries.length, SEARCH_TOPICS.length));
      queries.push(...batch);
    }
    return queries.slice(0, count);
  }
}

function generateCustomQueries(customQueries: string, count: number): string[] {
  if (!customQueries.trim()) {
    return generateRandomQueries(count);
  }

  const queries = customQueries
    .split(",")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  // If not enough custom queries, supplement with random ones
  if (queries.length < count) {
    const needed = count - queries.length;
    const randomOnes = getRandomItems(SEARCH_TOPICS, needed);
    return [...queries, ...randomOnes];
  }

  return getRandomItems(queries, count);
}

function parseQueryArray(content: string, maxCount: number): string[] {
  try {
    // Try to extract JSON array from the content
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, maxCount);
    }
    return [];
  } catch {
    return [];
  }
}
