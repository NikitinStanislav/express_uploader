const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== ENV =====
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;
const API_KEY = process.env.API_KEY;

// ===== COUNTER =====
const COUNTER_FILE = './counter.json';

function nextFactNumber() {
  if (!fs.existsSync(COUNTER_FILE)) {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: 0 }));
  }
  const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  data.count += 1;
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(data));
  return data.count;
}

// ===== OAUTH =====
function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: YOUTUBE_REFRESH_TOKEN
  });

  return oauth2Client;
}

// ===== DOWNLOAD =====
async function downloadVideo(videoUrl, destPath) {
  console.log(`[DOWNLOAD] Starting download from: ${videoUrl}`);

  const response = await axios({
    method: 'GET',
    url: videoUrl,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      console.log(`[DOWNLOAD] Video saved to: ${destPath}`);
      resolve();
    });
    writer.on('error', reject);
  });
}

// ===== YOUTUBE UPLOAD =====
async function uploadToYouTube(filePath, title, description) {
  console.log('[YOUTUBE] Authenticating with OAuth2...');

  const auth = getOAuth2Client();
  const youtube = google.youtube({ version: 'v3', auth });

  console.log('[YOUTUBE] Starting video upload...');
  console.log(`[YOUTUBE] Title: ${title}`);

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description: `${description}\n\n#Shorts`,
        categoryId: '22'
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    },
    media: {
      body: fs.createReadStream(filePath)
    }
  });

  console.log(`[YOUTUBE] Upload successful! Video ID: ${response.data.id}`);
  return response.data;
}

// ===== ROUTES =====
app.post('/upload', async (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { video_url, description } = req.body;
  if (!video_url || !description) {
    return res.status(400).json({
      success: false,
      error: 'Missing video_url or description'
    });
  }

  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    return res.status(500).json({
      success: false,
      error: 'Server misconfiguration: Missing YouTube API credentials'
    });
  }

  const videoPath = '/tmp/video.mp4';

  try {
    await downloadVideo(video_url, videoPath);

    const n = nextFactNumber();
    const title = `Daily Fact #${n} #Shorts`;

    const result = await uploadToYouTube(videoPath, title, description);

    fs.unlinkSync(videoPath);

    return res.json({
      success: true,
      fact_number: n,
      video_id: result.id,
      youtube_url: `https://www.youtube.com/shorts/${result.id}`
    });

  } catch (err) {
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===== START =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] YouTube Shorts uploader running on port ${PORT}`);
});
