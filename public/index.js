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
  if (!textArea.value.trim()) {
    errorArea.innerText = "Please enter some text to translate.";
    errorArea.style.display = "block";
    return;
  }
  
  // Disable button during request
  translateBtn.disabled = true;
  translateBtn.style.opacity = "0.6";
  translateBtn.style.cursor = "not-allowed";
  
  // Show loading state
  translatedArea.innerHTML = '<span style="color: #666;">Translating...</span>';
  translatedArea.style.opacity = "1";

  // Activate cable pulse animation
  const cableConnection = document.querySelector('.cable-connection');
  if (cableConnection) {
    cableConnection.classList.add('active');
  }

  let translationSuccess = false;
  try {
    const data = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-type": "application/json"
      },
      body: JSON.stringify({
        "text": textArea.value, 
        "locale": localeArea.value
      })
    });

    const parsed = await data.json();
    
    if (parsed.error) {
      errorArea.innerText = parsed.error;
      errorArea.style.display = "block";
      translatedArea.innerHTML = "";
      translatedArea.style.opacity = "0";
    } else {
      translatedArea.innerHTML = parsed.translation || "Everything looks good to me!";
      translatedArea.style.opacity = "1";
      errorArea.style.display = "none";
      translationSuccess = true;
      
      // Smooth scroll to result
      setTimeout(() => {
        document.getElementById("solution-container").scrollIntoView({ 
          behavior: "smooth", 
          block: "nearest" 
        });
      }, 100);
    }
  } catch (error) {
    errorArea.innerText = "An error occurred. Please try again.";
    errorArea.style.display = "block";
    translatedArea.innerHTML = "";
    translatedArea.style.opacity = "0";
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
document.getElementById("text-input").addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    translateHandler();
  }
});

// Initialize event listener
document.getElementById("translate-btn").addEventListener("click", translateHandler);
