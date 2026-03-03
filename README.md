# microsoft-onedrive-mock

<br />

<p style="text-align: center;">
Mock-Server that simulates being Microsoft OneDrive (Graph API).<br />
Used for testing the <a href="https://rxdb.info/" target="_blank">RxDB OneDrive-Sync</a>.<br />
Mostly Vibe-Coded.<br />
</p>

## Installation

```bash
npm install microsoft-onedrive-mock
```

## Usage

```typescript
import { startServer } from 'microsoft-onedrive-mock';

// start the server
const port = 3000;
const server = startServer(port);

// Read the drive root
const readResponse = await fetch(`http://localhost:3000/v1.0/me/drive/root`, {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer valid-token'
    }
});
const folderContent = await readResponse.json();
console.log('Read Root:', folderContent);

// Stop the server
server.close();

```

## Tech

- TypeScript
- Express
- Vitest

## Browser Testing

To run tests inside a headless browser (Chromium):

```bash
npm run test:browser
```

## Real Microsoft Graph API Testing

To run tests against the real Microsoft Graph / OneDrive API instead of the mock:

1. Create a `.ENV` file (see `.ENV_EXAMPLE`):
   ```
   TEST_TARGET=real
   ONEDRIVE_TOKEN=your-access-token
   ```
2. You can generate a valid `ONEDRIVE_TOKEN` quickly by running the included login script and following the browser prompts:
   ```bash
   npm run example:login
   ```
3. Run tests:
   ```bash
   npm run test:real
   ```

## Contributing

GitHub issues for this project are closed. If you find a bug, please create a Pull Request with a test case reproducing the issue.