const translateHandler = async () => {
  const textArea = document.getElementById("text-input");
  const localeArea = document.getElementById("locale-select");
  const errorArea = document.getElementById("error-msg");
  const translatedArea = document.getElementById("translated-sentence");
  const translateBtn = document.getElementById("translate-btn");
  
  // Clear previous results
  errorArea.innerText = "";
  errorArea.style.display = "none";
  translatedArea.innerText = "";
  translatedArea.style.opacity = "0";
  
  // Validate input
  const inputText = textArea.value.trim();
  if (!inputText) {
    errorArea.innerText = "Please enter some text to translate.";
    errorArea.style.display = "block";
    return;
  }

  // Validate input length (DoS protection on client side)
  const MAX_TEXT_LENGTH = 10000;
  if (inputText.length > MAX_TEXT_LENGTH) {
    errorArea.innerText = `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters.`;
    errorArea.style.display = "block";
    return;
  }
  
  // Disable button during request
  translateBtn.disabled = true;
  translateBtn.style.opacity = "0.6";
  translateBtn.style.cursor = "not-allowed";
  
  // Show loading state (safe HTML)
  translatedArea.textContent = "Translating...";
  translatedArea.style.opacity = "1";

  // Activate cable pulse animation
  const cableConnection = document.querySelector('.cable-connection');
  if (cableConnection) {
    cableConnection.classList.add('active');
  }

  let translationSuccess = false;
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-type": "application/json"
      },
      body: JSON.stringify({
        "text": inputText, 
        "locale": localeArea.value
      })
    });

    // Check if response is ok
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const parsed = await response.json();
    
    if (parsed.error) {
      errorArea.textContent = parsed.error;
      errorArea.style.display = "block";
      translatedArea.textContent = "";
      translatedArea.style.opacity = "0";
    } else if (parsed.translation) {
      // Use innerHTML since the translation already contains sanitized HTML from the server
      // The server-side translator already sanitizes the content
      translatedArea.innerHTML = parsed.translation;
      translatedArea.style.opacity = "1";
      errorArea.style.display = "none";
      translationSuccess = true;
      
      // Smooth scroll to result
      setTimeout(() => {
        const solutionContainer = document.getElementById("solution-container");
        if (solutionContainer) {
          solutionContainer.scrollIntoView({ 
            behavior: "smooth", 
            block: "nearest" 
          });
        }
      }, 100);
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    // Differentiate error types
    let errorMessage = "An error occurred. Please try again.";
    
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = "Network error. Please check your connection.";
    } else if (error.message.includes('HTTP error')) {
      errorMessage = "Server error. Please try again later.";
    }
    
    errorArea.textContent = errorMessage;
    errorArea.style.display = "block";
    translatedArea.textContent = "";
    translatedArea.style.opacity = "0";
    console.error('Translation error:', error);
  } finally {
    // Re-enable button
    translateBtn.disabled = false;
    translateBtn.style.opacity = "1";
    translateBtn.style.cursor = "pointer";
    
    // Keep cable active for a moment after successful translation, then fade it
    if (cableConnection && translationSuccess) {
      setTimeout(() => {
        cableConnection.classList.remove('active');
      }, 3000);
    } else if (cableConnection) {
      // Remove immediately on error
      cableConnection.classList.remove('active');
    }
  }
};

// Add Enter key support for textarea (Ctrl+Enter to translate)
const textInput = document.getElementById("text-input");
if (textInput) {
  textInput.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      translateHandler();
    }
  });
}

// Initialize event listener
const translateBtn = document.getElementById("translate-btn");
if (translateBtn) {
  translateBtn.addEventListener("click", translateHandler);
}
