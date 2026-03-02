import * as fs from 'fs';
import * as path from 'path';

const clientId = 'e5f346a8-8996-4d46-9f93-6e6817d9078e';
const tenantId = '3e8159db-a172-4a3a-93b2-19d62ae430da';

async function runDeviceLogin() {
    const authority = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;

    // 1. Get device code
    const deviceCodeParams = new URLSearchParams();
    deviceCodeParams.append('client_id', clientId);
    deviceCodeParams.append('scope', 'Files.ReadWrite.All User.Read offline_access');

    let deviceCodeRes;
    try {
        deviceCodeRes = await fetch(`${authority}/devicecode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: deviceCodeParams.toString()
        });
    } catch (e) {
        console.error("Network error executing fetch request:", e);
        return;
    }

    const deviceCodeData = await deviceCodeRes.json();
    if (!deviceCodeRes.ok) {
        console.error('❌ Failed to start device login:', deviceCodeData);
        console.error('\nNOTE: Your Azure App must have "Allow public client flows" enabled in Authentication settings for Device Code flow to work.');
        return;
    }

    console.log('\n====================================================');
    console.log(deviceCodeData.message);
    console.log('====================================================\n');

    // 2. Poll for token
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
    tokenParams.append('client_id', clientId);
    tokenParams.append('device_code', deviceCodeData.device_code);

    let polling = true;
    while (polling) {
        await new Promise(resolve => setTimeout(resolve, deviceCodeData.interval * 1000));

        const tokenRes = await fetch(`${authority}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: tokenParams.toString()
        });

        const tokenData = await tokenRes.json();

        if (tokenRes.ok) {
            console.log('\n✅ Successfully authenticated!');

            // Save to .ENV
            const envPath = path.resolve(__dirname, '../.ENV');
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
            if (envContent.includes('ONEDRIVE_TOKEN=')) {
                envContent = envContent.replace(/ONEDRIVE_TOKEN=[^\n]*/, `ONEDRIVE_TOKEN=${tokenData.access_token}`);
            } else {
                envContent += `\nONEDRIVE_TOKEN=${tokenData.access_token}\n`;
            }
            fs.writeFileSync(envPath, envContent);
            console.log('✅ Updated .ENV with your new ONEDRIVE_TOKEN');
            console.log('You can now run: npm run test:real');
            polling = false;
        } else if (tokenData.error !== 'authorization_pending') {
            console.error('\n❌ Login failed:', tokenData.error_description || tokenData.error);
            polling = false;
        } else {
            process.stdout.write('.');
        }
    }
}

runDeviceLogin();
