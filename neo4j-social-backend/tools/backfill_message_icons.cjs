#!/usr/bin/env node
// Backfill script: extract first emoji from message.text and set m.icon where missing
import driver from "../db/driver.js";
import emojiRegex from "emoji-regex";

async function run() {
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (m:Message) WHERE coalesce(m.icon, '') = '' RETURN m.id AS id, m.text AS text LIMIT 1000`
    );
    console.log("Found", res.records.length, "messages to check");
    for (const r of res.records) {
      const id = r.get("id");
      const text = r.get("text") || "";
      const re = emojiRegex();
      const match = re.exec(text);
      const icon = match && match[0] ? match[0] : "";
      if (icon && icon.length > 0) {
        await session.run(
          `MATCH (m:Message {id:$id}) SET m.icon = $icon RETURN m`,
          { id, icon }
        );
        console.log(`Updated ${id} -> icon='${icon}'`);
      }
    }
    console.log("Backfill complete");
  } catch (e) {
    console.error("Backfill failed", e);
  } finally {
    await session.close();
    await driver.close();
  }
}

run();
