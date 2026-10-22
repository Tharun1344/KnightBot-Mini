/**
 * Song Downloader - Download audio from YouTube
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
const { toAudio } = require('../../utils/converter');
const { downloadYouTubeAudio } = require('../../utils/ytDlp');

function looksLikeErrorPage(buffer) {
  const start = Buffer.from(buffer || []).subarray(0, 256).toString('utf8').trimStart().toLowerCase();
  return start.startsWith('<!doctype html') || start.startsWith('<html') || start.startsWith('{"error"') || start.startsWith('{"message"');
}

module.exports = {
  name: 'song',
  aliases: ['play', 'music', 'yta'],
  category: 'media',
  description: 'Download audio from YouTube',
  usage: '.song <song name or YouTube link>',
  
  async execute(sock, msg, args) {
    let video;
    try {
      const text = args.join(' ').trim();
      const chatId = msg.key.remoteJid;
      
      if (!text) {
        return await sock.sendMessage(chatId, { 
          text: 'Usage: .song <song name or YouTube link>' 
        }, { quoted: msg });
      }
      
      
      if (/^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(text)) {
        // A direct link may not have search metadata; don't try to send a missing thumbnail.
        video = { url: text, title: 'YouTube audio', thumbnail: null, timestamp: 'Unknown' };
      } else {
        const search = await yts(text);
        if (!Array.isArray(search?.videos) || !search.videos.length) {
          return await sock.sendMessage(chatId, { 
            text: 'No results found.' 
          }, { quoted: msg });
        }
        video = search.videos[0];
      }
      
      // Send a preview only when search metadata is available (direct links often omit it).
      const songTitle = video.title || 'YouTube audio';
      const previewText = `🎵 *Preparing audio*\n\n🎼 ${songTitle}${video.timestamp && video.timestamp !== 'Unknown' ? `\n⏱ ${video.timestamp}` : ''}`;
      if (video.thumbnail) {
        await sock.sendMessage(chatId, {
          image: { url: video.thumbnail },
          caption: previewText
        }, { quoted: msg });
      } else {
        await sock.sendMessage(chatId, { text: previewText }, { quoted: msg });
      }
      
      // Try multiple APIs with fallback chain
      let audioData;
      let audioBuffer;
      let downloadSuccess = false;
      
      // List of API methods to try
      const apiMethods = [
        { name: 'EliteProTech', method: () => APIs.getEliteProTechDownloadByUrl(video.url) },
        { name: 'Yupra', method: () => APIs.getYupraDownloadByUrl(video.url) },
        { name: 'Okatsu', method: () => APIs.getOkatsuDownloadByUrl(video.url) },
        { name: 'Izumi', method: () => APIs.getIzumiDownloadByUrl(video.url) }
      ];
      
      // Try each API until we successfully download audio
      for (const apiMethod of apiMethods) {
        try {
          audioData = await apiMethod.method();
          const audioUrl = audioData.download || audioData.dl || audioData.url;
          
          if (!audioUrl) {
            console.log(`${apiMethod.name} returned no download URL, trying next API...`);
            continue; // Try next API
          }
          
          // Try to download the audio file - arraybuffer first
          try {
            const audioResponse = await axios.get(audioUrl, {
              responseType: 'arraybuffer',
              timeout: 90000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              decompress: true,
              validateStatus: s => s >= 200 && s < 400,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'identity'
              }
            });
            audioBuffer = Buffer.from(audioResponse.data);
            
            // Some providers return an HTML/JSON error page with HTTP 200.
            if (audioBuffer.length > 0 && !looksLikeErrorPage(audioBuffer)) {
              downloadSuccess = true;
              break; // Success! Exit the loop
            }
            throw new Error('Provider returned an error page instead of audio');
          } catch (downloadErr) {
            // Check if it's a 451 error or other client/server error
            const statusCode = downloadErr.response?.status || downloadErr.status;
            if (statusCode === 451) {
              console.log(`Download blocked (451) from ${apiMethod.name}, trying next API...`);
              continue; // Try next API
            }
            
            // Try stream mode as fallback for this URL
            try {
              const audioResponse = await axios.get(audioUrl, {
                responseType: 'stream',
                timeout: 90000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                validateStatus: s => s >= 200 && s < 400,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': '*/*',
                  'Accept-Encoding': 'identity'
                }
              });
              const chunks = [];
              await new Promise((resolve, reject) => {
                audioResponse.data.on('data', c => chunks.push(c));
                audioResponse.data.on('end', resolve);
                audioResponse.data.on('error', reject);
              });
              audioBuffer = Buffer.concat(chunks);
              
              if (audioBuffer.length > 0 && !looksLikeErrorPage(audioBuffer)) {
                downloadSuccess = true;
                break; // Success! Exit the loop
              }
              throw new Error('Provider returned an error page instead of audio');
            } catch (streamErr) {
              // Stream mode also failed, try next API
              const streamStatusCode = streamErr.response?.status || streamErr.status;
              if (streamStatusCode === 451) {
                console.log(`Stream download blocked (451) from ${apiMethod.name}, trying next API...`);
              } else {
                console.log(`Stream download failed from ${apiMethod.name}:`, streamErr.message);
              }
              continue; // Try next API
            }
          }
        } catch (apiErr) {
          // API call failed, try next API
          console.log(`${apiMethod.name} API failed:`, apiErr.message);
          continue;
        }
      }
      
      // Self-hosted yt-dlp fallback avoids relying exclusively on third-party API
      // providers. Requires yt-dlp in PATH on the local PC/VPS.
      if (!downloadSuccess || !audioBuffer) {
        try {
          const fallback = await downloadYouTubeAudio(video.url);
          audioBuffer = fallback.buffer;
          audioData = { title: video.title || 'YouTube audio' };
          downloadSuccess = true;
        } catch (fallbackError) {
          throw new Error(`All audio sources failed. ${fallbackError.message}`);
        }
      }

      // Validate buffer
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Downloaded audio buffer is empty');
      }

      // Detect actual file format from signature
      const firstBytes = audioBuffer.slice(0, 12);
      const asciiSignature = firstBytes.toString('ascii', 4, 8);

      let actualMimetype = 'audio/mpeg';
      let fileExtension = 'mp3';
      let detectedFormat = 'unknown';

      // Check for MP4/M4A (ftyp box)
      if (asciiSignature === 'ftyp') {
        detectedFormat = 'M4A/MP4';
        actualMimetype = 'audio/mp4';
        fileExtension = 'm4a';
      }
      // Check for MP3 (ID3 tag or MPEG frame sync)
      else if (audioBuffer.toString('ascii', 0, 3) === 'ID3' || 
               (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
        detectedFormat = 'MP3';
        actualMimetype = 'audio/mpeg';
        fileExtension = 'mp3';
      }
      // Check for OGG/Opus
      else if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
        detectedFormat = 'OGG/Opus';
        actualMimetype = 'audio/ogg; codecs=opus';
        fileExtension = 'ogg';
      }
      // Check for WAV
      else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
        detectedFormat = 'WAV';
        actualMimetype = 'audio/wav';
        fileExtension = 'wav';
      }
      else {
        // Default to M4A since that's what the signature often suggests
        actualMimetype = 'audio/mp4';
        fileExtension = 'm4a';
        detectedFormat = 'Unknown (defaulting to M4A)';
      }

      // Convert to MP3 if not already MP3
      let finalBuffer = audioBuffer;
      let finalMimetype = 'audio/mpeg';
      let finalExtension = 'mp3';

      if (fileExtension !== 'mp3') {
        try {
          finalBuffer = await toAudio(audioBuffer, fileExtension);
          if (!finalBuffer || finalBuffer.length === 0) {
            throw new Error('Conversion returned empty buffer');
          }
          finalMimetype = 'audio/mpeg';
          finalExtension = 'mp3';
        } catch (convErr) {
          throw new Error(`Failed to convert ${detectedFormat} to MP3: ${convErr.message}`);
        }
      }

      // Send buffer as MP3
      await sock.sendMessage(chatId, {
        audio: finalBuffer,
        mimetype: finalMimetype,
        fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.${finalExtension}`,
        ptt: false
      }, { quoted: msg });

      // Cleanup: Delete temp files created during conversion
      try {
        const tempDir = path.join(__dirname, '../../temp');
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          const now = Date.now();
          files.forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
              const stats = fs.statSync(filePath);
              // Delete temp files older than 10 seconds (conversion temp files)
              if (now - stats.mtimeMs > 10000) {
                // Check if it's a temp audio file (mp3, m4a, or numeric timestamp files from converter)
                if (file.endsWith('.mp3') || file.endsWith('.m4a') || /^\d+\.(mp3|m4a)$/.test(file)) {
                  fs.unlinkSync(filePath);
                }
              }
            } catch (e) {
              // Ignore individual file errors
            }
          });
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
    } catch (err) {
      console.error('Song command error:', err);
      
      // Be transparent about regional/legal restrictions; never try to bypass them.
      const message = String(err.message || '').toLowerCase();
      const blocked = err.response?.status === 451 || err.status === 451 || /blocked|legal restrictions|all download sources failed/.test(message);
      const originalLink = video?.url ? `\n\n🔗 Open the official YouTube page: ${video.url}` : '';
      const errorMessage = blocked
        ? `⚠️ I couldn't retrieve this audio from the available providers. It may be restricted in your region, unavailable, or the provider may be offline. I can't bypass copyright or regional restrictions.${originalLink}`
        : `⚠️ I couldn't complete the audio request. Please try again later or open the track on YouTube.${originalLink}`;
      
      await sock.sendMessage(msg.key.remoteJid, { text: errorMessage }, { quoted: msg });
    }
  }
};