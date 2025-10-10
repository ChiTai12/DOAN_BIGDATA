import emojiRegex from "emoji-regex";

const text = "GOAT ƠI CỨU TÔI 😌";
console.log("Text:", text);
console.log(
  "Chars:",
  Array.from(text).map((c) => c.codePointAt(0).toString(16))
);
const re = emojiRegex();
const match = re.exec(text);
console.log("Match:", match);
if (match)
  console.log(
    "Matched:",
    match[0],
    Array.from(match[0]).map((c) => c.codePointAt(0).toString(16))
  );
