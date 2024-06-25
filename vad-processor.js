class VADProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.isSpeaking = false;
      this.vadThreshold = options.processorOptions.vadThreshold || 0.01; // 需要根据实际情况调整阈值
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

      if (average > this.vadThreshold) { // 使用传递的阈值
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