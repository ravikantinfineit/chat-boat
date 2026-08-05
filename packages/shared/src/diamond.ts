/**
 * Diamond data model — spec section 2.
 *
 * These are the fields the chatbot needs in order to search, compare, quote and
 * sell. The client's ERP maps its own column names onto these; the chatbot only
 * ever sees this shape.
 */

/**
 * Spec 6: stock_status is a fixed, agreed set. The chatbot's booking logic
 * depends on exact string matching, so this must not drift.
 */
export const STOCK_STATUSES = ['In Stock', 'Reserved', 'Sold', 'On Memo'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

/** Only diamonds in this state can be quoted or held. */
export function isSellable(status: StockStatus): boolean {
  return status === 'In Stock';
}

export type DiamondType = 'Natural' | 'Lab-Grown';

/** Spec 2.1 — core identification. */
export interface DiamondIdentity {
  /** Unique ID / stock number in the client's system, e.g. "DM-20394". */
  diamond_id: string;
  /** Lab certificate number, e.g. "GIA-2185847362". */
  certificate_no?: string;
  /** GIA, IGI, HRD, etc. */
  lab?: string;
  /** Link to the certificate PDF or image. Optional but valuable for trust. */
  certificate_url?: string;
}

/** Spec 2.2 — the 4Cs. */
export interface DiamondFourCs {
  /** Weight, e.g. 1.02. */
  carat: number;
  /** Excellent / Very Good / Good / Fair / Poor. */
  cut?: string;
  /** D–Z grading scale. */
  color?: string;
  /** FL, IF, VVS1, VVS2, VS1, VS2, SI1, SI2, I1–I3. */
  clarity?: string;
}

/** Spec 2.3 — additional grading detail. */
export interface DiamondGrading {
  /** Round, Princess, Oval, Emerald, Cushion, etc. */
  shape?: string;
  polish?: string;
  symmetry?: string;
  /** None / Faint / Medium / Strong. */
  fluorescence?: string;
  /** e.g. "6.45 x 6.48 x 3.98 mm". */
  measurements?: string;
  depth_percent?: number;
  table_percent?: number;
}

/** Spec 2.4 — commercial data. */
export interface DiamondCommercial {
  /** Current selling price. */
  price: number;
  currency: string;
  discount_percent?: number;
  stock_status: StockStatus;
  /** Usually 1 — relevant for lab-grown / batch stock. */
  quantity_available?: number;
  /** Warehouse or branch, e.g. "Mumbai Vault". */
  location?: string;
}

/** Spec 2.5 / 2.6 — media and categorisation. */
export interface DiamondMedia {
  image_urls?: string[];
  /** 360-degree spin video link, if available. */
  video_url?: string;
  diamond_type?: DiamondType;
  /** e.g. ["bridal", "solitaire", "investment-grade"]. */
  tags?: string[];
}

/** The full object returned by GET /api/diamonds/{diamond_id} (spec 3.3). */
export interface Diamond
  extends DiamondIdentity,
    DiamondFourCs,
    DiamondGrading,
    DiamondCommercial,
    DiamondMedia {}

/**
 * The trimmed shape returned by the search endpoint (spec 3.2). Search results
 * are a preview; the bot fetches the full object when the customer drills in.
 */
export type DiamondSummary = Pick<
  Diamond,
  | 'diamond_id'
  | 'shape'
  | 'carat'
  | 'color'
  | 'clarity'
  | 'cut'
  | 'price'
  | 'currency'
  | 'stock_status'
  | 'image_urls'
  | 'certificate_no'
>;
