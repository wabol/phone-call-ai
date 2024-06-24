class VADProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.isSpeaking = false;
    }
  
    process(inputs, outputs, parameters) {
      const input = inputs[0];
      if (!input || !input.length) return true;
  
      const channel = input[0];
      let sum = 0;
      for (let i = 0; i < channel.length; i++) {
        sum += Math.abs(channel[i]);
      }
      const average = sum / channel.length;
  
      if (average > 0.01) { // 阈值，需要根据实际情况调整
        if (!this.isSpeaking) {
          this.port.postMessage({ type: 'startSpeaking' });
        }
        this.isSpeaking = true;
      } else {
        if (this.isSpeaking) {
          this.port.postMessage({ type: 'stopSpeaking' });
        }
        this.isSpeaking = false;
      }
  
      return true;
    }
  }
  
  registerProcessor('vad-processor', VADProcessor);