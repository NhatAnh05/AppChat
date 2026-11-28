import { enqueueAuthenticatedRequest } from './requestCorrelation.ts';
/** ACTION_NOT_EXIT has no request ID; serialize probes within one session. */
export const withApiProbeGate = enqueueAuthenticatedRequest;
