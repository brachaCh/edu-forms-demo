const fs = require("fs");
const path = require("path");
const dir = path.join(process.env.TEMP, "matoah-docx-extract");
const f = path.join(dir, "clean_תיק_שילוב_1_.docx.txt");
const t = fs.readFileSync(f, "utf8").split(/\n/);
for (let i = 0; i < t.length; i++) {
  if (/תח|מצב נוכחי|מטרת על|יעדים|דרכי|חתימת|מידע על התלמיד|ויתור/.test(t[i])) {
    console.log(i + ": " + t[i]);
  }
}
console.log("--- personal basket tachi ---");
const f2 = path.join(dir, "clean_תיק_סל_אישי_1_.docx.txt");
const t2 = fs.readFileSync(f2, "utf8").split(/\n/);
for (let i = 0; i < t2.length; i++) {
  if (/תח|מצב נוכחי|מטרת על|יעדים|כרטיס תלמיד|ויתור|מידע/.test(t2[i])) {
    console.log(i + ": " + t2[i]);
  }
}
