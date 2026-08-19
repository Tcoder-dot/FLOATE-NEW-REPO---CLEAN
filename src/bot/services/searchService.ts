import { parseShoppingQuery, ParsedCommerceQuery } from './aiService.js';
import { sheetsDb, BusinessListing, isSpotlightBusiness } from './sheetsService.js';
import { firestoreDb } from './firestoreService.js';

export interface SearchInput {
  query: string;
  location?: string;
  budget?: string;
}

export interface MatchedVendorResult {
  id: string;
  businessName: string;
  product: string;
  price: string;
  location: string;
  isVerified: boolean;
  isHighlyRecommended?: boolean;
  verifiedStatus: 'YES' | 'PENDING';
  category: string;
  listingType: string;
  telegramDeepLink: string;
  whatsappDeepLink?: string;
  continueUrl: string;
  profileImageUrl?: string;
  productImages?: string[];
  identityVerified?: boolean;
}

export interface SearchExecutionResponse {
  query: string;
  parsed: ParsedCommerceQuery;
  exactMatches: MatchedVendorResult[];
  categoryMatches: MatchedVendorResult[];
  results: MatchedVendorResult[];
  outOfAreaRecommendations?: MatchedVendorResult[];
  totalMatches: number;
  moreBusinessesDeepLink: string;
  moreBusinessesWhatsAppDeepLink?: string;
}

/**
 * Creates a valid, URL-safe Telegram start payload and full deep link for search requests.
 * Telegram payloads must be 1-64 characters matching [a-zA-Z0-9_-].
 */
export function generateMoreBusinessesDeepLink(query: string, location?: string): string {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'Floatebusinessbot';
  const cleanQ = (query || '').trim().toLowerCase();
  const cleanLoc = (location || '').trim().toLowerCase();

  let rawSlug = cleanQ.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleanLoc) {
    const locSlug = cleanLoc.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (locSlug) {
      rawSlug = `${rawSlug}_in_${locSlug}`;
    }
  }

  // If slug fits neatly within Telegram's 64-char limit, use human-readable search_<slug>
  const fullSlug = `search_${rawSlug}`.substring(0, 64);
  if (rawSlug.length > 0 && fullSlug.length <= 64) {
    return `https://t.me/${botUsername}?start=${fullSlug}`;
  }

  // Fallback: base64url encoding
  try {
    const jsonStr = JSON.stringify({ q: cleanQ.substring(0, 30), l: cleanLoc ? cleanLoc.substring(0, 15) : undefined });
    const b64 = Buffer.from(jsonStr).toString('base64url').substring(0, 60);
    return `https://t.me/${botUsername}?start=s_${b64}`;
  } catch {
    return `https://t.me/${botUsername}?start=search_${rawSlug.substring(0, 55)}`;
  }
}

/**
 * Decodes a Telegram /start search deep link payload back into query and location
 */
export function parseSearchDeepLinkPayload(payload: string): { query: string; location?: string } {
  if (!payload) return { query: '' };

  const trimmed = payload.trim();

  // 1. Check base64 encoded payload: s_<base64url> or q_<base64url>
  if (trimmed.startsWith('s_') || trimmed.startsWith('q_')) {
    const b64 = trimmed.substring(2);
    try {
      const decoded = Buffer.from(b64, 'base64url').toString('utf8');
      if (decoded.startsWith('{') && decoded.endsWith('}')) {
        const obj = JSON.parse(decoded);
        return {
          query: obj.q || '',
          location: obj.l || undefined,
        };
      } else if (decoded) {
        return { query: decoded };
      }
    } catch {
      // Fall through to slug handling if base64 decoding fails
    }
  }

  // 2. Standard slug format: search_<query> or find_<query> or more_<query>
  let cleanSlug = trimmed.replace(/^(search_|find_|more_|s_|q_)/, '');

  let location: string | undefined;
  if (cleanSlug.includes('_in_')) {
    const parts = cleanSlug.split('_in_');
    cleanSlug = parts[0] || '';
    const locPart = parts.slice(1).join(' ').replace(/_+/g, ' ').trim();
    if (locPart) location = locPart;
  }

  const query = cleanSlug.replace(/_+/g, ' ').trim();
  return { query, location };
}

function formatResultItem(listing: BusinessListing): MatchedVendorResult {
  const cleanPhone = listing.whatsapp || '';
  const city = listing.city || '';
  const state = listing.state || '';
  const locationStr = [city, state].filter(Boolean).join(', ') || 'Nigeria';
  const listingId = listing.id || cleanPhone;
  const businessName = listing.businessName || 'Verified Merchant';
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'Floatebusinessbot';
  const deepLink = `https://t.me/${botUsername}?start=connect_${slug}`;

  const botWaPhone = process.env.WHATSAPP_PHONE_NUMBER || '2348000000000';
  const cleanBotWaPhone = botWaPhone.replace(/\D/g, '');
  const waDeepLink = `https://wa.me/${cleanBotWaPhone}?text=CONNECT_VENDOR_${encodeURIComponent(listingId)}`;

  return {
    id: listingId,
    businessName,
    product: listing.product || '',
    price: listing.price || 'Negotiable',
    location: locationStr,
    isVerified: Boolean(listing.isVerified || listing.verifiedStatus === 'YES'),
    isHighlyRecommended: Boolean(listing.isHighlyRecommended || isSpotlightBusiness(businessName)),
    verifiedStatus: listing.verifiedStatus || 'YES',
    category: listing.category || 'General',
    listingType: listing.listingType || 'Product',
    telegramDeepLink: deepLink,
    whatsappDeepLink: waDeepLink,
    continueUrl: deepLink,
    profileImageUrl: listing.profileImageUrl || undefined,
    productImages: listing.productImages && listing.productImages.length > 0 ? listing.productImages : undefined,
    identityVerified: Boolean(listing.identityVerified),
  };
}

/**
 * Central shared search function for both Telegram Bot and External Web API (floate.xyz)
 */
export async function executeSearch(input: SearchInput): Promise<SearchExecutionResponse> {
  const rawQuery = (input.query || '').trim();
  if (!rawQuery) {
    return {
      query: '',
      parsed: { searchKeywords: '', isRegistrationRequest: false },
      exactMatches: [],
      categoryMatches: [],
      results: [],
      totalMatches: 0,
      moreBusinessesDeepLink: generateMoreBusinessesDeepLink(''),
    };
  }

  // 1. AI Parsing with Gemini
  let parsed: ParsedCommerceQuery;
  try {
    parsed = await parseShoppingQuery(rawQuery);
  } catch (err: any) {
    console.warn('[SearchService] parseShoppingQuery fallback:', err?.message || err);
    parsed = { searchKeywords: rawQuery, isRegistrationRequest: false };
  }

  // Apply explicit overrides from input if provided
  if (input.location) parsed.targetSellerLocation = input.location;

  // 2. Database Lookup & Match Ranking
  const searchKeywords = parsed.searchKeywords || rawQuery;
  let searchResults;
  try {
    searchResults = await sheetsDb.searchBusinessListings(
      searchKeywords,
      parsed.targetSellerLocation,
      parsed.category,
      parsed.maxPriceNaira,
      parsed.inferredCategories
    );
  } catch (searchErr: any) {
    console.error('[SearchService] Search execution error:', searchErr?.message || searchErr);
    searchResults = { exactMatches: [], categoryMatches: [], allMatches: [], source: 'local' as const };
  }

  // 3. Transform into clean standardized results
  const exactMatches = searchResults.exactMatches.map(formatResultItem);
  const categoryMatches = searchResults.categoryMatches.map(formatResultItem);
  const outOfAreaRecommendations = (searchResults.outOfAreaRecommendations || []).map(formatResultItem);

  // Combine exact matches and category matches without duplicates (by ID and normalized business name)
  const seenIds = new Set<string>();
  const seenBizNames = new Set<string>();
  const combinedResults: MatchedVendorResult[] = [];

  const addUnique = (match: MatchedVendorResult) => {
    const bizNorm = (match.businessName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seenIds.has(match.id) && !seenBizNames.has(bizNorm)) {
      seenIds.add(match.id);
      seenBizNames.add(bizNorm);
      combinedResults.push(match);
    }
  };

  for (const match of exactMatches) {
    addUnique(match);
  }

  for (const match of categoryMatches) {
    addUnique(match);
  }

  const moreBusinessesDeepLink = generateMoreBusinessesDeepLink(rawQuery, input.location || parsed.targetSellerLocation);
  const cleanBotWaPhone = (process.env.WHATSAPP_PHONE_NUMBER || '2348000000000').replace(/\D/g, '');
  const moreBusinessesWhatsAppDeepLink = `https://wa.me/${cleanBotWaPhone}?text=SEARCH_${encodeURIComponent(rawQuery.toLowerCase().replace(/[^a-z0-9]+/g, '_'))}`;

  return {
    query: rawQuery,
    parsed,
    exactMatches,
    categoryMatches,
    results: combinedResults,
    outOfAreaRecommendations,
    totalMatches: combinedResults.length,
    moreBusinessesDeepLink,
    moreBusinessesWhatsAppDeepLink,
  };
}

export interface InventoryItem {
  id: string;
  vendorPhone: string;
  vendorName: string;
  productName: string;
  price: string;
  location: string;
  tier: 'SPOTLIGHT' | 'VERIFIED' | 'PARTIALLY_VERIFIED';
}

export async function searchTop7Inventory(query: string, locationFilter?: string): Promise<InventoryItem[]> {
  try {
    const products = await firestoreDb.getProductsFromFirestore();
    const sheetsListings = sheetsDb.getAllBusinessListings();
    
    const allItems: InventoryItem[] = [];
    
    products.forEach((p, idx) => {
      const loc = [p.city, p.state].filter(Boolean).join(', ') || 'Nigeria';
      allItems.push({
        id: p.id || `prod_${idx}`,
        vendorPhone: (p.whatsapp || '').replace(/\D/g, ''),
        vendorName: p.businessName || 'Verified Vendor',
        productName: p.product || 'General Item',
        price: p.price || 'Market Rate',
        location: loc,
        tier: 'VERIFIED'
      });
    });

    sheetsListings.forEach((l, idx) => {
      const loc = [l.city, l.state].filter(Boolean).join(', ') || 'Nigeria';
      const tier = l.isVerified ? 'SPOTLIGHT' : 'VERIFIED';
      allItems.push({
        id: l.id || `sheet_${idx}`,
        vendorPhone: (l.whatsapp || '').replace(/\D/g, ''),
        vendorName: l.businessName || 'Verified Vendor',
        productName: l.product || 'General Item',
        price: l.price || 'Market Rate',
        location: loc,
        tier
      });
    });

    // Prioritize spotlight / verified businesses first
    allItems.sort((a, b) => {
      const tierA = a.tier === 'SPOTLIGHT' ? 2 : 1;
      const tierB = b.tier === 'SPOTLIGHT' ? 2 : 1;
      return tierB - tierA;
    });

    const qLower = (query || '').toLowerCase().trim();
    const locLower = (locationFilter || '').toLowerCase().trim();
    const tokens = qLower.split(/\s+/).filter(t => t.length > 1);

    const scored = allItems.map(item => {
      let score = item.tier === 'SPOTLIGHT' ? 5 : 2;
      const text = `${item.productName} ${item.vendorName} ${item.location}`.toLowerCase();
      
      tokens.forEach(token => {
        if (text.includes(token)) score += 3;
      });
      if (qLower && text.includes(qLower)) score += 10;
      if (locLower && item.location.toLowerCase().includes(locLower)) score += 5;

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const matched = scored.map(s => s.item);
    if (matched.length > 0) {
      return matched.slice(0, 7);
    }

    return allItems.slice(0, 7);
  } catch (err) {
    console.error('[SearchTop7Inventory Error]:', err);
    return [];
  }
}

export const searchTop3Inventory = searchTop7Inventory;
