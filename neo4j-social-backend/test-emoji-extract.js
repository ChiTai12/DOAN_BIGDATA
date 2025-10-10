import emojiRegex from "emoji-regex";

// Test emoji extraction logic
function testEmojiExtract() {
  const texts = [
    "ádasd 😠",
    "☺️",
    "Hello 👋 world 🌍",
    "No emoji here",
    "Multiple 😀 emojis 😃 here 😄",
  ];

  console.log("Testing emoji extraction:");

  texts.forEach((text) => {
    try {
      const re = emojiRegex();
      const match = re.exec(text);
      const icon = match && match[0] ? match[0] : "";
      console.log(`Text: "${text}" -> Icon: "${icon}"`);
    } catch (e) {
      console.log(`Text: "${text}" -> Error:`, e);
    }
  });
}

testEmojiExtract();
