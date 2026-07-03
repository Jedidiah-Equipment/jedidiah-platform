export type QuoteEmailPromptInput = {
  code: string;
  quoteId: string;
};

/**
 * Shared base prompt for drafting a customer-facing quote email body. Both call sites — the in-app
 * assistant and the server-side Draft Email flow — run the tool-enabled agent, so the model looks the
 * Quote up by id rather than being hand-fed facts. Keeping the wording here stops the two surfaces from
 * drifting apart in tone and instructions.
 */
export function buildQuoteEmailPrompt({ code, quoteId }: QuoteEmailPromptInput): string {
  return `Draft a warm, natural customer email body for quote ${code}.

Use the available quote details for quote id ${quoteId}. Address the customer appropriately and write like a real salesperson, not like a checklist or generated summary. Keep the tone professional, clear, and human, using plain business English rather than casual filler.

Cover the important commercial details in flowing paragraphs: the quoted offering, delivery inclusion and delivery price when available, any discount offered, payment terms including the deposit percentage, the preferred delivery date, how long the quote is valid, and any notes included on the quote document. For Product Quotes, describe the Product by its model/name and include selected optional assembly options when present. For Custom Quotes, describe the quoted work by its Work Title instead of naming a Product, and do not invent product details or optional assemblies.

Use a simple, natural opening such as "Thank you for the opportunity" or move directly into the quote context. Avoid awkward or overly casual phrases like "put this together for you", stiff phrases like "we are pleased to quote", "selected optional assembly options included with this quote are", or one short paragraph per fact. Do not over-repeat the quote code or customer name. If a list of options is needed, fold it into a sentence naturally.

Do not invent missing facts. If a detail is not available on the quote, omit it rather than guessing. Return only the email body.`;
}
