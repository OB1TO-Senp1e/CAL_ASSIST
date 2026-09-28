require("dotenv").config();
function pwinfo(name, url) {
  const m = url.match(/^(postgres(?:ql)?:\/\/[^:]+:)(.*)(@.+)$/);
  if (!m) return console.log(name + " parse fail");
  const pw = m[2];
  let out = name + " len=" + pw.length + " specials: ";
  for (let i = 0; i < pw.length; i++) { const c = pw[i]; if (!/[A-Za-z0-9]/.test(c)) out += c + "(U+" + c.codePointAt(0).toString(16) + ")@" + i + " "; }
  console.log(out);
}
pwinfo("DATABASE_URL", process.env.DATABASE_URL);
pwinfo("DIRECT_URL", process.env.DIRECT_URL);
