import { enqueueAuthenticatedRequest } from './requestCorrelation.ts';
/** SEND_CHAT shares a response channel; isolate and serialize by login lifetime. */
export const enqueueChatSend = enqueueAuthenticatedRequest;
