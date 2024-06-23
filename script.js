const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const languageSelect = document.getElementById('language');
const output = document.getElementById('output');
const openaiOutput = document.getElementById('openai-output');

let apiKey = '';
let conversation = [];
let recognition;
let isSpeaking = false;
let synth = window.speechSynthesis;
let audioContext;
let analyser;
let microphone;
const VOLUME_THRESHOLD = 0.05; // 音量阈值，可以根据需要调整
let lastInterruptTime = 0;
const INTERRUPT_COOLDOWN = 1000; // 1秒冷却时间

document.addEventListener('DOMContentLoaded', () => {
    fetch('config.json')
        .then(response => response.json())
        .then(config => {
            apiKey = config.apiKey;
        })
        .catch(error => {
            console.error('Error loading config:', error);
        });

    initializeSpeechRecognition();
    initializeAudioContext();

    startButton.addEventListener('click', () => {
        const selectedLanguage = languageSelect.value;
        recognition.lang = selectedLanguage;
        console.log(`Language set to: ${selectedLanguage}`);
        recognition.start();
        console.log('Recognition started');
    });

    stopButton.addEventListener('click', () => {
        if (recognition) {
            recognition.stop();
            console.log('Recognition stopped');
        }
    });
});

function initializeSpeechRecognition() {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
                handleSpeechInput(finalTranscript);
            } else {
                interimTranscript += event.results[i][0].transcript;
                if (isSpeaking && interimTranscript.length > 2) {
                    handleSpeechInput(interimTranscript);
                }
            }
        }

        output.innerHTML = `<p><strong>Interim:</strong> ${interimTranscript}</p><p><strong>Final:</strong> ${finalTranscript}</p>`;
    };

    recognition.onerror = (event) => {
        console.error(event.error);
        output.innerHTML += `<p><strong>Error:</strong> ${event.error}</p>`;
    };

    recognition.onstart = () => {
        console.log('Speech recognition service has started');
        output.innerHTML += `<p><strong>Status:</strong> Started</p>`;
    };

    recognition.onend = () => {
        console.log('Speech recognition service disconnected');
        output.innerHTML += `<p><strong>Status:</strong> Stopped</p>`;
        if (!isSpeaking) {
            recognition.start();
        }
    };
}

function initializeAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            checkAudioLevel();
        })
        .catch(err => {
            console.error('Error accessing microphone:', err);
        });
}

function checkAudioLevel() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function check() {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
        const normalizedVolume = average / 256; // 将音量标准化到0-1范围
        
        if (isSpeaking && normalizedVolume > VOLUME_THRESHOLD) {
            handleSpeechInput('');
        }
        
        requestAnimationFrame(check);
    }
    
    check();
}

function handleSpeechInput(input) {
    if (isSpeaking) {
        console.log('Interrupting current speech output');
        synth.cancel();
        isSpeaking = false;
        if (input) {
            sendToOpenAI(input);
        }
    } else if (input) {
        sendToOpenAI(input);
    }
}

async function sendToOpenAI(text) {
    const url = 'https://api.openai.com/v1/chat/completions';
    openaiOutput.innerHTML += `<p><strong>Sending to OpenAI:</strong> ${text}</p>`;

    conversation.push({ "role": "user", "content": text });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    { "role": "system", "content": "You are a helpful assistant." },
                    ...conversation
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('OpenAI response:', data);
        const responseText = data.choices[0].message.content;
        openaiOutput.innerHTML += `<p><strong>OpenAI:</strong> ${responseText}</p>`;
        conversation.push({ "role": "assistant", "content": responseText });
        speakText(responseText);
    } catch (error) {
        console.error('Error:', error);
        openaiOutput.innerHTML += `<p><strong>Error:</strong> ${error.message}</p>`;
    }
}

function speakText(text) {
    if (isSpeaking) {
        synth.cancel();
    }
    const utterThis = new SpeechSynthesisUtterance(text);
    utterThis.lang = languageSelect.value;

    utterThis.onstart = () => {
        isSpeaking = true;
        if (recognition) {
            recognition.stop();
        }
    };

    utterThis.onend = () => {
        isSpeaking = false;
        if (recognition) {
            recognition.start();
        }
    };

    synth.speak(utterThis);
}