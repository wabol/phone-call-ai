const startBtn = document.getElementById('startBtn');
const output = document.getElementById('output');
const languageSelect = document.getElementById('languageSelect');
const audioPlayer = document.getElementById('audioPlayer');
let recognition;
let socket;
let audioContext, analyser, microphone, vadNode;
let isSpeaking = false;
let isUserSpeaking = false;
let audioQueue = [];

startBtn.addEventListener('click', startConversation);

async function setupVAD() {
    audioContext = new AudioContext();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        
        await audioContext.audioWorklet.addModule('vad-processor.js');
        vadNode = new AudioWorkletNode(audioContext, 'vad-processor', { 
            processorOptions: { 
                vadThreshold: 0.1 // 调高阈值以减少噪音触发
            }
        });

        vadNode.port.onmessage = (event) => {
            if (event.data.type === 'startSpeaking') {
                if (isSpeaking) {
                    isUserSpeaking = true; // 标记用户正在说话
                    audioPlayer.pause();
                    audioQueue = []; // 清空音频队列
                }
                startSpeechRecognition();
            }
        };

        microphone.connect(analyser);
        analyser.connect(vadNode);
        vadNode.connect(audioContext.destination);
    } catch (error) {
        console.error('Error setting up VAD:', error);
    }
}

function startSpeechRecognition() {
    if (recognition && recognition.state !== 'started') {
        recognition.start();
    }
}

document.addEventListener('DOMContentLoaded', setupVAD);

function startConversation() {
    setupVAD();
    try {
        socket = new WebSocket('ws://localhost:8000/ws');
        socket.onmessage = handleServerMessage;
        socket.onerror = handleWebSocketError;
        socket.onclose = handleWebSocketClose;

        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = languageSelect.value;
        recognition.onresult = handleSpeechResult;
        recognition.onend = () => {
            if (!isSpeaking && !isUserSpeaking) {
                recognition.start();
            }
        };
        recognition.onerror = handleSpeechError;
        recognition.start();

        startBtn.disabled = true;
        languageSelect.disabled = true;
    } catch (error) {
        console.error("Error starting conversation:", error);
        output.innerHTML = `<p>Error: ${error.message}</p>`;
    }
}

function handleSpeechResult(event) {
    const last = event.results.length - 1;
    const transcript = event.results[last][0].transcript;

    if (event.results[last].isFinal) {
            sendToServer(transcript);
        }

    output.innerHTML = `<p>You said: ${transcript}</p>`;
    isUserSpeaking = false;
}

function sendToServer(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            text: message,
            lang: languageSelect.value
        }));
    } else {
        console.error("WebSocket is not open");
        output.innerHTML += `<p>Error: WebSocket is not connected</p>`;
    }
}

function handleServerMessage(event) {
    try {
        const response = JSON.parse(event.data);
        console.log("Received response from server:", response.audioUrls);
        output.innerHTML += `<p>AI response: ${response.text}</p>`;
        playAudio(response.audioUrls);
    } catch (error) {
        console.error("Error handling server message:", error);
        output.innerHTML += `<p>Error: ${error.message}</p>`;
    }
}

function playAudio(urls) {
    audioQueue = urls;
    console.log("Audio queue:", audioQueue);
    playNextAudio();
}

function playNextAudio() {
    if (audioQueue.length > 0) {
        const url = audioQueue.shift();
        console.log("Playing audio:", url);
        audioPlayer.src = url;
        audioPlayer.play();
        audioPlayer.onplaying = () => {
            isSpeaking = true;
            recognition.stop();
        };
        audioPlayer.onended = () => {
            isSpeaking = false;
            if (!isUserSpeaking) {
                playNextAudio();
            }
        };
    } else {
        startSpeechRecognition();
    }
}

function handleSpeechError(event) {
    console.error("Speech recognition error:", event.error);
    output.innerHTML += `<p>Speech Error: ${event.error}</p>`;
    restartSpeechRecognition();
}

function handleWebSocketError(event) {
    console.error("WebSocket error:", event);
    output.innerHTML += `<p>WebSocket Error</p>`;
}

function handleWebSocketClose(event) {
    console.log("WebSocket closed:", event);
    output.innerHTML += `<p>WebSocket closed</p>`;
    startBtn.disabled = false;
    languageSelect.disabled = false;
}

function restartSpeechRecognition() {
    if (recognition && !isSpeaking && !isUserSpeaking) {
        recognition.start();
    }
}