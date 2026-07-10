const http = require('http');
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiLliJjoiKrnjq4iLCJpYXQiOjE3ODM1ODE5NTMsImV4cCI6MTc4NDE4Njc1M30.kg3eRYl4AqaLJoL-HxvtP2INrhHK3Uguk-jCyJA-zdA';
const API = 'http://localhost:5174/api';

function fetchDoc(id) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${API}/text/get/${id}`);
        const req = http.get(url.toString(), { headers: { Authorization: `Bearer ${TOKEN}` } }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const d = JSON.parse(body);
                    resolve({ id, title: d.data?.title || '', content: d.data?.content || '' });
                } catch(e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

async function main() {
    const ids = [40, 50, 70, 75, 80, 85, 105, 110];
    const docs = [];
    for (const id of ids) {
        try {
            const doc = await fetchDoc(id);
            if (doc.content.length > 0) {
                docs.push(doc);
                console.log(`Fetched: id=${doc.id} title="${doc.title.slice(0,20)}" len=${doc.content.length}`);
            }
        } catch(e) {
            console.log(`Failed: id=${id} ${e.message}`);
        }
    }
    console.log(`\nTotal: ${docs.length} documents\n`);

    // Write summary to stdout
    docs.forEach(d => {
        const hasImg = d.content.includes('minio:');
        const hasTbl = d.content.includes('|');
        const hasCode = d.content.includes('```');
        console.log(`  id=${d.id} len=${d.content.length} img=${hasImg} tbl=${hasTbl} code=${hasCode} title="${d.title.slice(0,30)}"`);
    });

    // Save to file for the next step
    require('fs').writeFileSync('/tmp/migration-test-docs.json', JSON.stringify(docs));
    console.log(`\nSaved ${docs.length} docs to /tmp/migration-test-docs.json`);
}

main().catch(console.error);
