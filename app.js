const startBtn = document.getElementById('startBtn');
const output = document.getElementById('output');
const languageSelect = document.getElementById('languageSelect');
let recognition;
let socket;
let audioContext, analyser, microphone, vadNode;
let synthesis = window.speechSynthesis;
let isSpeaking = false;

startBtn.addEventListener('click', startConversation);

async function setupVAD() {
    audioContext = new AudioContext();
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        
        await audioContext.audioWorklet.addModule('vad-processor.js');
        vadNode = new AudioWorkletNode(audioContext, 'vad-processor');

        vadNode.port.onmessage = (event) => {
            if (event.data.type === 'startSpeaking') {
                if (isSpeaking) {
                    synthesis.cancel(); // 如果AI正在说话，停止它
                } else {
                    startSpeechRecognition();
                }
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
    if (recognition) {
        recognition.start();
    }
}

document.addEventListener('DOMContentLoaded', setupVAD);

function speak(text, lang) {
    if (synthesis.speaking) {
        synthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.onstart = () => { 
        isSpeaking = true;
        recognition.stop(); // 在AI开始说话时停止语音识别
    };
    utterance.onend = () => { 
        isSpeaking = false;
        startSpeechRecognition(); // 在AI停止说话后重新启动语音识别
    };
    synthesis.speak(utterance);
}

function startConversation() {
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
        recognition.onend = restartSpeechRecognition;
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
        if (isSpeaking) {
            synthesis.cancel(); // 停止AI的语音输出
            sendToServer("用户打断：" + transcript);
        } else {
            sendToServer(transcript);
        }
    }

    output.innerHTML = `<p>You said: ${transcript}</p>`;
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
        output.innerHTML += `<p>AI response: ${response.text}</p>`;
        speak(response.text, languageSelect.value);
    } catch (error) {
        console.error("Error handling server message:", error);
        output.innerHTML += `<p>Error: ${error.message}</p>`;
    }
}

function restartSpeechRecognition() {
    if (recognition && !isSpeaking) { // 仅当AI不在说话时重新启动语音识别
        recognition.start();
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