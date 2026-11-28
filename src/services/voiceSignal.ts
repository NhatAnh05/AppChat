// RMS on time-domain PCM, independent of device and recorder container format.
export function voiceRms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum=0;
  for (const sample of samples) sum+=sample*sample;
  return Math.sqrt(sum/samples.length);
}
export const VOICE_SIGNAL_THRESHOLD=0.003;
export function voiceSignalWarning(samples:number,peak:number):string {
  if(!samples)return 'Chưa kiểm tra được mức tín hiệu microphone. Hãy nghe thử bản ghi trước khi gửi.';
  if(peak<VOICE_SIGNAL_THRESHOLD)return 'Tín hiệu microphone rất thấp hoặc im lặng. Kiểm tra thiết bị đầu vào và nghe thử trước khi gửi.';
  return '';
}
