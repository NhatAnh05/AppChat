/** Dev-only request guard. Production must use authenticated gateway claims. */
export function localMediaRequestAllowed(enabled:boolean, remoteAddress:string|undefined, host:string|undefined,
  method:string|undefined, origin:string|undefined, fetchSite?:string):boolean {
  if (!enabled || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remoteAddress||'')) return false;
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host||'') || fetchSite==='cross-site') return false;
  return method==='GET' || (method==='POST' && origin===`http://${host}`);
}
