import { config } from "../config.js";

export async function queryRecentB20Creations(limit = 20) {
  if (!config.CDP_SQL_API_KEY) {
    return {
      source: "mock",
      rows: []
    };
  }

  const sql = `
    SELECT
      block_timestamp,
      transaction_hash,
      parameters['token'] AS token_address,
      parameters['name'] AS name,
      parameters['symbol'] AS symbol,
      parameters['decimals'] AS decimals
    FROM base.events
    WHERE event_signature = 'B20Created(address,uint8,string,string,uint8,bytes)'
      AND address = '0xB20f000000000000000000000000000000000000'
      AND action = 'added'
    ORDER BY block_timestamp DESC
    LIMIT ${Math.min(Math.max(limit, 1), 100)};
  `;

  const response = await fetch(config.CDP_SQL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.CDP_SQL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    throw new Error(`CDP SQL API failed with ${response.status}`);
  }

  return {
    source: "cdp-sql-api",
    rows: await response.json()
  };
}
