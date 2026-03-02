import express from 'express';

const app = express();
const port = 8080;

app.use(express.static(__dirname));

app.listen(port, () => {
    console.log(`Login example running at http://localhost:${port}/microsoft-login.html`);
    console.log('NOTE: Ensure "http://localhost:8080/microsoft-login.html" is added as a Redirect URI in your Microsoft Entra ID app registration (SPA).');
});
