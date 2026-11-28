import { voiceRms } from './voiceSignal.ts';

export const VOICE_SAMPLE_RATE = 24_000;
export const MAX_VOICE_SAMPLES = VOICE_SAMPLE_RATE * 125;
/** Canonical mono PCM16 WAV, with a finite duration and no streaming-container metadata. */
export function encodeVoiceWav(samples: Float32Array): ArrayBuffer {
  if (!samples.length || samples.length > MAX_VOICE_SAMPLES) throw new Error('Thời lượng bản ghi không hợp lệ.');
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const tag = (offset:number,value:string) => { for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i)); };
  tag(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,VOICE_SAMPLE_RATE,true);view.setUint32(28,VOICE_SAMPLE_RATE*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){
    if(!Number.isFinite(samples[i]))throw new Error('Dữ liệu âm thanh không hợp lệ.');
    const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);
  }
  return buffer;
}
/** Choose the most audible channel instead of cancelling opposite-phase stereo. */
export function strongestVoiceChannel(channels: Float32Array[]): Float32Array {
  if(!channels.length)throw new Error('Bản ghi không chứa kênh âm thanh.');
  return channels.reduce((best,channel)=>voiceRms(channel)>voiceRms(best)?channel:best);
}
export function recordedVoicePeak(samples:Float32Array):number {
  let peak=0;
  for(let i=0;i<samples.length;i+=2400)peak=Math.max(peak,voiceRms(samples.subarray(i,i+2400)));
  return peak;
}
export async function finalizeVoiceRecording(chunks:Blob[],mime:string) {
  const data=await new Blob(chunks,{type:mime}).arrayBuffer();
  // Decode the actual recorded bytes, not the microphone analyser stream.
  const decoder=new OfflineAudioContext(1,1,VOICE_SAMPLE_RATE);
  const decoded=await decoder.decodeAudioData(data);
  const samples=strongestVoiceChannel(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)));
  const bytes=encodeVoiceWav(samples);
  return {file:new File([bytes],`Ghi-am-${Date.now()}.wav`,{type:'audio/wav'}),peak:recordedVoicePeak(samples),duration:samples.length/VOICE_SAMPLE_RATE};
}
/** Compare actual file contents; no token or raw audio is logged. */
export function voiceBytesMatch(a:ArrayBuffer,b:ArrayBuffer):boolean {
  if(a.byteLength!==b.byteLength)return false;
  const x=new Uint8Array(a),y=new Uint8Array(b);
  return x.every((value,i)=>value===y[i]);
}
