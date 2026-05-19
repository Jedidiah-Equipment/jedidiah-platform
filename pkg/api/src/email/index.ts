export { createEmailSender, type EmailPayload, type EmailSender, type EmailType } from './email-sender.js';
export {
  clearMockEmailMessages,
  getMockEmailMessages,
  type MockEmailMessage,
  type MockEmailType,
} from './mock-email.js';

import { getApiConfig } from '../env.js';
import { createEmailSender } from './email-sender.js';

export const emailSender = createEmailSender(getApiConfig());
