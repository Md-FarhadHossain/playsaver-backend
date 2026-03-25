import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Allow requests from Chrome extensions and localhost
app.use(cors({
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());


const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_TOKEN;

app.post('/api/sync-time', async (req, res) => {
    console.log('[sync-time] Request received from origin:', req.headers.origin || 'no-origin');
    try {
        const { googleToken, pushMs } = req.body;

        if (!googleToken) {
            return res.status(401).json({ error: 'Missing Google Token' });
        }

        if (typeof pushMs !== 'number' || pushMs <= 0) {
            return res.status(400).json({ error: 'Invalid pushMs' });
        }

        // 1. Verify Google Token (fetch user profile)
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${googleToken}` }
        });

        if (!googleRes.ok) {
            return res.status(401).json({ error: 'Invalid Google Token' });
        }

        const profile = await googleRes.json();
        
        if (!profile.id) {
            return res.status(401).json({ error: 'Invalid User Profile' });
        }

        // 2. Sync to Turso DB
        const payload = JSON.stringify({
            requests: [
                {
                    type: "execute",
                    stmt: { sql: "CREATE TABLE IF NOT EXISTS user_stats (user_id TEXT PRIMARY KEY, email TEXT, name TEXT, total_ms INTEGER, synced_at DATETIME DEFAULT CURRENT_TIMESTAMP);" }
                },
                {
                    type: "execute",
                    stmt: {
                        sql: "INSERT INTO user_stats (user_id, email, name, total_ms, synced_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET total_ms = total_ms + excluded.total_ms, email = excluded.email, name = excluded.name, synced_at = CURRENT_TIMESTAMP RETURNING total_ms;",
                        args: [
                            { type: "text",    value: profile.id },
                            { type: "text",    value: profile.email || "" },
                            { type: "text",    value: profile.name  || "" },
                            { type: "integer", value: "" + pushMs }
                        ]
                    }
                },
                { type: "close" }
            ]
        });

        const tursoRes = await fetch(`${TURSO_URL}/v2/pipeline`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${TURSO_TOKEN}`, 
                'Content-Type': 'application/json' 
            },
            body: payload
        });

        if (!tursoRes.ok) {
            const errText = await tursoRes.text();
            console.error("Turso error:", errText);
            return res.status(500).json({ error: 'Database error' });
        }

        const jsonRes = await tursoRes.json();
        const rows = jsonRes?.results?.[1]?.response?.result?.rows;
        let trueTotalMs = 0;
        
        if (rows && rows.length > 0) {
            trueTotalMs = parseInt(rows[0][0]?.value || '0', 10);
        }

        return res.json({ success: true, totalSavedMs: trueTotalMs });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api', (req, res) => {
    res.json({ message: 'Time Server API is running.' });
});


// Start server for local testing, but export for Vercel Serverless
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

export default app;
