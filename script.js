const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const languageSelect = document.getElementById('language');
const output = document.getElementById('output');
const openaiOutput = document.getElementById('openai-output');

let apiKey = '';
let conversation = []; // Used to store the conversation context
let recognition; // Defined in the global scope
let isSpeaking = false; // Whether the system is currently speaking
let interimTranscriptBuffer = ''; // Buffer to store interim results
let synth = window.speechSynthesis; // Speech synthesis instance

// Ensure the script runs after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    fetch('config.json')
        .then(response => response.json())
        .then(config => {
            apiKey = config.apiKey;
        })
        .catch(error => {
            console.error('Error loading config:', error);
        });

    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.interimResults = true;
    recognition.continuous = true;

    let finalTranscript = '';

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
                if (isSpeaking) {
                    interimTranscriptBuffer += finalTranscript;
                } else {
                    sendToOpenAI(finalTranscript); // Send in segments
                }
                finalTranscript = ''; // Clear the sent text
            } else {
                interimTranscript += event.results[i][0].transcript;
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
        if (!isSpeaking && interimTranscriptBuffer !== '') {
            let bufferContent = interimTranscriptBuffer;
            interimTranscriptBuffer = '';
            sendToOpenAI(bufferContent); // Process buffered input
        }
        // Restart recognition to ensure continuous recognition
        if (!isSpeaking && recognition) {
            recognition.start();
        }
    };

    startButton.addEventListener('click', () => {
        const selectedLanguage = languageSelect.value;
        recognition.lang = selectedLanguage; // Set language
        console.log(`Language set to: ${selectedLanguage}`);
        recognition.start();
        console.log('Recognition started');
    });

    stopButton.addEventListener('click', () => {
        if (recognition) {
            recognition.stop();
            recognition = null;
            console.log('Recognition stopped');
        }
    });
});

async function sendToOpenAI(text) {
    const url = 'https://api.openai.com/v1/chat/completions';
    openaiOutput.innerHTML += `<p><strong>Sending to OpenAI:</strong> ${text}</p>`; // Display the sent text

    conversation.push({ "role": "user", "content": text }); // Add user's input to the conversation

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
                    ...conversation // Pass the complete conversation context
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
        conversation.push({ "role": "assistant", "content": responseText }); // Add assistant's response to the conversation
        speakText(responseText);  // Convert the response to speech
    } catch (error) {
        console.error('Error:', error);
        openaiOutput.innerHTML += `<p><strong>Error:</strong> ${error.message}</p>`;
    }
}

function speakText(text) {
    if (isSpeaking) {
        synth.cancel(); // Cancel current speech output
    }
    const utterThis = new SpeechSynthesisUtterance(text);
    utterThis.lang = languageSelect.value;  // Set language
    utterThis.onstart = () => {
        isSpeaking = true; // Start speech output
        if (recognition) {
            recognition.stop(); // Pause speech recognition to avoid recognizing its own speech
        }
    };
    utterThis.onend = () => {
        isSpeaking = false; // End speech output
        if (recognition) {
            recognition.start(); // Restart speech recognition
        }
        if (interimTranscriptBuffer !== '') {
            let bufferContent = interimTranscriptBuffer;
            interimTranscriptBuffer = '';
            sendToOpenAI(bufferContent); // Process buffered input
        }
    };
    synth.speak(utterThis);
}

// Cancel speech output and process new input
function cancelSpeechAndProcessInput(input) {
    if (isSpeaking) {
        synth.cancel(); // Cancel current speech output
        isSpeaking = false;
        interimTranscriptBuffer += input; // Append new input to the buffer
        let bufferContent = interimTranscriptBuffer;
        interimTranscriptBuffer = '';
        sendToOpenAI(bufferContent); // Process buffered input
    } else {
        sendToOpenAI(input); // Process input directly if no speech output is happening
    }
}

// Ensure speech recognition restarts after speech ends
recognition.onspeechend = () => {
    console.log('Speech end detected, restarting recognition');
    recognition.start(); // Restart speech recognition immediately
};
