export interface WhatsAppVendorRegDraft {
  step:
    | 'STEP_1_NAME'
    | 'STEP_2_BIZ'
    | 'STEP_3_LOCATION'
    | 'STEP_4_PRODUCTS'
    | 'STEP_5_PHOTO'
    | 'STEP_6_CONFIRM';
  ownerFullName?: string;
  businessName?: string;
  cacNumber?: string;
  marketHub?: string;
  shopAddress?: string;
  category?: string;
  productsDescription?: string;
  priceRange?: string;
  photoVerified?: boolean;
  photoMediaId?: string;
  updatedAt: string;
}

export interface WhatsAppClaimDraft {
  step: 'AWAITING_BIZ_NAME' | 'AWAITING_OTP';
  listingId?: string;
  businessName?: string;
  registeredPhone?: string;
  otpCode?: string;
  otpExpiresAt?: number;
  updatedAt: string;
}

export interface WhatsAppReportDraft {
  step: 'AWAITING_DETAILS';
  vendorId?: string;
  vendorName?: string;
  vendorPhone?: string;
  updatedAt: string;
}

export interface WhatsAppSearchState {
  lastQuery?: string;
  cleanProduct?: string;
  location?: string;
  category?: string;
  allMatchingListings?: any[];
  pageIndex: number;
  updatedAt: string;
}

export interface WhatsAppBuyerProfile {
  fullName?: string;
  name?: string;
  phone?: string;
  state?: string;
  city?: string;
  address?: string;
  isRegistered?: boolean;
  registeredAt?: string;
  createdAt?: string;
  lastActiveAt?: string;
}

export interface WhatsAppUserSessionState {
  state:
    | 'IDLE'
    | 'AWAITING_SAVE_CONTACT'
    | 'BUYER_REG_NAME'
    | 'BUYER_REG_LOCATION'
    | 'QUALIFYING_VOLUME'
    | 'QUALIFYING_FULFILLMENT'
    | 'QUALIFYING_LOCATION'
    | 'NEGOTIATOR_OFFER'
    | 'NEGOTIATOR_BUDGET'
    | 'NEGOTIATOR_AWAITING_PAY'
    | 'VENDOR_PORTAL'
    | 'VENDOR_ADD_PRODUCT'
    | 'VENDOR_EDIT_PRICE'
    | 'REG_ONBOARDING'
    | 'CLAIM_PROCESS'
    | 'REPORT_PROCESS'
    | 'SUPPORT_PROCESS';
  activeVendorId?: string;
  activeVendorName?: string;
  activeVendorPhone?: string;
  activeItem?: string;
  activeItemPrice?: string;
  orderVolume?: 'Retail' | 'Wholesale';
  fulfillment?: 'Shop Visit' | 'Local City Delivery' | 'Interstate Waybill';
  buyerLocation?: string;
  buyerProfile?: WhatsAppBuyerProfile;
  negotiationDraft?: {
    enabled: boolean;
    targetBudget?: string;
    txRef?: string;
    paymentLink?: string;
    isPaid?: boolean;
    aiProposal?: string;
  };
  vendorDraft?: {
    action?: 'ADD_PRODUCT' | 'EDIT_PRICE' | 'DELETE_ACCOUNT';
    productName?: string;
    price?: string;
    step?: string;
  };
  searchState?: WhatsAppSearchState;
  regDraft?: WhatsAppVendorRegDraft;
  claimDraft?: WhatsAppClaimDraft;
  reportDraft?: WhatsAppReportDraft;
  hasReceivedContactCard?: boolean;
  pendingIntent?: {
    action: 'REGISTER_VENDOR' | 'CONNECT_VENDOR' | 'SEARCH' | 'GREETING';
    payload?: any;
  };
  updatedAt: string;
}

// In-memory active sessions store for ultra-fast conversational state routing
const waSessions = new Map<string, WhatsAppUserSessionState>();

export function getWhatsAppSession(phone: string): WhatsAppUserSessionState {
  const clean = phone.replace(/\D/g, '');
  if (!waSessions.has(clean)) {
    waSessions.set(clean, {
      state: 'IDLE',
      updatedAt: new Date().toISOString(),
    });
  }
  return waSessions.get(clean)!;
}

export function updateWhatsAppSession(
  phone: string,
  update: Partial<WhatsAppUserSessionState>
): WhatsAppUserSessionState {
  const clean = phone.replace(/\D/g, '');
  const current = getWhatsAppSession(clean);
  const updated: WhatsAppUserSessionState = {
    ...current,
    ...update,
    updatedAt: new Date().toISOString(),
  };
  waSessions.set(clean, updated);
  return updated;
}

export function resetWhatsAppSession(phone: string): void {
  const clean = phone.replace(/\D/g, '');
  waSessions.set(clean, {
    state: 'IDLE',
    updatedAt: new Date().toISOString(),
  });
}
