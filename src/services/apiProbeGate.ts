/**
 * Máy chủ không gửi request ID khi báo ACTION_NOT_EXIT. Không để các lần dò sự kiện
 * online và lịch sử chạy đồng thời, tránh nhận nhầm lỗi của yêu cầu khác.
 */
let gate: Promise<void> = Promise.resolve();
export function withApiProbeGate<T>(operation: () => Promise<T>): Promise<T> {
  const run = gate.catch(() => undefined).then(operation);
  gate = run.then(() => undefined, () => undefined);
  return run;
}
