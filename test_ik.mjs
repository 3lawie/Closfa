const privateKey = "private_tjGPxz/w74+dButX/nTMI9CNL64="; // from .env
const auth = Buffer.from(privateKey + ":").toString("base64");

async function testImageKit() {
  const path = "Screenshot_2026-04-26_181950_EaL7BmYmM.png"; // example path
  const searchUrl = `https://api.imagekit.io/v1/files?searchQuery=name="${path}"`;
  console.log('Searching:', searchUrl);
  
  const res = await fetch(searchUrl, {
    headers: { Authorization: `Basic ${auth}` }
  });
  
  const data = await res.json();
  console.log(data);
}

testImageKit();
