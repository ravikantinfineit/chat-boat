import type Anthropic from '@anthropic-ai/sdk';

/**
 * The bot's tool surface — one tool per endpoint in spec section 3.
 *
 * Descriptions are prescriptive about *when* to call each tool, not just what it
 * does. That is what drives correct routing, and it is where the spec's ordering
 * rules (always re-check availability before committing) are enforced.
 */
export const DIAMOND_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_diamonds',
    description:
      'Search the live diamond inventory. Call this whenever the customer describes what they are looking for — shape, carat, colour, clarity, cut, budget, natural vs lab-grown. Every filter is optional; pass only what the customer actually specified, and do not invent constraints they did not mention. Results are a preview: use get_diamond_details when the customer wants the full picture of one stone. If nothing matches, widen the search (a slightly lower colour grade or a small budget stretch) and say what you relaxed.',
    input_schema: {
      type: 'object',
      properties: {
        shape: {
          type: 'string',
          description: 'Round, Princess, Oval, Emerald, Cushion, Pear, Marquise, Radiant, Asscher, Heart',
        },
        carat_min: { type: 'number', description: 'Minimum weight, e.g. 0.9' },
        carat_max: { type: 'number', description: 'Maximum weight, e.g. 1.2' },
        color_min: { type: 'string', description: 'Best colour grade to include on the D-Z scale, e.g. "F"' },
        color_max: { type: 'string', description: 'Worst colour grade to include, e.g. "H"' },
        clarity_min: {
          type: 'string',
          description: 'Lowest acceptable clarity: FL, IF, VVS1, VVS2, VS1, VS2, SI1, SI2, I1-I3',
        },
        price_min: { type: 'number', description: 'Minimum price in the dealer currency' },
        price_max: { type: 'number', description: "Maximum price — the customer's budget ceiling" },
        cut: { type: 'string', description: 'Excellent, Very Good, Good, Fair, Poor' },
        diamond_type: { type: 'string', enum: ['Natural', 'Lab-Grown'] },
        page: { type: 'number', description: 'Page number, starting at 1' },
        limit: { type: 'number', description: 'Results per page. Default 10; keep it small for chat.' },
      },
      required: [],
    },
  },
  {
    name: 'get_diamond_details',
    description:
      'Fetch every field for one diamond: full 4Cs, polish, symmetry, fluorescence, measurements, depth and table percentages, certificate number and link, images, video and price. Call this when the customer asks about a specific stone, wants the certificate, or asks a question the search preview cannot answer.',
    input_schema: {
      type: 'object',
      properties: {
        diamond_id: { type: 'string', description: 'The stock number, e.g. "DM-20394"' },
      },
      required: ['diamond_id'],
    },
  },
  {
    name: 'check_availability',
    description:
      'Re-confirm a stone is still in stock and re-read its current price, straight from the dealer\'s system with no caching. Diamonds are one-of-a-kind, so you MUST call this immediately before hold_diamond, create_quotation or place_order — search results can be seconds out of date and another customer may have taken the stone. Also use it whenever the customer asks "is this still available?".',
    input_schema: {
      type: 'object',
      properties: {
        diamond_id: { type: 'string', description: 'The stock number to re-verify' },
      },
      required: ['diamond_id'],
    },
  },
  {
    name: 'compare_diamonds',
    description:
      'Fetch full details for two to four diamonds at once so they can be shown side by side. Use this when the customer is weighing specific stones against each other.',
    input_schema: {
      type: 'object',
      properties: {
        diamond_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stock numbers to compare, e.g. ["DM-20394", "DM-20411"]',
        },
      },
      required: ['diamond_ids'],
    },
  },
  {
    name: 'hold_diamond',
    description:
      'Reserve a diamond for a named customer so nobody else can buy it. Call this when the customer says they want to book, reserve, or hold a stone. Requires their name and phone number — ask for whatever is missing before calling; never guess contact details. The hold expires automatically, so tell the customer the reference and the deadline. Always call check_availability first.',
    input_schema: {
      type: 'object',
      properties: {
        diamond_id: { type: 'string' },
        customer_name: { type: 'string', description: 'As given by the customer' },
        customer_phone: { type: 'string', description: 'Including country code' },
        customer_email: { type: 'string' },
        hold_duration_hours: {
          type: 'number',
          description: 'How long to hold for. Use the showroom default unless the customer asks otherwise.',
        },
        notes: { type: 'string', description: 'Anything the sales team should know' },
      },
      required: ['diamond_id', 'customer_name', 'customer_phone'],
    },
  },
  {
    name: 'release_hold',
    description:
      'Cancel an existing hold and return the diamond to available stock. Call this only when the customer explicitly cancels or changes their mind about a stone they had reserved.',
    input_schema: {
      type: 'object',
      properties: {
        diamond_id: { type: 'string' },
        hold_id: { type: 'string', description: 'The reference returned when the hold was created' },
      },
      required: ['diamond_id', 'hold_id'],
    },
  },
  {
    name: 'create_quotation',
    description:
      'Generate a formal PDF quotation for one or more diamonds and get back a shareable link. Call this when the customer asks for a quote, a formal price, or something to show someone else. Requires their name and phone number.',
    input_schema: {
      type: 'object',
      properties: {
        diamond_ids: { type: 'array', items: { type: 'string' } },
        customer_name: { type: 'string' },
        customer_phone: { type: 'string' },
        customer_email: { type: 'string' },
        valid_for_days: { type: 'number', description: 'Quote validity window. Default 7.' },
      },
      required: ['diamond_ids', 'customer_name', 'customer_phone'],
    },
  },
  {
    name: 'place_order',
    description:
      'Confirm a purchase. Call this only after the customer has clearly confirmed they want to buy and has given a delivery address. Always call check_availability first. Report the order reference and delivery estimate back to them.',
    input_schema: {
      type: 'object',
      properties: {
        diamond_ids: { type: 'array', items: { type: 'string' } },
        customer_name: { type: 'string' },
        customer_phone: { type: 'string' },
        customer_email: { type: 'string' },
        delivery_address: { type: 'string' },
        quotation_id: { type: 'string', description: 'If the order came from a quote' },
      },
      required: ['diamond_ids', 'customer_name', 'customer_phone', 'delivery_address'],
    },
  },
  {
    name: 'get_order_status',
    description:
      'Look up an existing order: current status, tracking number and delivery estimate. Call this when the customer asks where their order is.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'The order reference, e.g. "ORD-99341"' },
      },
      required: ['order_id'],
    },
  },
];

/** Short human-readable label shown in the widget while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  search_diamonds: 'Searching inventory',
  get_diamond_details: 'Loading diamond details',
  check_availability: 'Confirming availability',
  compare_diamonds: 'Building comparison',
  hold_diamond: 'Reserving the diamond',
  release_hold: 'Releasing the hold',
  create_quotation: 'Preparing your quotation',
  place_order: 'Placing the order',
  get_order_status: 'Checking your order',
};
