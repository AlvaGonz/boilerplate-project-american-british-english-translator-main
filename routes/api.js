'use strict';

const Translator = require('../components/translator.js');

module.exports = function (app) {
  
  const translator = new Translator();

  app.route('/api/translate')
    .post((req, res) => {
      const { text, locale } = req.body;

      // Check if required fields are missing
      if (text === undefined || locale === undefined) {
        return res.json({ error: 'Required field(s) missing' });
      }

      // Validate input types
      if (typeof text !== 'string' || typeof locale !== 'string') {
        return res.json({ error: 'Invalid input type. Text and locale must be strings.' });
      }

      // Check if text is empty
      if (text.trim() === '') {
        return res.json({ error: 'No text to translate' });
      }

      // Validate text length (DoS protection)
      const MAX_TEXT_LENGTH = 10000;
      if (text.length > MAX_TEXT_LENGTH) {
        return res.json({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` });
      }

      // Check if locale is valid
      if (locale !== 'american-to-british' && locale !== 'british-to-american') {
        return res.json({ error: 'Invalid value for locale field' });
      }

      // Translate the text with error handling
      try {
        const translation = translator.translate(text, locale);

        // Validate translation result
        if (translation === null) {
          return res.status(500).json({ error: 'Translation failed. Please try again.' });
        }

        // Return response with original text and translation
        res.json({
          text: text,
          translation: translation
        });
      } catch (error) {
        console.error('Translation error:', error);
        return res.status(500).json({ error: 'An error occurred during translation. Please try again.' });
      }
    });
};
