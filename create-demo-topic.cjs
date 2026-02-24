const http = require('http');

// Create a topic
const createTopic = () => new Promise((resolve, reject) => {
  const data = JSON.stringify({
    title: 'Demo Topic - Clean Layout Test',
    content: '<p>This is a demo topic to show the clean bullet list layout. #demo #test #layout</p>'
  });

  const req = http.request({
    hostname: 'localhost',
    port: 8000,
    path: '/api/topics',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({ raw: body, status: res.statusCode });
      }
    });
  });
  req.on('error', reject);
  req.write(data);
  req.end();
});

// Create a blip
const createBlip = (waveId, parentId, content) => new Promise((resolve, reject) => {
  const data = JSON.stringify({
    waveId,
    parentId: parentId || null,
    content,
    authorName: 'Demo User'
  });

  const req = http.request({
    hostname: 'localhost',
    port: 8000,
    path: '/api/blips',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({ raw: body, status: res.statusCode });
      }
    });
  });
  req.on('error', reject);
  req.write(data);
  req.end();
});

async function main() {
  // Create topic
  const topic = await createTopic();
  console.log('Created topic:', topic.id || topic);

  if (!topic.id) {
    console.log('Failed to create topic');
    return;
  }

  const waveId = topic.id;

  // Create level 1 blips
  const blip1 = await createBlip(waveId, null, '<p>First main item - Project Overview</p>');
  console.log('Created blip 1:', blip1.id || blip1);

  const blip2 = await createBlip(waveId, null, '<p>Second main item - Technical Details</p>');
  console.log('Created blip 2:', blip2.id || blip2);

  const blip3 = await createBlip(waveId, null, '<p>Third main item - Action Items #todo</p>');
  console.log('Created blip 3:', blip3.id || blip3);

  // Create level 2 blips (children of blip1)
  if (blip1.id) {
    const blip1a = await createBlip(waveId, blip1.id, '<p>Sub-item: Goals and objectives</p>');
    console.log('Created blip 1a:', blip1a.id || blip1a);

    const blip1b = await createBlip(waveId, blip1.id, '<p>Sub-item: Timeline and milestones</p>');
    console.log('Created blip 1b:', blip1b.id || blip1b);

    // Create level 3 blips (children of blip1a)
    if (blip1a.id) {
      await createBlip(waveId, blip1a.id, '<p>Detail: Increase user engagement by 20%</p>');
      await createBlip(waveId, blip1a.id, '<p>Detail: Launch mobile app by Q2</p>');
      console.log('Created level 3 blips under 1a');
    }
  }

  // Create level 2 blips (children of blip2)
  if (blip2.id) {
    const blip2a = await createBlip(waveId, blip2.id, '<p>Architecture decisions</p>');
    const blip2b = await createBlip(waveId, blip2.id, '<p>Database schema changes</p>');
    const blip2c = await createBlip(waveId, blip2.id, '<p>API endpoints needed</p>');
    console.log('Created level 2 blips under 2');

    // Create level 3 under blip2a
    if (blip2a.id) {
      await createBlip(waveId, blip2a.id, '<p>Use React for frontend</p>');
      await createBlip(waveId, blip2a.id, '<p>Node.js backend with Express</p>');
      await createBlip(waveId, blip2a.id, '<p>CouchDB for persistence</p>');
      console.log('Created level 3 blips under 2a');
    }
  }

  // Create level 2 blips (children of blip3)
  if (blip3.id) {
    await createBlip(waveId, blip3.id, '<p>@john Review the design specs</p>');
    await createBlip(waveId, blip3.id, '<p>@sarah Set up CI/CD pipeline</p>');
    await createBlip(waveId, blip3.id, '<p>@team Schedule kickoff meeting</p>');
    console.log('Created level 2 blips under 3');
  }

  console.log('\n=== DONE ===');
  console.log('Topic ID:', waveId);
  console.log('View at: http://localhost:5173/?layout=rizzoma#/topic/' + waveId);
}

main().catch(console.error);
