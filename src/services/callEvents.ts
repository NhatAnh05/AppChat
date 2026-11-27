export type CallMode = 'voice' | 'video';
export type CallRequest = {to:string; mode:CallMode};
export const requestCall = (to:string, mode:CallMode) => {
  window.dispatchEvent(new CustomEvent<CallRequest>('lyra:start-call',{detail:{to,mode}}));
};
