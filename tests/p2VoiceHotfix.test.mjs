import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeVoiceWav,strongestVoiceChannel,recordedVoicePeak,voiceBytesMatch,MAX_VOICE_SAMPLES} from '../src/services/voiceWav.ts';
import {mediaMime} from '../src/services/mediaUpload.ts';
import {parseMediaMessage} from '../src/services/mediaProtocol.ts';

test('Voice hotfix: canonical PCM WAV has finite duration and retains signed samples',()=>{
 const pcm=new Float32Array(24000);pcm.set([-1,-.5,0,.5,1]);const wav=encodeVoiceWav(pcm);const v=new DataView(wav);
 assert.equal(Buffer.from(wav).subarray(0,4).toString(),'RIFF');assert.equal(v.getUint32(4,true),wav.byteLength-8);assert.equal(v.getUint32(24,true),24000);assert.equal(v.getUint32(40,true)/48000,1);
 assert.deepEqual(Array.from({length:5},(_,i)=>v.getInt16(44+i*2,true)),[-32768,-16384,0,16384,32767]);
 assert.throws(()=>encodeVoiceWav(new Float32Array(0)));assert.throws(()=>encodeVoiceWav(new Float32Array(MAX_VOICE_SAMPLES+1)));assert.throws(()=>encodeVoiceWav(new Float32Array([NaN])));
});
test('Voice hotfix: strongest channel and decoded samples distinguish signal from silence',()=>{
 const silence=new Float32Array(24000);const tone=Float32Array.from({length:24000},(_,i)=>.3*Math.sin(i*.1));
 assert.equal(recordedVoicePeak(silence),0);assert.ok(recordedVoicePeak(tone)>.2);assert.equal(strongestVoiceChannel([silence,tone]),tone);
});
test('Voice hotfix: exact upload integrity and WAV message recognition',()=>{
 const wav=encodeVoiceWav(new Float32Array([.2,.3]));const corrupt=wav.slice(0);new Uint8Array(corrupt)[45]^=1;
 assert.ok(voiceBytesMatch(wav,wav.slice(0)));assert.equal(voiceBytesMatch(wav,corrupt),false);assert.equal(voiceBytesMatch(wav,wav.slice(1)),false);
 assert.equal(mediaMime({name:'record.wav',type:''}),'audio/wav');assert.equal(parseMediaMessage('https://example.test/record.wav').kind,'audio');
});
