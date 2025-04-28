function playSparkle() {
  document.getElementById("sparkle-audio").play();
}
let chatOpen = false;
let voiceEnabled = false;
let userEmail = "";

function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  const btn = document.getElementById("voiceToggle");
  if (btn) {
    btn.innerText = voiceEnabled ? "🔈" : "🔇";
  }
}

function speakResponse(text) {
  if (voiceEnabled && 'speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = speechSynthesis.getVoices().find(v => v.lang.startsWith("en"));
    utterance.rate = 1;
    speechSynthesis.speak(utterance);
  }
}


// Toggle chatbot open/close

function toggleChat() {
  const box = document.getElementById("chatbot-container");
  const bar = document.getElementById("chatbot-bar");

  if (box.style.display === "flex") {
    box.style.display = "none";
    if (bar) bar.style.display = "block";
    chatOpen = false;
  } else {
    box.style.display = "flex";
    if (bar) bar.style.display = "none";
    chatOpen = true;
  }
}

function closeChat() {
  document.getElementById("chatbot-container").style.display = "none";
}

function minimizeChat() {
  const chatArea = document.getElementById("chatArea");
  const inputRow = document.querySelector(".input-row");
  const loginArea = document.getElementById("loginArea");

  // Toggle visibility
  [chatArea, inputRow, loginArea].forEach(el => {
    if (el) el.style.display = (el.style.display === "none") ? "block" : "none";
  });
}



// Show chat interface after login
function showChatUI() {
  document.getElementById("loginArea").style.display = "none";
  document.getElementById("chatArea").style.display = "block";
  document.querySelector(".input-row").style.display = "flex";
}

// Append message bubble
function appendMessage(sender, text, isTyping = false, allowFeedback = false) {
  const chatArea = document.getElementById("chatArea");

  const bubble = document.createElement("div");
  bubble.className = sender === "user" ? "user-bubble" : "bot-bubble";
  if (isTyping) bubble.classList.add("typing");
  bubble.innerText = text;

  chatArea.appendChild(bubble);

  // Play Campy response sound if it's not a typing indicator
  if (sender === "bot" && !isTyping) {
    const responseSound = document.getElementById("campy-response");
    if (responseSound) {
      responseSound.currentTime = 0;
      responseSound.play().catch(() => {});
    }
  }

  // Show feedback buttons if flagged
  if (sender === "bot" && allowFeedback) {
    const feedbackDiv = document.createElement("div");
    feedbackDiv.className = "feedback-buttons";
    feedbackDiv.innerHTML = `
      <button onclick="submitFeedback('👍')" title="Helpful">👍</button>
      <button onclick="submitFeedback('👎')" title="Not helpful">👎</button>
    `;
    chatArea.appendChild(feedbackDiv);
  }
if (sender === "bot" && !isTyping) {
  speakResponse(text);
}

  chatArea.scrollTop = chatArea.scrollHeight;
}


// Load Chat History
async function loadChatHistory() {
  const chatArea = document.getElementById("chatArea");
  chatArea.innerHTML = "";

  const response = await fetch(`/history-data?email=${encodeURIComponent(userEmail)}`);
  const history = await response.json();

  if (!history.length) {
    appendMessage("bot", "No previous chat history found.");
    return;
  }

  for (const item of history) {
    appendMessage(item.sender, item.message);
  }
}

// Send Message Function
async function sendMessage() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  input.value = "";

  appendMessage("bot", "Campy is typing...", true);

  const response = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      message: message, 
      email: userEmail 
    }),
});


  const data = await response.json();

  const chatArea = document.getElementById("chatArea");
  const typingBubble = document.querySelector(".typing");
  if (typingBubble) chatArea.removeChild(typingBubble);

  // Don't show feedback if it's a greeting
const greetingResponses = [
  "Hi", "Hello", "Hey", "How are you", "Hi Hiruni!", 
  "You're now logged in", "Campy is typing...", 
];

const isGreeting = greetingResponses.some(gr => data.response.includes(gr));
appendMessage("bot", data.response, false, !isGreeting);

}

// Submit Login Form
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nameField = document.getElementById('name');
  const emailField = document.getElementById('email');
  const contactField = document.getElementById('contact');
  const nameError = document.getElementById('name-error');
  const emailError = document.getElementById('email-error');
  const contactError = document.getElementById('contact-error');

  [nameField, emailField, contactField].forEach(f => f.style.border = '');
  [nameError, emailError, contactError].forEach(e => e.innerText = '');

  const name = nameField.value.trim();
  const email = emailField.value.trim();
  const contact = contactField.value.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactPattern = /^\d{10,}$/; // Minimum 10 digits, only numbers

if (!name || name.length < 2) {
    nameField.style.border = "2px solid red";
    nameError.innerText = "Please enter at least 2 characters.";
    nameField.focus();
    return;
}

if (!emailPattern.test(email)) {
    emailField.style.border = "2px solid red";
    emailError.innerText = "Please enter a valid email address.";
    emailField.focus();
    return;
}

if (!contactPattern.test(contact)) {
    contactField.style.border = "2px solid red";
    contactError.innerText = "Enter a valid contact number (at least 10 digits).";
    contactField.focus();
    return;
}

  const response = await fetch("/login", {
    method: "POST",
    body: JSON.stringify({ name, email, contact }),
    headers: { "Content-Type": "application/json" },
  });

  const data = await response.json();

  if (data.status === "success") {
	  userEmail = email; // Save the logged-in email globally
    showChatUI();
	chatOpen = true;
    document.getElementById("chatInput").disabled = false;
    document.getElementById("chatInput").placeholder = "Ask me anything about IIT...";
    document.getElementById("usernameDisplay").innerText = data.name;
    appendMessage("bot", `Hi ${data.name}! You're now logged in. How can I help you today?`);
  } else {
    alert("Login failed. Please try again.");
  }
});

// Enter key to send message
document.getElementById("chatInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

function submitFeedback(feedback) {
  const feedbackDiv = document.querySelector('.feedback-buttons');
  if (feedbackDiv) {
    const thankYou = document.createElement('div');
    thankYou.className = 'feedback-thanks';
    thankYou.innerText = `Thanks for your feedback: ${feedback}`;
    feedbackDiv.appendChild(thankYou);
    
    // Disable both thumbs after clicking
    feedbackDiv.querySelectorAll('button').forEach(btn => btn.disabled = true);
  }
}

