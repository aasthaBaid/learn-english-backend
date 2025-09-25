// backend/prepare-dictionary.js
const fs = require('fs');
const path = require('path');

console.log("Starting dictionary preparation...");

const csvPath = path.join(__dirname, 'dict.csv');
const outputPath = path.join(__dirname, 'wordlist.json');

// Read the large CSV file
const fileContent = fs.readFileSync(csvPath, 'utf8');
const lines = fileContent.split('\n');

// Extract just the words (the first part of each line before the first comma)
const words = lines
    .map(line => line.split(',')[0].trim()) // Get the first column and trim whitespace
    .filter(word => word && word.length > 2 && /^[a-zA-Z]+$/.test(word)); // Filter out empty lines, short words, and non-alphabetic words

// Create a unique set of words and convert back to an array
const uniqueWords = [...new Set(words)];

// Save the simplified word list to a new file
fs.writeFileSync(outputPath, JSON.stringify(uniqueWords, null, 2));

console.log(`Dictionary prepared! ${uniqueWords.length} unique words saved to wordlist.json.`);