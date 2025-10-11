#!/usr/bin/env node
// One-off fixer: given MESSAGE_ID in env FIX_MSG_ID, normalize m.icon to an array
// Usage: FIX_MSG_ID=msg_... node tools/fix_message_icon_by_id.cjs
import driver from "../db/driver.js";
import emojiRegex from "emoji-regex";

async function run() {
  const id = process.env.FIX_MSG_ID;
  if (!id) {
    console.error("Please set FIX_MSG_ID env var to the message id to fix");
    process.exit(1);
  }
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (m:Message {id:$id}) RETURN m LIMIT 1`,
      { id }
    );
    if (!res.records || res.records.length === 0) {
      console.error("Message not found", id);
      return;
    }
    const m = res.records[0].get("m").properties;
    const text = m.text || "";
    const currentIcon = m.icon;

    console.log("Current icon for", id, "->", currentIcon);

    // If icon is already an array, leave it
    if (Array.isArray(currentIcon)) {
      console.log("Icon already array, nothing to do");
      return;
    }

    // If icon is a non-empty string, try to extract emojis from it
    let finalIcons = [];
    if (typeof currentIcon === "string" && currentIcon.trim().length > 0) {
      finalIcons = currentIcon.match(emojiRegex()) || [];
    }

    // If still empty, extract from text
    if (finalIcons.length === 0 && typeof text === "string") {
      finalIcons = text.match(emojiRegex()) || [];
    }

    if (finalIcons.length === 0) {
      console.log("No icons found to set for message", id);
      await session.run(`MATCH (m:Message {id:$id}) SET m.icon = [] RETURN m`, {
        id,
      });
      console.log("Set empty array");
      return;
    }

    // Persist as array
    await session.run(
      `MATCH (m:Message {id:$id}) SET m.icon = $icons RETURN m`,
      { id, icons: finalIcons }
    );
    console.log("Updated message", id, "icon ->", finalIcons);
  } catch (e) {
    console.error("Failed to fix message", e);
  } finally {
    await session.close();
    await driver.close();
  }
}

run();
