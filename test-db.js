import dotenv from 'dotenv';
dotenv.config();

async function checkDb() {
  const TURSO_URL = process.env.TURSO_URL;
  const TURSO_TOKEN = process.env.TURSO_TOKEN;

  const payload = JSON.stringify({
    requests: [
      {
        type: "execute",
        stmt: { sql: "SELECT * FROM user_stats LIMIT 5;" }
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

  const json = await tursoRes.json();
  console.log(JSON.stringify(json.results[0].response.result.rows, null, 2));
}

checkDb();
