const americanOnly = require('./american-only.js');
const americanToBritishSpelling = require('./american-to-british-spelling.js');
const americanToBritishTitles = require("./american-to-british-titles.js")
const britishOnly = require('./british-only.js')

// Static function to reverse dictionary (called once at module load)
function reverseDictionaryStatic(dict) {
  const reversed = {};
  Object.keys(dict).forEach(key => {
    reversed[dict[key]] = key;
  });
  return reversed;
}

// Pre-calculate reversed dictionary for performance (execute once, not per request)
const britishToAmericanSpelling = reverseDictionaryStatic(americanToBritishSpelling);
const britishToAmericanTitles = reverseDictionaryStatic(americanToBritishTitles);

class Translator {
  constructor() {
    // Maximum text length to prevent DoS attacks (10,000 characters)
    this.MAX_TEXT_LENGTH = 10000;
    
    // Maximum regex iterations to prevent ReDoS
    this.MAX_REGEX_ITERATIONS = 1000;
  }

  translate(text, locale) {
    if (!text || !locale) {
      return null;
    }

    // Validate input type
    if (typeof text !== 'string' || typeof locale !== 'string') {
      return null;
    }

    // Validate text length to prevent DoS
    if (text.length > this.MAX_TEXT_LENGTH) {
      return null;
    }

    const translations = []; // Array of {original, translated, index}

    if (locale === 'american-to-british') {
      // Handle time format (10:30 -> 10.30)
      this.findTimeTranslations(text, translations, 'american-to-british');
      
      // Handle titles (Dr. -> Dr, Mr. -> Mr, etc.)
      this.findTitleTranslations(text, translations, 'american-to-british');
      
      // Handle phrases/terms from american-only.js
      this.findPhraseTranslations(text, translations, americanOnly);
      
      // Handle spelling differences
      this.findWordTranslations(text, translations, americanToBritishSpelling);
      
    } else if (locale === 'british-to-american') {
      // Handle time format (10.30 -> 10:30)
      this.findTimeTranslations(text, translations, 'british-to-american');
      
      // Handle titles (Dr -> Dr., Mr -> Mr., etc.)
      this.findTitleTranslations(text, translations, 'british-to-american');
      
      // Handle phrases/terms from british-only.js
      this.findPhraseTranslations(text, translations, britishOnly);
      
      // Handle spelling differences (use pre-calculated reversed dictionary)
      this.findWordTranslations(text, translations, britishToAmericanSpelling);
    }

    // If no translations were made, return "Everything looks good to me!"
    if (translations.length === 0) {
      return "Everything looks good to me!";
    }

    // Remove overlapping translations (keep the first one found)
    const filteredTranslations = this.removeOverlappingTranslations(translations);
    
    // If all translations were filtered out, return the message
    if (filteredTranslations.length === 0) {
      return "Everything looks good to me!";
    }

    // Sort translations by index in reverse order to apply from end to start
    // This prevents index shifting when we insert HTML spans
    filteredTranslations.sort((a, b) => b.index - a.index);

    // Build result by applying translations from end to start
    // Build from original text, replacing sections one by one
    const parts = [];
    let lastIndex = text.length;
    
    // Process translations from end to start
    for (const { original, translated, index } of filteredTranslations) {
      // Add the part after this translation (if any)
      // Sanitize user input text to prevent XSS
      if (index + original.length < lastIndex) {
        parts.unshift({
          text: this.sanitizeHTML(text.substring(index + original.length, lastIndex)),
          isHighlight: false
        });
      }
      
      // Add the highlighted translation (text content is already safe from dictionaries)
      // Only sanitize if somehow external content got through
      parts.unshift({
        text: this.sanitizeHTML(translated),
        isHighlight: true
      });
      
      lastIndex = index;
    }
    
    // Add the part before all translations (if any)
    // Sanitize user input text to prevent XSS
    if (lastIndex > 0) {
      parts.unshift({
        text: this.sanitizeHTML(text.substring(0, lastIndex)),
        isHighlight: false
      });
    }
    
    // Build final result
    return parts.map(part => {
      if (part.isHighlight) {
        return `<span class="highlight">${part.text}</span>`;
      }
      return part.text;
    }).join('');
  }

  // Sanitize HTML to prevent XSS attacks
  // Only escape characters that are dangerous when inserted into HTML body
  // We don't need to escape quotes since we're using them in attributes already
  sanitizeHTML(str) {
    if (typeof str !== 'string') return '';
    
    // Escape in order: & must be first, then < and >
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Note: We don't escape quotes (", ') because they're safe in HTML body text
    // Only dangerous in attribute values, but we're using them in tag attributes which already have quotes
  }

  findTimeTranslations(text, translations, locale) {
    if (locale === 'american-to-british') {
      // Match time format HH:MM (e.g., 10:30, 12:15, 4:30)
      const timeRegex = /\b(\d{1,2}):(\d{2})\b/g;
      let match;
      let iterations = 0;
      
      while ((match = timeRegex.exec(text)) !== null && iterations < this.MAX_REGEX_ITERATIONS) {
        iterations++;
        const original = match[0];
        const britishTime = original.replace(':', '.');
        translations.push({ 
          original: original, 
          translated: britishTime,
          index: match.index
        });
        
        // Prevent infinite loop if regex doesn't advance
        if (match.index === timeRegex.lastIndex && iterations > 1) {
          break;
        }
      }
    } else if (locale === 'british-to-american') {
      // Match time format HH.MM (e.g., 10.30, 12.15, 4.30)
      const timeRegex = /\b(\d{1,2})\.(\d{2})\b/g;
      let match;
      let iterations = 0;
      
      while ((match = timeRegex.exec(text)) !== null && iterations < this.MAX_REGEX_ITERATIONS) {
        iterations++;
        const original = match[0];
        const americanTime = original.replace('.', ':');
        translations.push({ 
          original: original, 
          translated: americanTime,
          index: match.index
        });
        
        // Prevent infinite loop if regex doesn't advance
        if (match.index === timeRegex.lastIndex && iterations > 1) {
          break;
        }
      }
    }
  }

  findTitleTranslations(text, translations, locale) {
    const titleMap = locale === 'american-to-british' 
      ? americanToBritishTitles 
      : britishToAmericanTitles;

    // Sort by length (longer first) to handle "prof." before "mr."
    const titles = Object.keys(titleMap).sort((a, b) => b.length - a.length);
    const usedIndices = new Set();

    titles.forEach((americanTitle) => {
      const britishTitle = titleMap[americanTitle];
      // Match title followed by a space or end of string, case-insensitive
      const regexPattern = `\\b${this.escapeRegex(americanTitle)}(?=\\s|$)`;
      
      // Use matchAll for cleaner iteration
      try {
        const regex = new RegExp(regexPattern, 'gi');
        const matches = [...text.matchAll(regex)];
        
        matches.forEach(match => {
          const index = match.index;
          // Check if this index is already used
          if (!usedIndices.has(index)) {
            usedIndices.add(index);
            translations.push({
              original: match[0],
              translated: this.preserveCase(match[0], britishTitle),
              index: index
            });
          }
        });
      } catch (e) {
        // Fallback: use manual search with safety checks
        let searchIndex = 0;
        let iterations = 0;
        
        while (searchIndex < text.length && iterations < this.MAX_REGEX_ITERATIONS) {
          iterations++;
          const regex = new RegExp(regexPattern, 'gi');
          regex.lastIndex = searchIndex;
          const match = regex.exec(text);
          
          if (!match) break;
          
          // Prevent infinite loop if regex doesn't advance
          if (match.index === searchIndex && searchIndex > 0) {
            break;
          }
          
          const index = match.index;
          if (!usedIndices.has(index)) {
            usedIndices.add(index);
            translations.push({
              original: match[0],
              translated: this.preserveCase(match[0], britishTitle),
              index: index
            });
          }
          
          searchIndex = match.index + match[0].length;
          if (searchIndex <= match.index) {
            searchIndex = match.index + 1;
          }
        }
      }
    });
  }

  findPhraseTranslations(text, translations, dictionary) {
    // Sort phrases by length (longer first) to match multi-word phrases first
    const phrases = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    const usedIndices = new Set();

    phrases.forEach((originalPhrase) => {
      const translatedPhrase = dictionary[originalPhrase];
      // Create regex pattern
      const regexPattern = `\\b${this.escapeRegex(originalPhrase)}\\b`;
      
      // Use matchAll for cleaner iteration (Node 12+)
      try {
        const regex = new RegExp(regexPattern, 'gi');
        const matches = [...text.matchAll(regex)];
        
        matches.forEach(match => {
          const index = match.index;
          const matchedText = match[0];
          
          // Check if this range overlaps with already used indices
          let overlaps = false;
          for (let i = index; i < index + matchedText.length; i++) {
            if (usedIndices.has(i)) {
              overlaps = true;
              break;
            }
          }
          
          if (!overlaps) {
            for (let i = index; i < index + matchedText.length; i++) {
              usedIndices.add(i);
            }
            translations.push({
              original: matchedText,
              translated: this.preserveCase(matchedText, translatedPhrase),
              index: index
            });
          }
        });
      } catch (e) {
        // Fallback for older Node versions
        let searchIndex = 0;
        let iterations = 0;
        
        while (searchIndex < text.length && iterations < this.MAX_REGEX_ITERATIONS) {
          iterations++;
          const regex = new RegExp(regexPattern, 'gi');
          regex.lastIndex = searchIndex;
          const match = regex.exec(text);
          
          if (!match) break;
          
          // Prevent infinite loop
          if (match.index === searchIndex && searchIndex > 0) {
            break;
          }
          
          const index = match.index;
          const matchedText = match[0];
          
          let overlaps = false;
          for (let i = index; i < index + matchedText.length; i++) {
            if (usedIndices.has(i)) {
              overlaps = true;
              break;
            }
          }
          
          if (!overlaps) {
            for (let i = index; i < index + matchedText.length; i++) {
              usedIndices.add(i);
            }
            translations.push({
              original: matchedText,
              translated: this.preserveCase(matchedText, translatedPhrase),
              index: index
            });
          }
          
          searchIndex = index + matchedText.length;
          if (searchIndex <= index) {
            searchIndex = index + 1;
          }
        }
      }
    });
  }

  findWordTranslations(text, translations, dictionary) {
    // Sort words by length (longer first) to match longer words first
    const words = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    const usedIndices = new Set();

    words.forEach((originalWord) => {
      const translatedWord = dictionary[originalWord];
      // Create regex pattern
      const regexPattern = `\\b${this.escapeRegex(originalWord)}\\b`;
      
      // Use matchAll for cleaner iteration (Node 12+)
      try {
        const regex = new RegExp(regexPattern, 'gi');
        const matches = [...text.matchAll(regex)];
        
        matches.forEach(match => {
          const index = match.index;
          const matchedText = match[0];
          
          // Check if this range overlaps with already used indices
          let overlaps = false;
          for (let i = index; i < index + matchedText.length; i++) {
            if (usedIndices.has(i)) {
              overlaps = true;
              break;
            }
          }
          
          if (!overlaps) {
            for (let i = index; i < index + matchedText.length; i++) {
              usedIndices.add(i);
            }
            translations.push({
              original: matchedText,
              translated: this.preserveCase(matchedText, translatedWord),
              index: index
            });
          }
        });
      } catch (e) {
        // Fallback for older Node versions
        let searchIndex = 0;
        let iterations = 0;
        
        while (searchIndex < text.length && iterations < this.MAX_REGEX_ITERATIONS) {
          iterations++;
          const regex = new RegExp(regexPattern, 'gi');
          regex.lastIndex = searchIndex;
          const match = regex.exec(text);
          
          if (!match) break;
          
          // Prevent infinite loop
          if (match.index === searchIndex && searchIndex > 0) {
            break;
          }
          
          const index = match.index;
          const matchedText = match[0];
          
          let overlaps = false;
          for (let i = index; i < index + matchedText.length; i++) {
            if (usedIndices.has(i)) {
              overlaps = true;
              break;
            }
          }
          
          if (!overlaps) {
            for (let i = index; i < index + matchedText.length; i++) {
              usedIndices.add(i);
            }
            translations.push({
              original: matchedText,
              translated: this.preserveCase(matchedText, translatedWord),
              index: index
            });
          }
          
          searchIndex = index + matchedText.length;
          if (searchIndex <= index) {
            searchIndex = index + 1;
          }
        }
      }
    });
  }

  removeOverlappingTranslations(translations) {
    // Sort by index to process in order
    const sorted = [...translations].sort((a, b) => a.index - b.index);
    const filtered = [];
    
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      let overlaps = false;
      
      // Check if this translation overlaps with any already added translation
      for (const added of filtered) {
        const currentStart = current.index;
        const currentEnd = current.index + current.original.length;
        const addedStart = added.index;
        const addedEnd = added.index + added.original.length;
        
        // Check if ranges overlap (they overlap if one starts before the other ends)
        if (!(currentEnd <= addedStart || currentStart >= addedEnd)) {
          overlaps = true;
          break;
        }
      }
      
      if (!overlaps) {
        filtered.push(current);
      }
    }
    
    return filtered;
  }

  preserveCase(original, replacement) {
    // Handle multi-word phrases - preserve case of each word independently
    if (original.includes(' ') || replacement.includes(' ')) {
      const originalWords = original.split(' ');
      const replacementWords = replacement.split(' ');
      
      if (originalWords.length === replacementWords.length) {
        return replacementWords.map((replWord, i) => {
          const origWord = originalWords[i];
          if (!origWord || !replWord) return replWord;
          
          // If original word is all uppercase
          if (origWord === origWord.toUpperCase()) {
            return replWord.toUpperCase();
          }
          // If original word starts with uppercase letter
          const firstChar = origWord.charAt(0);
          if (firstChar && firstChar.toUpperCase() === firstChar && firstChar.toLowerCase() !== firstChar) {
            return replWord.charAt(0).toUpperCase() + replWord.slice(1).toLowerCase();
          }
          // Otherwise lowercase
          return replWord.toLowerCase();
        }).join(' ');
      }
      
      // If word counts don't match, preserve case of first character only
      const firstChar = original.charAt(0);
      if (firstChar && firstChar.toUpperCase() === firstChar && firstChar.toLowerCase() !== firstChar) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
      }
      return replacement.toLowerCase();
    }
    
    // Handle single words
    if (original === original.toUpperCase()) {
      return replacement.toUpperCase();
    }
    
    const firstChar = original.charAt(0);
    if (firstChar && firstChar.toUpperCase() === firstChar && firstChar.toLowerCase() !== firstChar) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    
    return replacement.toLowerCase();
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  reverseDictionary(dict) {
    const reversed = {};
    Object.keys(dict).forEach(key => {
      reversed[dict[key]] = key;
    });
    return reversed;
  }
}

module.exports = Translator;
