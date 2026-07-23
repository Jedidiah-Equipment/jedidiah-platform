export {
  createCustomerAppHref,
  createJobAppHref,
  createProductAppHref,
  createProductBrochureDownloadHref,
  createQuoteAppHref,
  createQuoteDocumentDownloadHref,
  InternalAppHref,
  type ParsedInternalAppHref,
  parseInternalAppHref,
} from '@pkg/schema';
export type { LanguageModel as AiChatModel, UIMessage as AiUiMessage } from 'ai';
export {
  type StreamAiChatOptions,
  streamAiChat,
  type ValidateAiUiMessagesResult,
  validateAiUiMessages,
} from './ai-chat.js';
export { createOpenAiChatModel } from './ai-sdk-model.js';
export { type AiToolName, createAiSdkTools } from './ai-sdk-tools.js';
export {
  type ProductRangeTranslationOutput,
  type ProductRangeVariantTranslationOutput,
  type ProductTranslationOutput,
  type ProductTranslationSource,
  translateCatalogSourceToAfrikaans,
} from './catalog-translation.js';
export type {
  AiContext,
  AiEmailAttachment,
  AiEmailMessage,
  AiEmailSender,
  AiSession,
} from './context.js';
