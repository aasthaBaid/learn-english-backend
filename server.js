// backend/server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// --- File Paths ---
const WORDLIST_PATH = path.join(__dirname, 'wordlist.json');
const USED_WORDS_PATH = path.join(__dirname, 'used_words.json');
const HISTORY_PATH = path.join(__dirname, 'history.json'); // Changed from daily_words.json

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Helper Functions ---
async function loadJsonFile(filePath, defaultValue = {}) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return defaultValue;
        }
        throw error;
    }
}

async function saveJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function getWordDetails(word) {
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        if (!response.ok) return null;
        const data = await response.json();
        const entry = data[0];

        return {
            word: entry.word,
            pronunciation: entry.phonetic || (entry.phonetics.find(p => p.text) || {}).text || '',
            audio: (entry.phonetics.find(p => p.audio && p.audio.length > 0) || {}).audio || '',
            meaning: entry.meanings[0]?.definitions[0]?.definition || 'No definition available.',
            example: entry.meanings[0]?.definitions.find(d => d.example)?.example || 'No example sentence available.',
            synonyms: entry.meanings[0]?.synonyms || [],
            antonyms: entry.meanings[0]?.antonyms || [],
        };
    } catch (error) {
        console.error(`Error fetching details for "${word}":`, error);
        return null;
    }
}

/**
 * The main function to generate words for the current day if they don't exist.
 */
async function updateDailyWords() {
    console.log('Checking for daily word update...');
    const today = new Date().toISOString().slice(0, 10); // Get date in YYYY-MM-DD format

    const history = await loadJsonFile(HISTORY_PATH);
    if (history[today]) {
        console.log(`Words for ${today} already exist. No update needed.`);
        return;
    }

    console.log(`Generating new words for ${today}...`);
    const allWords = await loadJsonFile(WORDLIST_PATH, []);
    const usedWords = new Set(await loadJsonFile(USED_WORDS_PATH, []));
    const availableWords = allWords.filter(word => !usedWords.has(word));

    if (availableWords.length < 3) {
        console.warn("Not enough new words available!");
        return;
    }

    let newWords = [];
    while (newWords.length < 3 && availableWords.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableWords.length);
        const selectedWord = availableWords.splice(randomIndex, 1)[0];

        const details = await getWordDetails(selectedWord);
        if (details) {
            newWords.push(details);
            usedWords.add(selectedWord);
        }
    }

    if (newWords.length === 3) {
        history[today] = newWords; // Add new words to history with today's date as key
        await saveJsonFile(HISTORY_PATH, history);
        await saveJsonFile(USED_WORDS_PATH, [...usedWords]);
        console.log(`Successfully generated and saved words for ${today}:`, newWords.map(w => w.word).join(', '));
    } else {
        console.error('Failed to fetch details for 3 new words.');
    }
}

// --- API Endpoints ---

// NEW: Endpoint to get the list of all dates with words
app.get('/api/history', async (req, res) => {
    try {
        const history = await loadJsonFile(HISTORY_PATH);
        const dates = Object.keys(history).sort((a, b) => b.localeCompare(a)); // Sort dates, newest first
        res.json(dates);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load history.' });
    }
});

// NEW: Endpoint to get words for a specific date
app.get('/api/words/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const history = await loadJsonFile(HISTORY_PATH);
        if (history[date]) {
            res.json(history[date]);
        } else {
            res.status(404).json({ error: 'No words found for this date.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to load words.' });
    }
});

// --- Scheduler & Initial Run ---
// Schedule to run at 12:01 AM each day to generate words for the new day.
cron.schedule('1 0 * * *', updateDailyWords, { timezone: "Etc/UTC" });

app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
    // Check for words on startup.
    updateDailyWords();
});