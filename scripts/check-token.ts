import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const envPath = path.resolve(__dirname, '../.ENV');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^['"]|['"]$/g, '');
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    });
}

const token = process.env.ONEDRIVE_TOKEN || process.env.GRAPH_TOKEN;

if (!token) {
    console.error('❌ Error: ONEDRIVE_TOKEN or GRAPH_TOKEN not found in environment or .ENV file.');
    process.exit(1);
}

console.log('🔄 Verifying Microsoft Graph Token...');

const options = {
    hostname: 'graph.microsoft.com',
    path: '/v1.0/me',
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'node-script'
    }
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            try {
                const body = JSON.parse(data);
                console.log(`✅ Token is valid. User: ${body.userPrincipalName || body.displayName || 'Unknown'}`);
                process.exit(0);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error('❌ Error parsing response:', msg);
                process.exit(1);
            }
        } else {
            console.error(`❌ Token verification failed. Update .ENV file with a valid token. Status: ${res.statusCode}`);
            console.error('Response:', data);
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error(`❌ Request error: ${e.message}`);
    process.exit(1);
});

req.end();
