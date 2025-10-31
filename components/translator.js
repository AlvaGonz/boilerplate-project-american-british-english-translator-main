const americanOnly = require('./american-only.js');
const americanToBritishSpelling = require('./american-to-british-spelling.js');
const americanToBritishTitles = require("./american-to-british-titles.js")
const britishOnly = require('./british-only.js')

class Translator {
  translate(text, locale) {
    if (!text || !locale) {
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
      
      // Handle spelling differences (reverse the spelling dictionary)
      this.findWordTranslations(text, translations, this.reverseDictionary(americanToBritishSpelling));
    }

    // If no translations were made, return "Everything looks good to me!"
    if (translations.length === 0) {
      return "Everything looks good to me!";
    }

    // Remove overlapping translations (keep the first one found)
    const filteredTranslations = this.removeOverlappingTranslations(translations);

    // Sort translations by index in reverse order to apply from end to start
    // This prevents index shifting when we insert HTML spans
    filteredTranslations.sort((a, b) => b.index - a.index);

    // Build result by applying translations from end to start
    // Build from original text, replacing sections one by one
    let result = text;
    const parts = [];
    let lastIndex = text.length;
    
    // Process translations from end to start
    for (const { original, translated, index } of filteredTranslations) {
      // Add the part after this translation (if any)
      if (index + original.length < lastIndex) {
        parts.unshift({
          text: text.substring(index + original.length, lastIndex),
          isHighlight: false
        });
      }
      
      // Add the highlighted translation
      parts.unshift({
        text: translated,
        isHighlight: true
      });
      
      lastIndex = index;
    }
    
    // Add the part before all translations (if any)
    if (lastIndex > 0) {
      parts.unshift({
        text: text.substring(0, lastIndex),
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

  findTimeTranslations(text, translations, locale) {
    if (locale === 'american-to-british') {
      // Match time format HH:MM (e.g., 10:30, 12:15, 4:30)
      const timeRegex = /\b(\d{1,2}):(\d{2})\b/g;
      let match;
      while ((match = timeRegex.exec(text)) !== null) {
        const original = match[0];
        const britishTime = original.replace(':', '.');
        translations.push({ 
          original: original, 
          translated: britishTime,
          index: match.index
        });
      }
    } else if (locale === 'british-to-american') {
      // Match time format HH.MM (e.g., 10.30, 12.15, 4.30)
      const timeRegex = /\b(\d{1,2})\.(\d{2})\b/g;
      let match;
      while ((match = timeRegex.exec(text)) !== null) {
        const original = match[0];
        const americanTime = original.replace('.', ':');
        translations.push({ 
          original: original, 
          translated: americanTime,
          index: match.index
        });
      }
    }
  }

  findTitleTranslations(text, translations, locale) {
    const titleMap = locale === 'american-to-british' 
      ? americanToBritishTitles 
      : this.reverseDictionary(americanToBritishTitles);

    // Sort by length (longer first) to handle "prof." before "mr."
    const titles = Object.keys(titleMap).sort((a, b) => b.length - a.length);
    const usedIndices = new Set();

    titles.forEach((americanTitle) => {
      const britishTitle = titleMap[americanTitle];
      // Match title followed by a space or end of string, case-insensitive
      const regex = new RegExp(`\\b${this.escapeRegex(americanTitle)}(?=\\s|$)`, 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
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
      }
    });
  }

  findPhraseTranslations(text, translations, dictionary) {
    // Sort phrases by length (longer first) to match multi-word phrases first
    const phrases = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    const usedIndices = new Set();

    phrases.forEach((originalPhrase) => {
      const translatedPhrase = dictionary[originalPhrase];
      const regex = new RegExp(`\\b${this.escapeRegex(originalPhrase)}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const index = match.index;
        // Check if this range overlaps with already used indices
        let overlaps = false;
        for (let i = index; i < index + match[0].length; i++) {
          if (usedIndices.has(i)) {
            overlaps = true;
            break;
          }
        }
        
        if (!overlaps) {
          for (let i = index; i < index + match[0].length; i++) {
            usedIndices.add(i);
          }
          translations.push({
            original: match[0],
            translated: this.preserveCase(match[0], translatedPhrase),
            index: index
          });
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
      const regex = new RegExp(`\\b${this.escapeRegex(originalWord)}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const index = match.index;
        // Check if this range overlaps with already used indices
        let overlaps = false;
        for (let i = index; i < index + match[0].length; i++) {
          if (usedIndices.has(i)) {
            overlaps = true;
            break;
          }
        }
        
        if (!overlaps) {
          for (let i = index; i < index + match[0].length; i++) {
            usedIndices.add(i);
          }
          translations.push({
            original: match[0],
            translated: this.preserveCase(match[0], translatedWord),
            index: index
          });
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