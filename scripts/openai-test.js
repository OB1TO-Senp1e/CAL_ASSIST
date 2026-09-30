// override:true because process-level OPENAI_BASE_URL/OPENAI_API_KEY (tokenharbor) shadow .env
require("dotenv").config({ override: true });
const url = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
fetch(url + "/models", {
  headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
})
  .then(async (r) => {
    const t = await r.text();
    console.log("base=" + url + " -> HTTP " + r.status);
    if (r.ok) {
      const ids = JSON.parse(t).data.map((m) => m.id).slice(0, 6);
      console.log("key VALID; sample models: " + ids.join(", "));
    } else {
      console.log(t.slice(0, 300));
    }
  })
  .catch((e) => console.log("FETCH FAIL: " + e.message));
