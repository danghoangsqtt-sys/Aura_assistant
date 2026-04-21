let globalAudioContext: AudioContext | null = null;

export const getAudioContext = (): AudioContext => {
  if (!globalAudioContext || globalAudioContext.state === 'closed') {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000, // Tần số mẫu chuẩn của Gemini Live Output (Khôi phục bản gốc)
    });
  }
  return globalAudioContext;
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Convert Float32 (Microphone) to Int16 (Gemini Input)
export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp values to [-1, 1] before conversion to prevent distortion
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

// Convert Int16 (Gemini Output) to Float32 (Speaker)
export function int16ToFloat32(int16Buffer: ArrayBuffer): Float32Array {
  const int16View = new Int16Array(int16Buffer);
  const float32 = new Float32Array(int16View.length);
  for (let i = 0; i < int16View.length; i++) {
    float32[i] = int16View[i] / 32768.0;
  }
  return float32;
}

/**
 * Optimized Downsampler (Decimation)
 * Switched from averaging to simple decimation for speed. 
 * For 44.1kHz -> 16kHz speech, this is sufficient and much faster.
 */
export function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (outputSampleRate === inputSampleRate) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.floor(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    // Direct picking (Decimation) - Faster than averaging loop
    const offset = Math.floor(i * sampleRateRatio);
    result[i] = buffer[offset];
  }

  return result;
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    console.error('[audioUtils] base64ToArrayBuffer failed:', e);
    return new ArrayBuffer(0);
  }
}

// BUG-C03 FIX: Use chunk-based btoa to avoid O(n²) string concatenation
// which causes GC pressure and audio pipeline lag with large buffers.
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    const CHUNK_SIZE = 65535; // Safe limit for Function.prototype.apply call stack
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  } catch (e) {
    console.error('[audioUtils] arrayBufferToBase64 failed:', e);
    return '';
  }
}

// Used for TTS playback (one-off), we reuse the global audio context robustly
export async function playPCMAudio(base64String: string, sampleRate = 24000) {
  const arrayBuffer = base64ToArrayBuffer(base64String);
  const globalAudioContext = getAudioContext();
  if (globalAudioContext.state === 'suspended') {
      await globalAudioContext.resume();
  }

  // Gemini usually sends PCM 16-bit LE, single channel
  const float32Data = int16ToFloat32(arrayBuffer);

  const buffer = globalAudioContext.createBuffer(1, float32Data.length, sampleRate);
  buffer.copyToChannel(float32Data as any, 0);

  const source = globalAudioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(globalAudioContext.destination);
  source.start(0);

  return new Promise<void>((resolve) => {
    source.onended = () => {
      source.disconnect();
      resolve();
    };
  });
}